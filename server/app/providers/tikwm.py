import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.models import TikTokUserData, TikTokVideoData

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

REQUEST_INTERVAL = 1.1


class TikwmProvider:
    """通过 tikwm.com 公开 API 获取账号信息（无需 TikTok 登录）。"""

    name = "tikwm"

    def __init__(self, api_base: str = "https://tikwm.com/api", proxy: str = "", timeout: float = 30.0):
        self.api_base = api_base.rstrip("/")
        self.proxy = proxy.strip()
        self.timeout = timeout
        self._last_request_at = 0.0

    def fetch_user(self, username: str, max_videos: int = 50) -> TikTokUserData:
        user_info = self._user_info(username)
        user = user_info.get("user", {})
        stats = user_info.get("stats", {})

        videos: list[TikTokVideoData] = []
        try:
            videos = self._user_posts(username, max_videos)
        except Exception:
            pass

        return TikTokUserData(
            username=username,
            nickname=user.get("nickname", username),
            sec_uid=user.get("secUid", ""),
            follower_count=int(stats.get("followerCount", 0) or 0),
            following_count=int(stats.get("followingCount", 0) or 0),
            total_likes=int(stats.get("heartCount", stats.get("heart", 0)) or 0),
            video_count=int(stats.get("videoCount", 0) or 0),
            avatar_url=user.get("avatarLarger", user.get("avatarMedium", "")) or "",
            videos=videos,
        )

    def fetch_profile(self, username: str) -> TikTokUserData:
        user_info = self._user_info(username)
        user = user_info.get("user", {})
        stats = user_info.get("stats", {})

        return TikTokUserData(
            username=username,
            nickname=user.get("nickname", username),
            sec_uid=user.get("secUid", ""),
            follower_count=int(stats.get("followerCount", 0) or 0),
            following_count=int(stats.get("followingCount", 0) or 0),
            total_likes=int(stats.get("heartCount", stats.get("heart", 0)) or 0),
            video_count=int(stats.get("videoCount", 0) or 0),
            avatar_url=user.get("avatarLarger", user.get("avatarMedium", "")) or "",
            videos=[],
        )

    def _throttle(self) -> None:
        elapsed = time.time() - self._last_request_at
        if elapsed < REQUEST_INTERVAL:
            time.sleep(REQUEST_INTERVAL - elapsed)
        self._last_request_at = time.time()

    def _request(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        self._throttle()
        kwargs: dict = {"timeout": self.timeout}
        if self.proxy:
            kwargs["proxy"] = self.proxy

        url = f"{self.api_base}/{path.lstrip('/')}"
        with httpx.Client(headers=DEFAULT_HEADERS, **kwargs) as client:
            response = client.post(url, params=params)
            response.raise_for_status()
            payload = response.json()

        code = payload.get("code")
        if code not in (0, None):
            raise RuntimeError(payload.get("msg") or f"tikwm 返回错误 code={code}")

        data = payload.get("data")
        if data is None:
            raise RuntimeError("tikwm 返回空数据")
        return data

    def _user_info(self, username: str) -> dict[str, Any]:
        return self._request("user/info", {"unique_id": username})

    def _user_posts(self, username: str, max_videos: int) -> list[TikTokVideoData]:
        videos: list[TikTokVideoData] = []
        cursor = "0"
        has_more = True

        while has_more and len(videos) < max_videos:
            count = min(30, max_videos - len(videos))
            data = self._request(
                "user/posts",
                {"unique_id": username, "count": str(count), "cursor": cursor},
            )
            for item in data.get("videos") or []:
                video = self._parse_post(item)
                if video:
                    videos.append(video)
                if len(videos) >= max_videos:
                    break

            has_more = bool(data.get("hasMore"))
            cursor = str(data.get("cursor") or "0")
            if not data.get("videos"):
                break

        return videos[:max_videos]

    def _parse_post(self, item: dict[str, Any]) -> TikTokVideoData | None:
        video_id = str(item.get("video_id") or item.get("id") or "")
        if not video_id:
            return None

        create_time = item.get("create_time")
        published_at = None
        if create_time:
            try:
                published_at = datetime.fromtimestamp(int(create_time), tz=timezone.utc)
            except (TypeError, ValueError):
                published_at = None

        return TikTokVideoData(
            video_id=video_id,
            title=item.get("title", "") or "",
            cover_url=item.get("cover", item.get("origin_cover", "")) or "",
            play_count=int(item.get("play_count", 0) or 0),
            like_count=int(item.get("digg_count", 0) or 0),
            comment_count=int(item.get("comment_count", 0) or 0),
            share_count=int(item.get("share_count", 0) or 0),
            published_at=published_at,
        )
