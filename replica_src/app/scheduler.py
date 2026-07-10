from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_monitor_settings
from app.database import SessionLocal
from app.sync_service import sync_all_accounts

_scheduler: BackgroundScheduler | None = None
_last_run_at: datetime | None = None
_last_run_summary: str = ""


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    monitor_cfg = get_monitor_settings()
    interval_minutes = int(monitor_cfg.get("interval_minutes", 30))

    def job():
        global _last_run_at, _last_run_summary
        db = SessionLocal()
        try:
            logs = sync_all_accounts(db)
            ok = sum(1 for log in logs if log.status == "success")
            _last_run_at = datetime.now(timezone.utc)
            _last_run_summary = f"{ok}/{len(logs)} 成功"
        except Exception as exc:
            _last_run_at = datetime.now(timezone.utc)
            _last_run_summary = f"失败: {exc}"
        finally:
            db.close()

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        job,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="tiktok_sync",
        replace_existing=True,
    )
    _scheduler.start()
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None


def get_scheduler_info() -> dict:
    monitor_cfg = get_monitor_settings()
    interval = int(monitor_cfg.get("interval_minutes", 30))
    job = _scheduler.get_job("tiktok_sync") if _scheduler and _scheduler.running else None
    next_run = job.next_run_time if job else None
    return {
        "running": bool(_scheduler and _scheduler.running),
        "interval_minutes": interval,
        "next_run": next_run.isoformat() if next_run else None,
        "last_run": _last_run_at.isoformat() if _last_run_at else None,
        "last_summary": _last_run_summary,
    }
