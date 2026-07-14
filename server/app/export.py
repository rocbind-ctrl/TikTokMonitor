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


def export_insights_csv(payload: dict, section: str = "accounts") -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    period = payload.get("period") or {}
    days = period.get("days") or 7
    if section == "videos":
        writer.writerow(["period_days", "username", "video_id", "title", "plays_delta", "previous_plays_delta", "engagement_rate", "has_comparison"])
        for row in (payload.get("videos") or {}).get("gainers") or []:
            writer.writerow([
                days,
                (row.get("account") or {}).get("username", ""),
                (row.get("video") or {}).get("video_id", ""),
                (row.get("video") or {}).get("title", ""),
                row.get("plays_delta", 0),
                row.get("previous_plays_delta", 0),
                row.get("engagement", 0),
                row.get("has_comparison", False),
            ])
    elif section == "anomalies":
        writer.writerow(["period_days", "username", "level", "type", "title", "message", "z_score"])
        for row in payload.get("anomalies") or []:
            writer.writerow([
                days,
                (row.get("account") or {}).get("username", ""),
                row.get("level", ""),
                row.get("type", ""),
                row.get("title", ""),
                row.get("message", ""),
                row.get("z_score", ""),
            ])
    else:
        writer.writerow(["period_days", "username", "group", "employee", "plays_delta", "previous_plays_delta", "follower_delta", "previous_follower_delta", "engagement_rate", "has_comparison"])
        for row in (payload.get("accounts") or {}).get("plays_growth") or []:
            account = row.get("account") or {}
            writer.writerow([
                days,
                account.get("username", ""),
                account.get("group", ""),
                account.get("employee", ""),
                row.get("plays_delta", 0),
                row.get("previous_plays_delta", 0),
                row.get("follower_delta", 0),
                row.get("previous_follower_delta", 0),
                row.get("engagement", 0),
                row.get("has_comparison", False),
            ])
    return output.getvalue()
