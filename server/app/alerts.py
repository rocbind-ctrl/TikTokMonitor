from datetime import datetime, timedelta, timezone

from sqlalchemy import desc

from app.config import get_alert_settings
from app.database import Account, AccountStatsHistory, Alert, Video, VideoStatsHistory
from app.intelligence import detect_anomalies


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _in_cooldown(db, account_id: int | None, alert_type: str, hours: int) -> bool:
    since = _utcnow() - timedelta(hours=hours)
    q = db.query(Alert).filter(Alert.alert_type == alert_type, Alert.created_at >= since)
    if account_id:
        q = q.filter(Alert.account_id == account_id)
    return q.first() is not None


def _add_alert(db, account_id: int | None, video_id: int | None, level: str, alert_type: str, title: str, message: str, created: list) -> None:
    alert = Alert(
        account_id=account_id,
        video_id=video_id,
        level=level,
        alert_type=alert_type,
        title=title,
        message=message,
    )
    db.add(alert)
    created.append(alert)


def check_alerts(db, account: Account, sync_status: str, videos_updated: int, error_message: str = "") -> list[Alert]:
    settings = get_alert_settings()
    if not settings.get("enabled", True):
        return []

    play_threshold = int(settings.get("play_surge_threshold", 1000))
    follower_drop = int(settings.get("follower_drop_threshold", 50))
    cooldown_hours = int(settings.get("cooldown_hours", 6))
    created: list[Alert] = []

    if sync_status == "error":
        if not _in_cooldown(db, account.id, "sync_failed", cooldown_hours):
            msg = error_message or f"账号 @{account.username} 最近一次同步失败，请检查网络或用户名"
            _add_alert(db, account.id, None, "error", "sync_failed", f"@{account.username} 同步失败", msg, created)
        return created

    history = (
        db.query(AccountStatsHistory)
        .filter(AccountStatsHistory.account_id == account.id)
        .order_by(desc(AccountStatsHistory.recorded_at))
        .limit(2)
        .all()
    )
    if len(history) >= 2:
        curr, prev = history[0], history[1]
        follower_delta = curr.follower_count - prev.follower_count
        plays_delta = curr.total_plays - prev.total_plays

        if follower_delta <= -follower_drop and not _in_cooldown(db, account.id, "follower_drop", cooldown_hours):
            _add_alert(
                db, account.id, None, "warning", "follower_drop",
                f"@{account.username} 粉丝下降",
                f"粉丝减少 {abs(follower_delta):,}，当前 {curr.follower_count:,}",
                created,
            )

        if plays_delta >= play_threshold and not _in_cooldown(db, account.id, "play_surge", cooldown_hours):
            _add_alert(
                db, account.id, None, "info", "play_surge",
                f"@{account.username} 播放增长",
                f"总播放增加 {plays_delta:,}，当前 {curr.total_plays:,}",
                created,
            )

    videos = db.query(Video).filter(Video.account_id == account.id).all()
    for video in videos:
        vhist = (
            db.query(VideoStatsHistory)
            .filter(VideoStatsHistory.video_id == video.id)
            .order_by(desc(VideoStatsHistory.recorded_at))
            .limit(2)
            .all()
        )
        if len(vhist) < 2:
            continue
        delta = vhist[0].play_count - vhist[1].play_count
        if delta >= play_threshold and not _in_cooldown(db, account.id, f"video_surge_{video.id}", cooldown_hours):
            _add_alert(
                db, account.id, video.id, "info", "video_surge",
                "视频播放激增",
                f"「{(video.title or '无标题')[:40]}」播放 +{delta:,}，现 {vhist[0].play_count:,}",
                created,
            )

    if settings.get("anomaly_detection", True):
        for anomaly in detect_anomalies(db, account):
            atype = anomaly["type"]
            if not _in_cooldown(db, account.id, atype, cooldown_hours):
                _add_alert(
                    db, account.id, None,
                    anomaly["level"], atype,
                    anomaly["title"], anomaly["message"],
                    created,
                )

    return created
