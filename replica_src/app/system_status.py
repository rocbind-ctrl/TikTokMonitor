from datetime import datetime, timezone

from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.config import get_alert_settings, get_monitor_settings, get_notification_settings, get_tiktok_settings
from app.database import Account, Alert, SyncLog, Video
from app.scheduler import get_scheduler_info


def system_overview(db: Session) -> dict:
    total_accounts = db.query(Account).count()
    active_accounts = db.query(Account).filter(Account.is_active == 1).count()
    totals = db.query(
        func.coalesce(func.sum(Video.play_count), 0),
        func.coalesce(func.count(Video.id), 0),
    ).one()
    total_plays, total_videos = int(totals[0]), int(totals[1])

    last_sync = db.query(SyncLog).order_by(desc(SyncLog.created_at)).first()
    unread = db.query(Alert).filter(Alert.is_read == 0).count()
    recent_errors = (
        db.query(SyncLog)
        .options(joinedload(SyncLog.account))
        .filter(SyncLog.status == "error")
        .order_by(desc(SyncLog.created_at))
        .limit(5)
        .all()
    )

    return {
        "total_accounts": total_accounts,
        "active_accounts": active_accounts,
        "total_videos": total_videos,
        "total_plays": total_plays,
        "unread_alerts": unread,
        "last_sync_at": last_sync.created_at if last_sync else None,
        "last_sync_status": last_sync.status if last_sync else None,
        "recent_errors": recent_errors,
        "scheduler": get_scheduler_info(),
        "monitor": get_monitor_settings(),
        "alerts": get_alert_settings(),
        "tiktok": get_tiktok_settings(),
        "notifications": get_notification_settings(),
    }
