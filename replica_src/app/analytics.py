from datetime import datetime, timedelta, timezone
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.database import Account, AccountStatsHistory, Alert, Video, VideoStatsHistory, chunked

_TZ_DISPLAY = {
    "America/Los_Angeles": "美区时间",
    "Asia/Shanghai": "北京时间",
    "UTC": "UTC",
}


def day_timezone() -> str:
    from app.config import get_day_timezone

    return get_day_timezone() or "America/Los_Angeles"


def day_timezone_label(tz_name: str | None = None) -> str:
    tz = tz_name or day_timezone()
    return _TZ_DISPLAY.get(tz, tz.replace("_", " "))


def _tk_zone(tz_name: str | None = None) -> ZoneInfo:
    return ZoneInfo(tz_name or day_timezone())


def to_tk_time(dt: datetime | None, tz_name: str | None = None) -> datetime | None:
    utc = _as_utc(dt)
    if not utc:
        return None
    return utc.astimezone(_tk_zone(tz_name))


def tk_date_key(dt: datetime | None, tz_name: str | None = None) -> str | None:
    """按配置时区（默认 Los Angeles）的日历日。"""
    local = to_tk_time(dt, tz_name)
    return local.strftime("%Y-%m-%d") if local else None


def today_date_key(day_offset: int = 0, tz_name: str | None = None) -> str:
    tz_name = tz_name or day_timezone()
    return (datetime.now(_tk_zone(tz_name)) + timedelta(days=day_offset)).strftime("%Y-%m-%d")


def is_in_tk_day(dt: datetime | None, day_offset: int = 0, tz_name: str | None = None) -> bool:
    pub_key = tk_date_key(dt, tz_name)
    if not pub_key:
        return False
    return pub_key == today_date_key(day_offset, tz_name)


def format_tk_time(dt: datetime | None, fmt: str = "%Y-%m-%d %H:%M", tz_name: str | None = None) -> str:
    local = to_tk_time(dt, tz_name)
    if not local:
        return "—"
    return local.strftime(fmt)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def latest_video(videos: list[Video]) -> Video | None:
    if not videos:
        return None
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    return max(videos, key=lambda v: (_as_utc(v.published_at) or epoch, v.id))


def latest_video_play_count(videos: list[Video]) -> int:
    video = latest_video(videos)
    return video.play_count if video else 0


def _latest_today_video(today_videos: list[Video]) -> Video | None:
    return latest_video(today_videos)


def format_video_time(dt: datetime | None, tz_name: str | None = None) -> str:
    return format_tk_time(dt, "%Y-%m-%d %H:%M", tz_name)


def account_total_plays(account: Account) -> int:
    return sum(v.play_count for v in account.videos)


def snapshot_account_stats(db: Session, account: Account) -> None:
    total_plays = account_total_plays(account)
    last = (
        db.query(AccountStatsHistory)
        .filter(AccountStatsHistory.account_id == account.id)
        .order_by(desc(AccountStatsHistory.recorded_at))
        .first()
    )
    changed = (
        not last
        or last.follower_count != account.follower_count
        or last.total_likes != account.total_likes
        or last.video_count != account.video_count
        or last.total_plays != total_plays
    )
    if changed:
        db.add(
            AccountStatsHistory(
                account_id=account.id,
                follower_count=account.follower_count,
                following_count=account.following_count,
                total_likes=account.total_likes,
                video_count=account.video_count,
                total_plays=total_plays,
            )
        )


def _history_at(db: Session, account_id: int, before: datetime) -> AccountStatsHistory | None:
    return (
        db.query(AccountStatsHistory)
        .filter(
            AccountStatsHistory.account_id == account_id,
            AccountStatsHistory.recorded_at <= before,
        )
        .order_by(desc(AccountStatsHistory.recorded_at))
        .first()
    )


def account_growth(db: Session, account: Account, hours: int = 24) -> dict:
    now = _utcnow()
    past = now - timedelta(hours=hours)
    old = _history_at(db, account.id, past)
    plays = account_total_plays(account)
    return {
        "follower_delta": account.follower_count - (old.follower_count if old else account.follower_count),
        "likes_delta": account.total_likes - (old.total_likes if old else account.total_likes),
        "plays_delta": plays - (old.total_plays if old else plays),
        "hours": hours,
    }


