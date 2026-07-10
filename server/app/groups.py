"""分组、筛选与品类统计。"""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.analytics import (
    _latest_today_video,
    _utcnow,
    account_growth_fast,
    today_db_bounds,
    today_local_bounds,
    videos_plays_increase_map,
)
from app.database import Account, Video, chunked


ACCOUNT_SORT_OPTIONS = {
    "plays_desc": "播放量 ↓",
    "gain_desc": "24h增播 ↓",
    "today_gain_desc": "今日增播 ↓",
    "today_new_plays_desc": "新发播放 ↓",
    "followers_desc": "粉丝 ↓",
    "today_posts_desc": "今日新发 ↓",
}


def distinct_values(db: Session, column) -> list[str]:
    rows = (
        db.query(column)
        .filter(column != "", column.isnot(None))
        .distinct()
        .order_by(column)
        .all()
    )
    return [r[0] for r in rows if r[0]]


def _apply_filters(
    q,
    group: str = "",
    phone: str = "",
    employee: str = "",
    search: str = "",
):
    if group:
        q = q.filter(Account.group_name == group)
    if phone:
        q = q.filter(Account.phone == phone)
    if employee:
        if employee == "未分配":
            q = q.filter((Account.employee == "") | (Account.employee.is_(None)))
        else:
            q = q.filter(Account.employee == employee)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Account.username.ilike(like))
            | (Account.nickname.ilike(like))
            | (Account.group_name.ilike(like))
            | (Account.phone.ilike(like))
            | (Account.employee.ilike(like))
            | (Account.note.ilike(like))
        )
    return q


def _play_totals_map(db: Session, account_ids: list[int]) -> dict[int, int]:
    if not account_ids:
        return {}
    rows = []
    for chunk in chunked(account_ids):
        rows.extend(
            db.query(Video.account_id, func.coalesce(func.sum(Video.play_count), 0))
            .filter(Video.account_id.in_(chunk))
            .group_by(Video.account_id)
            .all()
        )
    return {int(aid): int(total) for aid, total in rows}


def _today_videos_map(db: Session, account_ids: list[int]) -> dict[int, list]:
    if not account_ids:
        return {}
    start, end = today_db_bounds()
    videos = []
    for chunk in chunked(account_ids):
        videos.extend(
            db.query(Video)
            .filter(
                Video.account_id.in_(chunk),
                Video.published_at >= start,
                Video.published_at < end,
            )
            .all()
        )
    result: dict[int, list] = {}
    for v in videos:
        result.setdefault(v.account_id, []).append(v)
    return result


def _account_matches_filters(
    account: Account,
    *,
    group: str = "",
    phone: str = "",
    employee: str = "",
    search: str = "",
) -> bool:
    if group and account.group_name != group:
        return False
    if phone and account.phone != phone:
        return False
    if employee:
        emp = (account.employee or "").strip()
        if employee == "未分配":
            if emp:
                return False
        elif emp != employee:
            return False
    if search:
        like = search.lower()
        haystack = " ".join(
            [
                account.username or "",
                account.nickname or "",
                account.group_name or "",
                account.phone or "",
                account.employee or "",
                account.note or "",
            ]
        ).lower()
        if like not in haystack:
            return False
    return True


def load_active_accounts_metrics(db: Session) -> dict:
    """一次加载首页所需的账号、视频与增播统计，避免重复查库。"""
    all_accounts = db.query(Account).filter(Account.is_active == 1).all()
    account_ids = [a.id for a in all_accounts]
    play_map = _play_totals_map(db, account_ids)
    today_map = _today_videos_map(db, account_ids)

    all_videos: list[Video] = []
    if account_ids:
        for chunk in chunked(account_ids):
            all_videos.extend(db.query(Video).filter(Video.account_id.in_(chunk)).all())

    videos_by_account: dict[int, list[Video]] = defaultdict(list)
    for video in all_videos:
        videos_by_account[video.account_id].append(video)

    past_24h = _utcnow() - timedelta(hours=24)
    start_today, _ = today_local_bounds()
    delta_24h_map = videos_plays_increase_map(db, all_videos, past_24h)
    delta_today_map = videos_plays_increase_map(db, all_videos, start_today)

    return {
        "accounts": all_accounts,
        "play_map": play_map,
        "today_map": today_map,
        "all_videos": all_videos,
        "videos_by_account": videos_by_account,
        "delta_24h_map": delta_24h_map,
        "delta_today_map": delta_today_map,
        "start_today": start_today,
    }


