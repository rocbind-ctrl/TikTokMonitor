import time

from app.config import get_tiktok_settings
from app.models import TikTokUserData
from app.providers.direct import DirectProvider
from app.providers.tikwm import TikwmProvider
from app.providers.ytdlp import YtDlpProvider
from app.utils import normalize_username


class TikTokScraper:
    """无需 TikTok 登录，自动组合多数据源获取账号与播放量。"""

    def __init__(self, timeout: float = 30.0, provider: str | None = None):
        settings = get_tiktok_settings()
        self.timeout = timeout
        self.provider_name = (provider or settings.get("provider", "auto")).lower()
        self.api_base = str(settings.get("api_base", "https://tikwm.com/api") or "https://tikwm.com/api")
        self.proxy = str(settings.get("proxy", "") or "")

    def fetch_user(self, username: str, max_videos: int = 50) -> TikTokUserData:
        username = normalize_username(username)
        if not username:
            raise ValueError("用户名不能为空，请输入 TikTok 用户名或主页链接")

        if self.provider_name == "direct":
            data = DirectProvider(proxy=self.proxy, timeout=self.timeout).fetch_user(username, max_videos)
            data.sources_used = ["direct"]
            return data

        if self.provider_name == "tikwm":
            data = TikwmProvider(
                api_base=self.api_base, proxy=self.proxy, timeout=self.timeout
            ).fetch_user(username, max_videos)
            data.sources_used = ["tikwm"]
            return data

        if self.provider_name == "ytdlp":
            return self._fetch_ytdlp(username, max_videos)

        return self._fetch_auto(username, max_videos)

    def _fetch_ytdlp(self, username: str, max_videos: int) -> TikTokUserData:
        sources: list[str] = []
        profile = self._fetch_profile(username, sources)
        videos = YtDlpProvider(proxy=self.proxy, timeout=max(self.timeout, 60)).fetch_videos(
            username, max_videos
        )
        sources.append("ytdlp")
        profile.videos = videos
        profile.sources_used = sources
        if not videos:
            profile.warning = "未能获取视频列表，请稍后重试"
        return profile

    def _fetch_auto(self, username: str, max_videos: int) -> TikTokUserData:
        sources: list[str] = []
        profile = self._fetch_profile(username, sources)
        errors: list[str] = []
        videos = []

        t0 = time.time()
        try:
            videos = YtDlpProvider(proxy=self.proxy, timeout=max(self.timeout, 60)).fetch_videos(
                username, max_videos
            )
            if videos:
                sources.append("ytdlp")
        except Exception as exc:
            errors.append(f"视频抓取: {exc}")

        if not videos:
            try:
                tikwm = TikwmProvider(api_base=self.api_base, proxy=self.proxy, timeout=self.timeout)
                videos = tikwm._user_posts(username, max_videos)
                if videos:
                    sources.append("tikwm-posts")
            except Exception as exc:
                errors.append(f"tikwm: {exc}")

        profile.videos = videos
        profile.sources_used = sources

        if not profile.follower_count and not videos:
            hint = "请检查用户名是否正确，或配置 config.yaml 中的 proxy"
            if errors:
                raise RuntimeError(f"数据获取失败: {'; '.join(errors)}。{hint}")
            raise RuntimeError(f"未能获取 @{username} 的数据。{hint}")

        if not videos and errors:
            profile.warning = f"账号信息已更新，但视频播放量获取失败（{errors[0]}）"
        elif not profile.follower_count and videos:
            profile.warning = "已获取视频播放量，粉丝数暂不可用"

        return profile

    def _fetch_profile(self, username: str, sources: list[str]) -> TikTokUserData:
        try:
            data = TikwmProvider(
                api_base=self.api_base, proxy=self.proxy, timeout=self.timeout
            ).fetch_profile(username)
            sources.append("tikwm-profile")
            return data
        except Exception:
            data = DirectProvider(proxy=self.proxy, timeout=self.timeout).fetch_user(username, 0)
            sources.append("direct")
            return data
