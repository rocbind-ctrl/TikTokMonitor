from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class TikTokVideoData:
    video_id: str
    title: str = ""
    cover_url: str = ""
    play_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    published_at: datetime | None = None


@dataclass
class TikTokUserData:
    username: str
    nickname: str = ""
    sec_uid: str = ""
    follower_count: int = 0
    following_count: int = 0
    total_likes: int = 0
    video_count: int = 0
    avatar_url: str = ""
    videos: list[TikTokVideoData] = field(default_factory=list)
    warning: str = ""
    sources_used: list[str] = field(default_factory=list)
