import csv
import io

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.analytics import account_total_plays, engagement_rate, format_tk_time
from app.database import Account, Video


def export_accounts_csv(db: Session, accounts: list[Account] | None = None) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "username",
            "nickname",
            "group",
            "phone",
            "employee",
            "note",
            "followers",
            "following",
            "total_likes",
            "tiktok_video_count",
            "synced_videos",
            "total_plays",
            "engagement_rate",
            "last_sync",
        ]
    )
    accounts = accounts if accounts is not None else db.query(Account).options(joinedload(Account.videos)).order_by(Account.id).all()
    for a in accounts:
        writer.writerow(
            [
                a.username,
                a.nickname,
                a.group_name or "",
                a.phone or "",
                a.employee or "",
                a.note or "",
                a.follower_count,
                a.following_count,
                a.total_likes,
                a.video_count,
                len(a.videos),
                account_total_plays(a),
                engagement_rate(a),
                a.last_sync_at.isoformat() if a.last_sync_at else "",
            ]
        )
    return output.getvalue()


def export_videos_csv(db: Session, account_id: int | None = None, videos: list[Video] | None = None) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "username",
            "video_id",
            "title",
            "play_count",
            "like_count",
            "comment_count",
            "share_count",
            "published_at",
            "published_at_tk",
            "last_sync",
        ]
    )
    if videos is None:
        q = db.query(Video).options(joinedload(Video.account))
        if account_id:
            q = q.filter(Video.account_id == account_id)
        videos = q.order_by(desc(Video.play_count)).all()
    for video in videos:
        account = video.account
        writer.writerow(
            [
                account.username if account else "",
                video.video_id,
                video.title,
                video.play_count,
                video.like_count,
                video.comment_count,
                video.share_count,
                video.published_at.isoformat() if video.published_at else "",
                format_tk_time(video.published_at) if video.published_at else "",
                video.last_sync_at.isoformat() if video.last_sync_at else "",
            ]
        )
    return output.getvalue()
