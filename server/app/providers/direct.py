import json
import re
from typing import Any

import httpx

from app.models import TikTokUserData, TikTokVideoData

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.tiktok.com/",
}


class DirectProvider:
    """直连 TikTok 公开页面，仅获取账号基础信息（备用）。"""

    name = "direct"

    def __init__(self, proxy: str = "", timeout: float = 30.0):
        self.proxy = proxy.strip()
        self.timeout = timeout

    def fetch_user(self, username: str, max_videos: int = 50) -> TikTokUserData:
        profile_url = f"https://www.tiktok.com/@{username}"
        kwargs: dict = {"headers": DEFAULT_HEADERS, "timeout": self.timeout, "follow_redirects": True}
        if self.proxy:
            kwargs["proxy"] = self.proxy

        with httpx.Client(**kwargs) as client:
            response = client.get(profile_url)
            response.raise_for_status()
            return self._parse_profile_html(username, response.text)

    def _parse_profile_html(self, username: str, html: str) -> TikTokUserData:
        payload = self._extract_rehydration_data(html)
        user_info, video_items = self._extract_user_and_videos(payload, username)

        videos: list[TikTokVideoData] = []
        for item in video_items:
            video = self._parse_video_item(item)
            if video:
                videos.append(video)

        return TikTokUserData(
            username=username,
            nickname=user_info.get("nickname", username),
            sec_uid=user_info.get("secUid", ""),
            follower_count=int(user_info.get("followerCount", 0) or 0),
            following_count=int(user_info.get("followingCount", 0) or 0),
            total_likes=int(user_info.get("heartCount", user_info.get("heart", 0)) or 0),
            video_count=int(user_info.get("videoCount", 0) or 0),
            avatar_url=user_info.get("avatarLarger", user_info.get("avatarMedium", "")) or "",
            videos=videos,
            warning="直连模式仅获取到账号基础信息，视频播放量请使用 tikwm 数据源" if not videos else "",
        )

    def _extract_rehydration_data(self, html: str) -> dict[str, Any]:
        match = re.search(
            r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">(.*?)</script>',
            html,
            re.DOTALL,
        )
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        return {}

    def _extract_user_and_videos(
        self, payload: dict[str, Any], username: str
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        user_info: dict[str, Any] = {}
        video_items: list[dict[str, Any]] = []

        user_module = payload.get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {})
        user_info_obj = user_module.get("userInfo", {})
        if user_info_obj:
            user_info = {**user_info_obj.get("user", {}), **user_info_obj.get("stats", {})}
            video_items = user_module.get("itemList", []) or []

        return user_info, video_items

    def _parse_video_item(self, item: dict[str, Any]) -> TikTokVideoData | None:
        from datetime import datetime, timezone

        video_id = str(item.get("id", item.get("aweme_id", "")))
        if not video_id:
            return None

        stats = item.get("stats", item)
        create_time = item.get("createTime") or item.get("create_time")
        published_at = None
        if create_time:
            try:
                published_at = datetime.fromtimestamp(int(create_time), tz=timezone.utc)
            except (TypeError, ValueError):
                published_at = None

        desc = item.get("desc", item.get("title", "")) or ""
        cover = ""
        video_obj = item.get("video", {})
        if isinstance(video_obj, dict):
            cover = video_obj.get("cover", video_obj.get("originCover", "")) or ""

        return TikTokVideoData(
            video_id=video_id,
            title=desc,
            cover_url=cover,
            play_count=int(stats.get("playCount", stats.get("play_count", 0)) or 0),
            like_count=int(stats.get("diggCount", stats.get("digg_count", 0)) or 0),
            comment_count=int(stats.get("commentCount", stats.get("comment_count", 0)) or 0),
            share_count=int(stats.get("shareCount", stats.get("share_count", 0)) or 0),
            published_at=published_at,
        )