def _build_account_rows(
    db: Session,
    accounts: list[Account],
    metrics: dict,
) -> list[dict]:
    play_map = metrics["play_map"]
    today_map = metrics["today_map"]
    videos_by_account = metrics["videos_by_account"]
    delta_24h_map = metrics["delta_24h_map"]
    delta_today_map = metrics["delta_today_map"]

    rows = []
    for account in accounts:
        total_plays = play_map.get(account.id, 0)
        today_videos = today_map.get(account.id, [])
        acc_videos = videos_by_account.get(account.id, [])
        latest = _latest_today_video(today_videos)
        today_new_plays = latest.play_count if latest else 0
        growth = account_growth_fast(
            db,
            account,
            total_plays,
            videos=acc_videos,
            delta_24h_map=delta_24h_map,
            delta_today_map=delta_today_map,
            skip_account_history=True,
        )
        rows.append(
            {
                "account": account,
                "total_plays": total_plays,
                "growth": growth,
                "today_post_count": len(today_videos),
                "today_new_plays": today_new_plays,
                "today_latest_video": latest,
                "today_videos": today_videos,
                "posted_today": len(today_videos) > 0,
            }
        )
    return rows


def sort_account_rows(rows: list[dict], sort: str) -> list[dict]:
    key = sort if sort in ACCOUNT_SORT_OPTIONS else "plays_desc"
    if key == "gain_desc":
        return sorted(rows, key=lambda r: r["growth"]["plays_increase"], reverse=True)
    if key == "today_gain_desc":
        return sorted(rows, key=lambda r: r["growth"]["today_plays_increase"], reverse=True)
    if key == "today_new_plays_desc":
        return sorted(rows, key=lambda r: r["today_new_plays"], reverse=True)
    if key == "followers_desc":
        return sorted(rows, key=lambda r: r["account"].follower_count, reverse=True)
    if key == "today_posts_desc":
        return sorted(rows, key=lambda r: r["today_post_count"], reverse=True)
    return sorted(rows, key=lambda r: r["total_plays"], reverse=True)


def query_accounts(
    db: Session,
    *,
    group: str = "",
    phone: str = "",
    employee: str = "",
    search: str = "",
    post_today: str = "",
    sort: str = "plays_desc",
    page: int = 1,
    per_page: int = 50,
    metrics: dict | None = None,
) -> tuple[list[dict], int, dict, int]:
    bundle = metrics or load_active_accounts_metrics(db)
    all_accounts = [
        account
        for account in bundle["accounts"]
        if _account_matches_filters(
            account, group=group, phone=phone, employee=employee, search=search
        )
    ]

    rows = _build_account_rows(db, all_accounts, bundle)
    if post_today == "yes":
        rows = [r for r in rows if r["posted_today"]]
    elif post_today == "no":
        rows = [r for r in rows if not r["posted_today"]]

    rows = sort_account_rows(rows, sort)
    total = len(rows)
    max_page = max(1, (total + per_page - 1) // per_page)
    page = min(max(1, page), max_page)
    start = (page - 1) * per_page
    page_rows = rows[start : start + per_page]

    filter_totals = {
        "account_count": total,
        "total_plays": sum(r["total_plays"] for r in rows),
        "plays_24h": sum(r["growth"]["plays_increase"] for r in rows),
        "plays_today": sum(r["growth"]["today_plays_increase"] for r in rows),
        "today_new_plays": sum(r["today_new_plays"] for r in rows),
        "today_videos": sum(r["today_post_count"] for r in rows),
        "posted_accounts": sum(1 for r in rows if r["posted_today"]),
        "not_posted_accounts": sum(1 for r in rows if not r["posted_today"]),
    }
    return page_rows, total, filter_totals, page


def group_stats_list(db: Session, metrics: dict | None = None) -> list[dict]:
    bundle = metrics or load_active_accounts_metrics(db)
    accounts = bundle["accounts"]
    if not accounts:
        return []

    play_map = bundle["play_map"]
    delta_24h_map = bundle["delta_24h_map"]
    videos_by_account = bundle["videos_by_account"]
    buckets: dict[str, dict] = {}

    for acc in accounts:
        key = acc.group_name.strip() or "未分组"
        if key not in buckets:
            buckets[key] = {
                "group_name": key,
                "accounts": [],
                "total_plays": 0,
                "plays_24h": 0,
            }
        plays = play_map.get(acc.id, 0)
        acc_videos = videos_by_account.get(acc.id, [])
        inc = account_growth_fast(
            db, acc, plays, videos=acc_videos, delta_24h_map=delta_24h_map, skip_account_history=True
        )["plays_increase"]
        buckets[key]["accounts"].append(
            {"account": acc, "total_plays": plays, "plays_24h": inc}
        )
        buckets[key]["total_plays"] += plays
        buckets[key]["plays_24h"] += inc

    rows = []
    for data in buckets.values():
        top = sorted(data["accounts"], key=lambda x: x["total_plays"], reverse=True)[:3]
        rows.append(
            {
                "group_name": data["group_name"],
                "account_count": len(data["accounts"]),
                "total_plays": data["total_plays"],
                "plays_24h": data["plays_24h"],
                "top_accounts": top,
            }
        )
    return sorted(rows, key=lambda r: r["total_plays"], reverse=True)