def top_play_gainers(db: Session, limit: int = 10, hours: int = 24) -> list[dict]:
    since = _utcnow() - timedelta(hours=hours)
    rows = (
        db.query(VideoStatsHistory, Video, Account)
        .join(Video, VideoStatsHistory.video_id == Video.id)
        .join(Account, Video.account_id == Account.id)
        .filter(VideoStatsHistory.recorded_at >= since)
        .order_by(VideoStatsHistory.recorded_at)
        .all()
    )
    first: dict[int, VideoStatsHistory] = {}
    last: dict[int, VideoStatsHistory] = {}
    meta: dict[int, tuple[Video, Account]] = {}
    for hist, video, account in rows:
        if video.id not in first:
            first[video.id] = hist
            meta[video.id] = (video, account)
        last[video.id] = hist

    gainers: list[dict] = []
    for vid, last_hist in last.items():
        first_hist = first.get(vid)
        if not first_hist:
            continue
        delta = last_hist.play_count - first_hist.play_count
        if delta <= 0:
            continue
        video, account = meta.get(vid, (None, None))
        if not video or not account:
            continue
        gainers.append(
            {
                "video": video,
                "account": account,
                "play_delta": delta,
                "current_plays": last_hist.play_count,
            }
        )
    gainers.sort(key=lambda x: x["play_delta"], reverse=True)
    return gainers[:limit]


def dashboard_trend(db: Session, days: int = 7) -> dict:
    """按日汇总各账号当日最后一次快照，避免多次同步重复计数。"""
    since = _utcnow() - timedelta(days=days)
    rows = (
        db.query(AccountStatsHistory)
        .filter(AccountStatsHistory.recorded_at >= since)
        .order_by(AccountStatsHistory.recorded_at)
        .all()
    )
    daily: dict[str, dict[int, AccountStatsHistory]] = {}
    for row in rows:
        day = tk_date_key(row.recorded_at) or ""
        if not day:
            continue
        daily.setdefault(day, {})[row.account_id] = row

    labels = sorted(daily.keys())
    display_labels = [d[5:7] + "/" + d[8:10] for d in labels]
    plays = [sum(s.total_plays for s in daily[day].values()) for day in labels]
    followers = [sum(s.follower_count for s in daily[day].values()) for day in labels]
    return {"labels": display_labels, "plays": plays, "followers": followers}


def account_follower_trend(db: Session, account_id: int, days: int = 30) -> dict:
    since = _utcnow() - timedelta(days=days)
    rows = (
        db.query(AccountStatsHistory)
        .filter(
            AccountStatsHistory.account_id == account_id,
            AccountStatsHistory.recorded_at >= since,
        )
        .order_by(AccountStatsHistory.recorded_at)
        .all()
    )
    return {
        "labels": [format_tk_time(r.recorded_at, "%m-%d %H:%M") for r in rows],
        "followers": [r.follower_count for r in rows],
        "plays": [r.total_plays for r in rows],
    }


def engagement_rate(account: Account) -> float:
    plays = account_total_plays(account)
    if plays <= 0:
        return 0.0
    likes = sum(v.like_count for v in account.videos)
    return round(likes / plays * 100, 2)


def unread_alerts(db: Session, limit: int = 20) -> list[Alert]:
    return (
        db.query(Alert)
        .filter(Alert.is_read == 0)
        .order_by(desc(Alert.created_at))
        .limit(limit)
        .all()
    )


