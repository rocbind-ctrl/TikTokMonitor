import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.alerts import check_alerts
from app.analytics import snapshot_account_stats
from app.config import get_monitor_settings, get_sync_settings
from app.database import Account, SessionLocal, SyncLog, Video, VideoStatsHistory
from app.deps import ensure_ytdlp
from app.models import TikTokUserData
from app.notifications import dispatch_notifications
from app.provider_health import record_provider_result
from app.scraper import TikTokScraper
from app.sync_progress import finish_account, start_batch, update_current
from app.sync_tracker import mark_done, mark_syncing
from app.utils import normalize_username


def _utc_naive(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _build_scraper() -> TikTokScraper:
    monitor = get_monitor_settings()
    timeout = float(monitor.get("request_timeout", 120))
    return TikTokScraper(timeout=max(timeout, 120))


def _fetch_with_retry(scraper: TikTokScraper, username: str, max_videos: int) -> tuple[TikTokUserData, int]:
    sync_cfg = get_sync_settings()
    max_retries = int(sync_cfg.get("max_retries", 3))
    backoff = float(sync_cfg.get("retry_backoff_seconds", 2))
    last_exc: Exception | None = None

    for attempt in range(max_retries):
        t0 = time.time()
        try:
            data = scraper.fetch_user(username, max_videos=max_videos)
            latency = (time.time() - t0) * 1000
            for src in data.sources_used or ["unknown"]:
                _record_provider(src, True, latency)
            return data, attempt
        except Exception as exc:
            last_exc = exc
            latency = (time.time() - t0) * 1000
            _record_provider("auto", False, latency)
            if attempt < max_retries - 1:
                time.sleep(backoff * (2**attempt))

    raise last_exc or RuntimeError("同步失败")


def _record_provider(provider: str, success: bool, latency_ms: float) -> None:
    db = SessionLocal()
    try:
        record_provider_result(db, provider, success, latency_ms)
        db.commit()
    finally:
        db.close()


def sync_account(
    db: Session,
    account: Account,
    max_videos: int | None = None,
    timeout: float | None = None,
) -> SyncLog:
    start = time.time()
    monitor = get_monitor_settings()
    max_videos = max_videos if max_videos is not None else int(monitor.get("max_videos_per_account", 50))

    scraper = _build_scraper()
    if timeout is not None:
        scraper.timeout = timeout

    normalized = normalize_username(account.username)
    if normalized and normalized != account.username:
        account.username = normalized

    retry_count = 0
    sources: list[str] = []

    try:
        ensure_ytdlp()
        user_data, retry_count = _fetch_with_retry(scraper, account.username, max_videos)
        sources = user_data.sources_used or []
        videos_updated = _apply_user_data(db, account, user_data)
        _prune_stale_videos(db, account, user_data)
        account.last_sync_at = datetime.now(timezone.utc)
        snapshot_account_stats(db, account)

        if videos_updated == 0 and (user_data.video_count or 0) > 0:
            status = "error"
            message = (
                f"未能获取视频播放量（TikTok 上共有 {user_data.video_count} 个视频）。"
                "请关闭服务窗口，重新双击「一键启动.bat」后再试。"
            )
        elif videos_updated == 0 and user_data.follower_count == 0:
            status = "error"
            message = "未能获取任何数据，请检查用户名是否正确"
        else:
            status = "success"
            message = f"同步成功，更新 {videos_updated} 个视频"
            if user_data.warning:
                message = f"{message}。{user_data.warning}"
            if retry_count > 0:
                message = f"{message}（重试 {retry_count} 次）"

        new_alerts = check_alerts(db, account, status, videos_updated)
        db.commit()
        dispatch_notifications(new_alerts)

        return SyncLog(
            account_id=account.id,
            status=status,
            message=message,
            videos_updated=videos_updated,
            duration_seconds=round(time.time() - start, 2),
            provider_used=",".join(sources),
            retry_count=retry_count,
        )
    except Exception as exc:
        db.rollback()
        message = str(exc)
        new_alerts = check_alerts(db, account, "error", 0, error_message=message)
        db.commit()
        dispatch_notifications(new_alerts)
        return SyncLog(
            account_id=account.id,
            status="error",
            message=message,
            videos_updated=0,
            duration_seconds=round(time.time() - start, 2),
            provider_used=",".join(sources),
            retry_count=retry_count,
        )


def _sync_one_account(account_id: int, max_videos: int | None, timeout: float | None) -> SyncLog:
    mark_syncing(account_id)
    db = SessionLocal()
    try:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            return SyncLog(account_id=account_id, status="error", message="账号不存在")
        update_current(account.username)
        log = sync_account(db, account, max_videos=max_videos, timeout=timeout)
        db.add(log)
        db.commit()
        finish_account(account.username, log.status, log.message)
        return log
    finally:
        mark_done(account_id)
        db.close()


def sync_all_accounts(
    db: Session,
    max_videos: int | None = None,
    timeout: float | None = None,
) -> list[SyncLog]:
    accounts = db.query(Account).filter(Account.is_active == 1).order_by(Account.id).all()
    if not accounts:
        return []

    sync_cfg = get_sync_settings()
    max_workers = int(sync_cfg.get("max_workers", 3))
    use_concurrent = sync_cfg.get("concurrent", True) and len(accounts) > 1

    start_batch(len(accounts))
    logs: list[SyncLog] = []

    if use_concurrent and max_workers > 1:
        with ThreadPoolExecutor(max_workers=min(max_workers, len(accounts))) as pool:
            futures = {
                pool.submit(_sync_one_account, acc.id, max_videos, timeout): acc for acc in accounts
            }
            for future in as_completed(futures):
                logs.append(future.result())
        logs.sort(key=lambda x: x.account_id or 0)
    else:
        for account in accounts:
            update_current(account.username)
            log = sync_account(db, account, max_videos=max_videos, timeout=timeout)
            db.add(log)
            db.commit()
            logs.append(log)
            finish_account(account.username, log.status, log.message)
            time.sleep(float(sync_cfg.get("sequential_delay_seconds", 1)))

    return logs


_queue_lock = threading.Lock()
_sync_queue: list[int] = []
_worker_running = False


def enqueue_account_sync(account_ids: list[int]) -> int:
    """后台排队同步，限制并发，避免批量导入时开大量线程。"""
    ids = [i for i in dict.fromkeys(account_ids) if i]
    if not ids:
        return 0
    global _worker_running
    with _queue_lock:
        _sync_queue.extend(ids)
        if not _worker_running:
            _worker_running = True
            threading.Thread(target=_sync_queue_worker, daemon=True).start()
    return len(ids)


def pending_sync_count() -> int:
    with _queue_lock:
        return len(_sync_queue)


def _sync_queue_worker() -> None:
    global _worker_running
    while True:
        with _queue_lock:
            if not _sync_queue:
                _worker_running = False
                return
            batch = _sync_queue[:]
            _sync_queue.clear()
        _run_sync_batch(batch)


def _run_sync_batch(account_ids: list[int]) -> None:
    if not account_ids:
        return
    monitor = get_monitor_settings()
    max_videos = int(monitor.get("max_videos_per_account", 50))
    sync_cfg = get_sync_settings()
    max_workers = max(1, int(sync_cfg.get("max_workers", 3)))
    use_concurrent = sync_cfg.get("concurrent", True) and len(account_ids) > 1

    start_batch(len(account_ids))
    if use_concurrent and max_workers > 1:
        with ThreadPoolExecutor(max_workers=min(max_workers, len(account_ids))) as pool:
            futures = [pool.submit(_sync_one_account, aid, max_videos, None) for aid in account_ids]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    import logging
                    logging.getLogger(__name__).exception("sync failed: %s", exc)
    else:
        delay = float(sync_cfg.get("sequential_delay_seconds", 1))
        for aid in account_ids:
            try:
                _sync_one_account(aid, max_videos, None)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).exception("sync failed account %s: %s", aid, exc)
            time.sleep(delay)


