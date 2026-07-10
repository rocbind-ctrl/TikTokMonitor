import time
from datetime import datetime, timezone
from typing import Any

import yt_dlp

from app.models import TikTokVideoData


class YtDlpProvider:
    """通过 yt-dlp 抓取 TikTok 公开数据，无需登录。"""

    name = "ytdlp"

    def __init__(self, proxy: str = "", timeout: float = 120.0):
        self.proxy = proxy.strip()
        self.timeout = timeout

    def fetch_videos(self, username: str, max_videos: int = 50) -> list[TikTokVideoData]:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                return self._fetch_once(username, max_videos)
            except Exception as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(2)
        raise last_error or RuntimeError("yt-dlp 抓取失败")

    def _fetch_once(self, username: str, max_videos: int) -> list[TikTokVideoData]:
        profile_url = f"https://www.tiktok.com/@{username}"
        opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": "in_playlist",
            "playlistend": max_videos,
            "socket_timeout": self.timeout,
            "retries": 3,
        }
        if self.proxy:
            opts["proxy"] = self.proxy

        try:
            import curl_cffi  # noqa: F401

            opts["extractor_args"] = {"tiktok": {"api_hostname": "api.tiktok.com"}}
        except ImportError:
            pass

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(profile_url, download=False)

        if not info:
            raise RuntimeError("yt-dlp 未返回数据")

        entries = info.get("entries") or []
        if not entries:
            raise RuntimeError("未找到视频，账号可能为空或网络异常")

        videos: list[TikTokVideoData] = []
        for entry in entries:
            video = self._parse_entry(entry)
            if video:
                videos.append(video)
            if len(videos) >= max_videos:
                break
        return videos

    def _parse_entry(self, entry: dict[str, Any]) -> TikTokVideoData | None:
        video_id = str(entry.get("id") or "")
        if not video_id:
            return None

        published_at = None
        timestamp = entry.get("timestamp")
        if timestamp:
            try:
                published_at = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
            except (TypeError, ValueError):
                published_at = None

        cover_url = ""
        thumbnails = entry.get("thumbnails") or []
        if thumbnails:
            cover_url = thumbnails[-1].get("url", "") or ""

        title = entry.get("title") or entry.get("description") or ""

        return TikTokVideoData(
            video_id=video_id,
            title=title,
            cover_url=cover_url,
            play_count=int(entry.get("view_count") or 0),
            like_count=int(entry.get("like_count") or 0),
            comment_count=int(entry.get("comment_count") or 0),
            share_count=int(entry.get("repost_count") or 0),
            published_at=published_at,
        )