def today_local_bounds(tz_name: str | None = None) -> tuple[datetime, datetime]:
    """TikTok 日历「今日」0 点对应的 UTC 区间（左闭右开）。"""
    tz_name = tz_name or day_timezone()
    tz = _tk_zone(tz_name)
    now = datetime.now(tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def today_db_bounds(tz_name: str | None = None) -> tuple[datetime, datetime]:
    """SQLite published_at 存 UTC 无时区，边界与之对齐。"""
    start, end = today_local_bounds(tz_name)
    return start.replace(tzinfo=None), end.replace(tzinfo=None)


def today_local_label(tz_name: str | None = None) -> str:
    tz_name = tz_name or day_timezone()
    return datetime.now(_tk_zone(tz_name)).strftime("%m月%d日")


def local_day_bounds(day_offset: int = 0, tz_name: str | None = None) -> tuple[datetime, datetime, str, str]:
    tz_name = tz_name or day_timezone()
    tz = _tk_zone(tz_name)
    day = (datetime.now(tz) + timedelta(days=day_offset)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end = day + timedelta(days=1)
    return (
        day.astimezone(timezone.utc),
        end.astimezone(timezone.utc),
        day.strftime("%m/%d"),
        day.strftime("%Y-%m-%d"),
    )


def account_videos_today(account: Account, tz_name: str | None = None) -> list[Video]:
    return [v for v in account.videos if is_in_tk_day(v.published_at, 0, tz_name)]


def today_publish_summary_db(db: Session, tz_name: str | None = None) -> dict:
    tz_name = tz_name or day_timezone()
    start, end = today_db_bounds(tz_name)
    total_accounts = db.query(Account).filter(Account.is_active == 1).count()
    if total_accounts == 0:
        return {
            "total_videos": 0,
            "total_plays": 0,
            "posted_accounts": 0,
            "not_posted_accounts": 0,
            "date_label": today_local_label(tz_name),
            "tz_label": day_timezone_label(tz_name),
        }

    total_videos = int(
        db.query(func.count(Video.id))
        .join(Account, Video.account_id == Account.id)
        .filter(
            Account.is_active == 1,
            Video.published_at >= start,
            Video.published_at < end,
        )
        .scalar()
        or 0
    )
    total_plays = 0
    today_videos_rows = (
        db.query(Video)
        .join(Account, Video.account_id == Account.id)
        .filter(
            Account.is_active == 1,
            Video.published_at >= start,
            Video.published_at < end,
        )
        .all()
    )
    if today_videos_rows:
        by_account: dict[int, list[Video]] = {}
        for video in today_videos_rows:
            by_account.setdefault(video.account_id, []).append(video)
        total_plays = sum(latest_video_play_count(vids) for vids in by_account.values())
    posted_accounts = int(
        db.query(func.count(func.distinct(Video.account_id)))
        .join(Account, Video.account_id == Account.id)
        .filter(
            Account.is_active == 1,
            Video.published_at >= start,
            Video.published_at < end,
        )
        .scalar()
        or 0
    )
    return {
        "total_videos": total_videos,
        "total_plays": total_plays,
        "posted_accounts": posted_accounts,
        "not_posted_accounts": max(0, total_accounts - posted_accounts),
        "date_label": today_local_label(tz_name),
        "tz_label": day_timezone_label(tz_name),
    }


def employee_post_report_db(
    db: Session,
    days: int = 7,
    tz_name: str | None = None,
    metrics: dict | None = None,
) -> dict:
    tz_name = tz_name or day_timezone()
    day_slots = [local_day_bounds(-(days - 1 - i), tz_name) for i in range(days)]
    date_labels = [s[2] for s in day_slots]
    date_keys = [s[3] for s in day_slots]
    today_key = date_keys[-1] if date_keys else today_date_key(0, tz_name)

    if metrics is None:
        from app.groups import load_active_accounts_metrics

        metrics = load_active_accounts_metrics(db)

    acc_emp = {
        account.id: (account.employee or "").strip() or "未分配"
        for account in metrics["accounts"]
    }

    buckets: dict[str, dict] = {}
    for aid, emp in acc_emp.items():
        if emp not in buckets:
            buckets[emp] = {
                "employee": emp,
                "account_count": 0,
                "posted_today": 0,
                "daily": [0] * days,
                "daily_plays": [0] * days,
                "today_new_plays": 0,
                "today_plays_gain": 0,
            }
        buckets[emp]["account_count"] += 1

    today_videos_by_acc: dict[int, list[Video]] = {}

    if acc_emp:
        all_videos = [v for v in metrics["all_videos"] if v.published_at is not None]
        delta_today_map = metrics["delta_today_map"]

        posted_today_accounts: dict[str, set[int]] = {}
        plays_gain_by_acc: dict[int, int] = defaultdict(int)
        for v in all_videos:
            aid = v.account_id
            emp = acc_emp.get(aid, "未分配")
            plays_gain_by_acc[aid] += delta_today_map.get(v.id, 0)
            pub_key = tk_date_key(v.published_at, tz_name)
            if not pub_key:
                continue
            for idx, key in enumerate(date_keys):
                if pub_key == key:
                    buckets[emp]["daily"][idx] += 1
                    buckets[emp]["daily_plays"][idx] += v.play_count
                    if key == today_key:
                        today_videos_by_acc.setdefault(aid, []).append(v)
                        posted_today_accounts.setdefault(emp, set()).add(aid)
                    break

        for emp, data in buckets.items():
            emp_accounts = [aid for aid, e in acc_emp.items() if e == emp]
            data["today_plays_gain"] = sum(plays_gain_by_acc.get(aid, 0) for aid in emp_accounts)
            for aid in emp_accounts:
                latest = latest_video(today_videos_by_acc.get(aid, []))
                if latest:
                    data["today_new_plays"] += latest.play_count
            if emp in posted_today_accounts:
                data["posted_today"] = len(posted_today_accounts[emp])

    result = []
    for data in buckets.values():
        daily = data["daily"]
        result.append(
            {
                "employee": data["employee"],
                "account_count": data["account_count"],
                "today_count": daily[-1] if daily else 0,
                "posted_today": data["posted_today"],
                "daily_counts": daily,
                "daily_plays": data["daily_plays"],
                "today_new_plays": data["today_new_plays"],
                "today_plays_gain": data["today_plays_gain"],
                "total_period": sum(daily),
                "total_plays_period": sum(data["daily_plays"]),
            }
        )
    result.sort(
        key=lambda r: (r["today_new_plays"], r["today_plays_gain"], r["today_count"]),
        reverse=True,
    )
    return {"date_labels": date_labels, "rows": result, "days": days}


def _video_history_baseline(rows: list[VideoStatsHistory], past: datetime) -> VideoStatsHistory | None:
    baseline = None
    for row in rows:
        rt = _as_utc(row.recorded_at)
        if rt and rt <= past:
            baseline = row
    if baseline:
        return baseline
    if len(rows) >= 2:
        return rows[0]
    return None


def _plays_increase_since(video: Video, hist_rows: list[VideoStatsHistory], since: datetime) -> int:
    current = video.play_count
    pub = _as_utc(video.published_at)
    if pub and pub >= since:
        return current

    baseline = _video_history_baseline(hist_rows, since)
    if baseline:
        return max(0, current - baseline.play_count)
    if len(hist_rows) >= 2:
        return max(0, current - hist_rows[0].play_count)
    return 0


def videos_plays_increase_map(db: Session, videos: list[Video], since: datetime) -> dict[int, int]:
    if not videos:
        return {}
    vid_ids = [v.id for v in videos]
    since_utc = _as_utc(since) or since
    lookback = since_utc - timedelta(hours=48)
    rows: list[VideoStatsHistory] = []
    for chunk in chunked(vid_ids):
        rows.extend(
            db.query(VideoStatsHistory)
            .filter(
                VideoStatsHistory.video_id.in_(chunk),
                VideoStatsHistory.recorded_at >= lookback.replace(tzinfo=None),
            )
            .order_by(VideoStatsHistory.video_id, VideoStatsHistory.recorded_at)
            .all()
        )
    history_by_vid: dict[int, list[VideoStatsHistory]] = {}
    for row in rows:
        history_by_vid.setdefault(row.video_id, []).append(row)
    return {v.id: _plays_increase_since(v, history_by_vid.get(v.id, []), since) for v in videos}


def video_plays_increase_24h(db: Session, video: Video, hours: int = 24) -> int:
    return _plays_increase_since(video, _video_history_rows(db, video.id), _utcnow() - timedelta(hours=hours))


def video_plays_increase_today(db: Session, video: Video, tz_name: str | None = None) -> int:
    start, _ = today_local_bounds(tz_name)
    return _plays_increase_since(video, _video_history_rows(db, video.id), start)


def _video_history_rows(db: Session, video_id: int) -> list[VideoStatsHistory]:
    return (
        db.query(VideoStatsHistory)
        .filter(VideoStatsHistory.video_id == video_id)
        .order_by(VideoStatsHistory.recorded_at)
        .all()
    )


def account_plays_increase_sum(videos: list[Video], delta_map: dict[int, int]) -> int:
    return sum(delta_map.get(v.id, 0) for v in videos)


def today_plays_increase_db(db: Session, tz_name: str | None = None) -> int:
    start, _ = today_local_bounds(tz_name)
    videos = (
        db.query(Video)
        .join(Account, Video.account_id == Account.id)
        .filter(Account.is_active == 1)
        .all()
    )
    delta_map = videos_plays_increase_map(db, videos, start)
    return sum(delta_map.values())


def account_growth_fast(
    db: Session,
    account: Account,
    total_plays: int,
    videos: list[Video] | None = None,
    delta_24h_map: dict[int, int] | None = None,
    delta_today_map: dict[int, int] | None = None,
    hours: int = 24,
    *,
    skip_account_history: bool = False,
) -> dict:
    now = _utcnow()
    past = now - timedelta(hours=hours)
    old = None
    if not skip_account_history:
        old = _history_at(db, account.id, past)
        if not old:
            old = (
                db.query(AccountStatsHistory)
                .filter(AccountStatsHistory.account_id == account.id)
                .order_by(AccountStatsHistory.recorded_at)
                .first()
            )

    if videos is not None and delta_24h_map is not None:
        plays_increase = account_plays_increase_sum(videos, delta_24h_map)
        today_plays_increase = (
            account_plays_increase_sum(videos, delta_today_map) if delta_today_map else 0
        )
    else:
        vids = videos or []
        if not vids:
            plays_increase = 0
            today_plays_increase = 0
        else:
            plays_increase = account_plays_increase_sum(
                vids, videos_plays_increase_map(db, vids, past)
            )
            start, _ = today_local_bounds()
            today_plays_increase = account_plays_increase_sum(
                vids, videos_plays_increase_map(db, vids, start)
            )

    if old:
        old_at = _as_utc(old.recorded_at)
        baseline_hours = (now - old_at).total_seconds() / 3600 if old_at else 0
        follower_delta = account.follower_count - old.follower_count
        likes_delta = account.total_likes - old.total_likes
    else:
        baseline_hours = 0
        follower_delta = likes_delta = 0

    return {
        "follower_delta": follower_delta,
        "likes_delta": likes_delta,
        "plays_delta": plays_increase,
        "plays_increase": plays_increase,
        "today_plays_increase": today_plays_increase,
        "hours": hours,
        "baseline_hours": round(baseline_hours, 1),
        "has_history": old is not None,
        "tracked_videos": len(videos) if videos is not None else 0,
    }


VIDEO_SORT_OPTIONS = {
    "plays_desc": "播放量 ↓",
    "plays_asc": "播放量 ↑",
    "gain_desc": "24h增加 ↓",
    "today_gain_desc": "今日增加 ↓",
    "likes_desc": "点赞 ↓",
    "date_desc": "最新发布",
    "date_asc": "最早发布",
}


def _video_sort_key(video: Video, deltas: dict[int, int], sort: str):
    gain = deltas.get(video.id, 0)
    pub = _as_utc(video.published_at)
    pub_ts = pub.timestamp() if pub else 0

    if sort == "plays_asc":
        return (video.play_count, -pub_ts, video.id)
    if sort == "gain_desc":
        return (-gain, -video.play_count, video.id)
    if sort == "today_gain_desc":
        return (-gain, -video.play_count, video.id)
    if sort == "likes_desc":
        return (-video.like_count, -video.play_count, video.id)
    if sort == "date_asc":
        return (pub_ts, video.id)
    if sort == "date_desc":
        return (-pub_ts, video.id)
    return (-video.play_count, -pub_ts, video.id)


def sort_account_videos(
    videos: list[Video],
    deltas: dict[int, int],
    sort: str,
    *,
    today_deltas: dict[int, int] | None = None,
) -> list[Video]:
    key = sort if sort in VIDEO_SORT_OPTIONS else "plays_desc"
    use_deltas = today_deltas if key == "today_gain_desc" and today_deltas else deltas
    return sorted(videos, key=lambda v: _video_sort_key(v, use_deltas, key))


def account_videos_growth(db: Session, account: Account, hours: int = 24) -> dict[int, int]:
    since = _utcnow() - timedelta(hours=hours)
    return videos_plays_increase_map(db, list(account.videos), since)