def _apply_user_data(db: Session, account: Account, user_data: TikTokUserData) -> int:
    account.nickname = user_data.nickname or account.username
    account.sec_uid = user_data.sec_uid or account.sec_uid
    account.follower_count = user_data.follower_count
    account.following_count = user_data.following_count
    account.total_likes = user_data.total_likes
    account.video_count = user_data.video_count or len(user_data.videos)
    account.avatar_url = user_data.avatar_url or account.avatar_url

    updated = 0
    existing_videos = {
        video.video_id: video for video in db.query(Video).filter(Video.account_id == account.id).all()
    }

    for item in user_data.videos:
        video = existing_videos.get(item.video_id)
        if not video:
            video = Video(account_id=account.id, video_id=item.video_id)
            db.add(video)

        changed = (
            video.play_count != item.play_count
            or video.like_count != item.like_count
            or video.comment_count != item.comment_count
            or video.share_count != item.share_count
        )

        video.title = item.title
        video.cover_url = item.cover_url
        video.play_count = item.play_count
        video.like_count = item.like_count
        video.comment_count = item.comment_count
        video.share_count = item.share_count
        video.published_at = _utc_naive(item.published_at)
        video.last_sync_at = datetime.now(timezone.utc)

        if changed or video.id is None:
            db.flush()
            db.add(
                VideoStatsHistory(
                    video_id=video.id,
                    play_count=item.play_count,
                    like_count=item.like_count,
                    comment_count=item.comment_count,
                    share_count=item.share_count,
                )
            )
            updated += 1

    return updated


def _prune_stale_videos(db: Session, account: Account, user_data: TikTokUserData) -> None:
    if not user_data.videos:
        return
    # 只抓取了部分视频时，不删除未出现在结果里的旧视频
    if user_data.video_count and len(user_data.videos) < user_data.video_count:
        return
    fetched_ids = {v.video_id for v in user_data.videos}
    for video in db.query(Video).filter(Video.account_id == account.id).all():
        if video.video_id not in fetched_ids:
            db.delete(video)
