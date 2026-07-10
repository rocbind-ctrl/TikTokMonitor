from datetime import datetime, timezone, timedelta
from urllib.parse import quote
import asyncio
import json

import yaml
from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.audit import log_action
from app.auth import AuthMiddleware, create_session, destroy_session, web_auth_enabled
from app.deps import ensure_ytdlp
from app.analytics import (
    account_follower_trend,
    account_growth,
    account_total_plays,
    dashboard_trend,
    day_timezone_label,
    employee_post_report_db,
    engagement_rate,
    format_tk_time,
    format_video_time,
    is_in_tk_day,
    today_publish_summary_db,
    top_play_gainers,
    unread_alerts,
    sort_account_videos,
    VIDEO_SORT_OPTIONS as ACCOUNT_VIDEO_SORT_OPTIONS,
    videos_plays_increase_map,
    today_local_bounds,
)
from app.config import get_alert_settings, get_monitor_settings, get_security_settings, load_config
from app.database import Account, Alert, AuditLog, SyncLog, Video, VideoStatsHistory, get_db, init_db
from app.export import export_accounts_csv, export_videos_csv
from app.groups import (
    ACCOUNT_SORT_OPTIONS,
    _apply_filters,
    distinct_values,
    group_stats_list,
    load_active_accounts_metrics,
    query_accounts,
)
from app.intelligence import account_health_score, account_rankings, global_anomalies
from app.provider_health import provider_stats
from app.scheduler import get_scheduler_info, start_scheduler, stop_scheduler
from app.sync_progress import get_progress
from app.sync_service import enqueue_account_sync, pending_sync_count, sync_account, sync_all_accounts
from app.sync_tracker import syncing_ids
from app.system_status import system_overview
from app.paths import CONFIG_PATH, STATIC_DIR, TEMPLATES_DIR
from app.utils import apply_parsed_tags, normalize_username, parse_batch_line

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def _compact_num(value: int) -> str:
    n = int(value or 0)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 10_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,}"


templates.env.filters["compact"] = _compact_num
templates.env.filters["fmt_time"] = format_video_time
templates.env.filters["fmt_dt"] = format_tk_time
templates.env.globals["day_tz_label"] = day_timezone_label


def _query_suffix(**overrides) -> str:
    from urllib.parse import urlencode

    params = {k: v for k, v in overrides.items() if v not in (None, "")}
    return f"?{urlencode(params)}" if params else ""


templates.env.globals["query_suffix"] = _query_suffix

app = FastAPI(title="TikTok 账号监控系统")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(http|https|tauri)://(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

APP_VERSION = "5.0"


def _redirect_with_msg(url: str, status: str, message: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"{url}?sync_status={status}&sync_msg={quote(message)}",
        status_code=303,
    )


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    overview = system_overview(db)
    return {
        "ok": True,
        "version": APP_VERSION,
        "scheduler": overview["scheduler"],
        "accounts": overview["total_accounts"],
        "active_accounts": overview["active_accounts"],
        "unread_alerts": overview["unread_alerts"],
    }


@app.get("/api/stats")
def api_stats(db: Session = Depends(get_db)):
    overview = system_overview(db)
    return {
        "version": APP_VERSION,
        "total_accounts": overview["total_accounts"],
        "active_accounts": overview["active_accounts"],
        "total_videos": overview["total_videos"],
        "total_plays": overview["total_plays"],
        "unread_alerts": overview["unread_alerts"],
        "last_sync_at": overview["last_sync_at"].isoformat() if overview["last_sync_at"] else None,
        "scheduler": overview["scheduler"],
    }


@app.get("/api/alerts")
def api_alerts(limit: int = 50, unread_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Alert).order_by(desc(Alert.created_at))
    if unread_only:
        q = q.filter(Alert.is_read == 0)
    rows = q.limit(min(limit, 200)).all()
    return [
        {
            "id": a.id,
            "level": a.level,
            "type": a.alert_type,
            "title": a.title,
            "message": a.message,
            "is_read": bool(a.is_read),
            "account_id": a.account_id,
            "video_id": a.video_id,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]


@app.get("/api/sync/logs")
def api_sync_logs(limit: int = 50, db: Session = Depends(get_db)):
    logs = (
        db.query(SyncLog)
        .options(joinedload(SyncLog.account))
        .order_by(desc(SyncLog.created_at))
        .limit(min(limit, 200))
        .all()
    )
    return [
        {
            "id": log.id,
            "account_id": log.account_id,
            "username": log.account.username if log.account else None,
            "status": log.status,
            "message": log.message,
            "videos_updated": log.videos_updated,
            "duration_seconds": log.duration_seconds,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@app.get("/api/sync/progress")
def api_sync_progress():
    return get_progress()


@app.get("/api/events/stream")
async def api_event_stream():
    async def generate():
        while True:
            payload = get_progress()
            payload["queue_size"] = pending_sync_count()
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/intelligence/rankings")
def api_rankings(db: Session = Depends(get_db)):
    rows = account_rankings(db, limit=50)
    return [
        {
            "account_id": r["account"].id,
            "username": r["account"].username,
            "health_score": r["health"]["score"],
            "health_grade": r["health"]["grade"],
            "total_plays": r["total_plays"],
            "follower_delta_24h": r["follower_delta"],
            "plays_delta_24h": r["plays_delta"],
            "engagement": r["engagement"],
        }
        for r in rows
    ]


@app.get("/api/intelligence/anomalies")
def api_anomalies(db: Session = Depends(get_db)):
    items = global_anomalies(db, limit=30)
    return [
        {
            "account_id": item["account"].id,
            "username": item["account"].username,
            "type": item["type"],
            "level": item["level"],
            "title": item["title"],
            "message": item["message"],
            "z_score": item.get("z_score"),
        }
        for item in items
    ]


@app.get("/api/providers/health")
def api_provider_health(db: Session = Depends(get_db)):
    return provider_stats(db)


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    if not web_auth_enabled():
        return RedirectResponse(url="/", status_code=303)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/login", response_class=HTMLResponse)
def login_submit(request: Request, password: str = Form(...)):
    expected = (get_security_settings().get("web_password") or "").strip()
    if password == expected:
        token = create_session()
        resp = RedirectResponse(url="/", status_code=303)
        resp.set_cookie("monitor_session", token, httponly=True, max_age=86400 * 7)
        return resp
    return templates.TemplateResponse("login.html", {"request": request, "error": "密码错误"})


@app.post("/logout")
def logout(request: Request):
    destroy_session(request.cookies.get("monitor_session"))
    resp = RedirectResponse(url="/login", status_code=303)
    resp.delete_cookie("monitor_session")
    return resp


@app.post("/api/auth/login")
async def api_login(request: Request):
    payload = {}
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
    else:
        form = await request.form()
        payload = dict(form)

    expected = (get_security_settings().get("web_password") or "").strip()
    password = str(payload.get("password") or "")
    if expected and password != expected:
        return JSONResponse(
            status_code=401,
            content={"authenticated": False, "message": "密码错误"},
        )

    token = create_session()
    resp = JSONResponse(content={"authenticated": True})
    resp.set_cookie(
        "monitor_session",
        token,
        httponly=True,
        max_age=86400 * 7,
        samesite="lax",
    )
    return resp


@app.post("/api/auth/logout")
def api_logout(request: Request):
    destroy_session(request.cookies.get("monitor_session"))
    resp = JSONResponse(content={"authenticated": False})
    resp.delete_cookie("monitor_session")
    return resp


@app.get("/api/auth/session")
def api_session(request: Request):
    from app.auth import check_access

    return {
        "authenticated": check_access(request),
        "auth_enabled": web_auth_enabled(),
        "api_key_enabled": bool((get_security_settings().get("api_key") or "").strip()),
    }


@app.on_event("startup")
def on_startup():
    init_db()
    ensure_ytdlp()
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


def _monitor_settings() -> dict:
    return get_monitor_settings()


def _iso(value):
    return value.isoformat() if value else None


def _account_payload(account: Account, include_videos: bool = False) -> dict:
    videos = list(account.videos or [])
    payload = {
        "id": account.id,
        "username": account.username,
        "nickname": account.nickname,
        "sec_uid": account.sec_uid,
        "avatar_url": account.avatar_url,
        "group": account.group_name,
        "group_name": account.group_name,
        "phone": account.phone,
        "employee": account.employee,
        "note": account.note,
        "is_active": bool(account.is_active),
        "followers": account.follower_count,
        "follower_count": account.follower_count,
        "following_count": account.following_count,
        "total_likes": account.total_likes,
        "tiktok_video_count": account.video_count,
        "videos": len(videos),
        "synced_videos": len(videos),
        "total_plays": account_total_plays(account),
        "engagement_rate": engagement_rate(account),
        "last_sync": _iso(account.last_sync_at),
        "last_sync_at": _iso(account.last_sync_at),
        "created_at": _iso(account.created_at),
    }
    if include_videos:
        payload["video_items"] = [_video_payload(video, include_account=False) for video in videos]
    return payload


def _video_payload(video: Video, include_account: bool = True) -> dict:
    payload = {
        "id": video.id,
        "account_id": video.account_id,
        "video_id": video.video_id,
        "title": video.title,
        "cover_url": video.cover_url,
        "play_count": video.play_count,
        "like_count": video.like_count,
        "comment_count": video.comment_count,
        "share_count": video.share_count,
        "published_at": _iso(video.published_at),
        "last_sync_at": _iso(video.last_sync_at),
        "created_at": _iso(video.created_at),
    }
    if include_account and video.account:
        payload["account"] = {
            "id": video.account.id,
            "username": video.account.username,
            "nickname": video.account.nickname,
        }
    return payload


def _public_settings() -> dict:
    config = load_config()
    security = config.get("security", {})
    return {
        "server": config.get("server", {}),
        "monitor": config.get("monitor", {}),
        "sync": config.get("sync", {}),
        "tiktok": config.get("tiktok", {}),
        "alerts": config.get("alerts", {}),
        "intelligence": config.get("intelligence", {}),
        "notifications": {
            "enabled": bool(config.get("notifications", {}).get("enabled", False)),
            "webhook_configured": bool(config.get("notifications", {}).get("webhook_url")),
            "dingtalk_configured": bool(config.get("notifications", {}).get("dingtalk_webhook")),
            "telegram_configured": bool(config.get("notifications", {}).get("telegram_bot_token")),
            "bark_configured": bool(config.get("notifications", {}).get("bark_url")),
        },
        "security": {
            "web_auth_enabled": bool((security.get("web_password") or "").strip()),
            "api_key_enabled": bool((security.get("api_key") or "").strip()),
        },
    }


def _merge_config(base: dict, updates: dict) -> dict:
    editable_sections = {
        "server",
        "monitor",
        "sync",
        "tiktok",
        "alerts",
        "intelligence",
        "notifications",
    }
    for section, values in (updates or {}).items():
        if section not in editable_sections or not isinstance(values, dict):
            continue
        current = base.setdefault(section, {})
        for key, value in values.items():
            if value is not None:
                current[key] = value
    return base


def _save_config(config: dict) -> None:
    CONFIG_PATH.write_text(
        yaml.safe_dump(config, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    group = request.query_params.get("group", "").strip()
    phone = request.query_params.get("phone", "").strip()
    employee = request.query_params.get("employee", "").strip()
    search = request.query_params.get("q", "").strip()
    post_today = request.query_params.get("post_today", "").strip()
    if post_today not in ("", "yes", "no"):
        post_today = ""
    sort = request.query_params.get("sort", "plays_desc")
    if sort not in ACCOUNT_SORT_OPTIONS:
        sort = "plays_desc"
    try:
        page = max(1, int(request.query_params.get("page", 1) or 1))
    except ValueError:
        page = 1
    try:
        per_page = min(200, max(20, int(request.query_params.get("per_page", 50) or 50)))
    except ValueError:
        per_page = 50

    has_filter_scope = bool(group or phone or employee or search)
    metrics = load_active_accounts_metrics(db)
    account_rows, filtered_total, filter_totals, page = query_accounts(
        db,
        group=group,
        phone=phone,
        employee=employee,
        search=search,
        post_today=post_today,
        sort=sort,
        page=page,
        per_page=per_page,
        metrics=metrics,
    )
    total_pages = max(1, (filtered_total + per_page - 1) // per_page)

    total_accounts = len(metrics["accounts"])
    group_stats = group_stats_list(db, metrics=metrics)
    global_today = today_publish_summary_db(db)
    global_today["plays_increase"] = filter_totals["plays_today"]
    employee_report = employee_post_report_db(db, days=7, metrics=metrics)

    def _qs(**kwargs):
        params = {
            "group": group,
            "phone": phone,
            "employee": employee,
            "q": search,
            "post_today": post_today,
            "sort": sort,
            "per_page": per_page,
        }
        params.update(kwargs)
        return _query_suffix(**params)

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "account_rows": account_rows,
            "filtered_total": filtered_total,
            "filter_totals": filter_totals,
            "total_accounts": total_accounts,
            "group_stats": group_stats,
            "groups": distinct_values(db, Account.group_name),
            "phones": distinct_values(db, Account.phone),
            "employees": distinct_values(db, Account.employee),
            "current_group": group,
            "current_phone": phone,
            "current_employee": employee,
            "current_search": search,
            "current_post_today": post_today,
            "current_sort": sort,
            "has_filter_scope": has_filter_scope,
            "sort_options": ACCOUNT_SORT_OPTIONS,
            "global_today": global_today,
            "employee_report": employee_report,
            "page": page,
            "total_pages": total_pages,
            "per_page": per_page,
            "query_suffix": _qs,
            "syncing_ids": syncing_ids(),
            "sync_queue_size": pending_sync_count(),
            "monitor_interval": _monitor_settings().get("interval_minutes", 30),
            "active_nav": "home",
        },
    )


@app.get("/insights", response_class=HTMLResponse)
def insights_page(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse(
        "insights.html",
        {
            "request": request,
            "rankings": account_rankings(db, limit=20),
            "anomalies": global_anomalies(db, limit=10),
            "gainers": top_play_gainers(db, limit=10, hours=24),
            "trend": dashboard_trend(db, days=7),
            "alerts": unread_alerts(db, limit=10),
            "unread_count": db.query(Alert).filter(Alert.is_read == 0).count(),
            "active_nav": "insights",
        },
    )


@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request, db: Session = Depends(get_db)):
    audit_logs = db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(20).all()
    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "overview": system_overview(db),
            "providers": provider_stats(db),
            "audit_logs": audit_logs,
            "auth_enabled": web_auth_enabled(),
            "active_nav": "settings",
        },
    )


@app.get("/logs", response_class=HTMLResponse)
def logs_page(request: Request, db: Session = Depends(get_db), page: int = 1):
    per_page = 50
    total = db.query(SyncLog).count()
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    logs = (
        db.query(SyncLog)
        .options(joinedload(SyncLog.account))
        .order_by(desc(SyncLog.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return templates.TemplateResponse(
        "logs.html",
        {
            "request": request,
            "logs": logs,
            "page": page,
            "total_pages": total_pages,
            "total": total,
            "active_nav": "logs",
        },
    )


@app.get("/alerts", response_class=HTMLResponse)
def alerts_page(request: Request, db: Session = Depends(get_db), page: int = 1):
    per_page = 30
    total = db.query(Alert).count()
    unread_count = db.query(Alert).filter(Alert.is_read == 0).count()
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    alerts = (
        db.query(Alert)
        .order_by(desc(Alert.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return templates.TemplateResponse(
        "alerts_page.html",
        {
            "request": request,
            "alerts": alerts,
            "unread_count": unread_count,
            "page": page,
            "total_pages": total_pages,
            "total": total,
            "active_nav": "alerts",
        },
    )


@app.get("/account/{account_id}", response_class=HTMLResponse)
def account_detail(account_id: int, request: Request, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")

    video_sort = request.query_params.get("sort", "plays_desc").strip()
    if video_sort not in ACCOUNT_VIDEO_SORT_OPTIONS:
        video_sort = "plays_desc"

    videos = db.query(Video).filter(Video.account_id == account_id).all()
    total_plays = sum(v.play_count for v in videos)

    from app.analytics import account_growth_fast

    past_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    start_today, _ = today_local_bounds()
    delta_24h_map = videos_plays_increase_map(db, videos, past_24h)
    delta_today_map = videos_plays_increase_map(db, videos, start_today)
    videos = sort_account_videos(
        videos, delta_24h_map, video_sort, today_deltas=delta_today_map
    )

    growth = account_growth_fast(
        db,
        account,
        total_plays,
        videos=videos,
        delta_24h_map=delta_24h_map,
        delta_today_map=delta_today_map,
    )

    today_videos = [v for v in videos if is_in_tk_day(v.published_at)]
    logs = (
        db.query(SyncLog)
        .filter(SyncLog.account_id == account_id)
        .order_by(desc(SyncLog.created_at))
        .limit(20)
        .all()
    )
    trend = account_follower_trend(db, account_id, days=30)
    account.videos = videos

    return templates.TemplateResponse(
        "account.html",
        {
            "request": request,
            "account": account,
            "videos": videos,
            "logs": logs,
            "last_log": logs[0] if logs else None,
            "total_plays": total_plays,
            "engagement": engagement_rate(account),
            "growth": growth,
            "trend": trend,
            "today_video_ids": {v.id for v in today_videos},
            "today_post_count": len(today_videos),
            "video_growth_24h": delta_24h_map,
            "video_growth_today": delta_today_map,
            "current_video_sort": video_sort,
            "video_sort_options": ACCOUNT_VIDEO_SORT_OPTIONS,
            "groups": distinct_values(db, Account.group_name),
            "phones": distinct_values(db, Account.phone),
            "employees": distinct_values(db, Account.employee),
            "active_nav": "home",
        },
    )


@app.get("/video/{video_id}", response_class=HTMLResponse)
def video_detail(video_id: int, request: Request, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    account = db.query(Account).filter(Account.id == video.account_id).first()
    history = (
        db.query(VideoStatsHistory)
        .filter(VideoStatsHistory.video_id == video_id)
        .order_by(VideoStatsHistory.recorded_at)
        .all()
    )

    chart_labels = [format_tk_time(h.recorded_at, "%m-%d %H:%M") for h in history]
    chart_plays = [h.play_count for h in history]

    history_rows = []
    for i, h in enumerate(reversed(history)):
        prev = history[len(history) - i - 2] if i < len(history) - 1 else None
        delta = h.play_count - prev.play_count if prev else 0
        history_rows.append({"record": h, "delta": delta})

    return templates.TemplateResponse(
        "video.html",
        {
            "request": request,
            "video": video,
            "account": account,
            "history_rows": history_rows,
            "chart_labels": chart_labels,
            "chart_plays": chart_plays,
        },
    )


@app.post("/accounts/add")
def add_account(
    username: str = Form(...),
    group_name: str = Form(""),
    phone: str = Form(""),
    employee: str = Form(""),
    note: str = Form(""),
    db: Session = Depends(get_db),
):
    username = normalize_username(username)
    if not username:
        return _redirect_with_msg("/", "error", "请输入有效的 TikTok 用户名或主页链接")

    existing = db.query(Account).filter(func.lower(Account.username) == username.lower()).first()
    if existing:
        return _redirect_with_msg(
            f"/account/{existing.id}",
            "error",
            f"账号 @{username} 已存在",
        )

    account = Account(
        username=username,
        group_name=group_name.strip(),
        phone=phone.strip(),
        employee=employee.strip(),
        note=note.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    log_action(db, "add_account", f"@{username}", account_id=account.id)
    db.commit()

    enqueue_account_sync([account.id])
    return _redirect_with_msg(
        f"/account/{account.id}",
        "success",
        f"@{username} 已添加，已加入同步队列…",
    )


@app.post("/accounts/batch-add")
def batch_add_accounts(
    raw: str = Form(...),
    group_name: str = Form(""),
    phone: str = Form(""),
    employee: str = Form(""),
    db: Session = Depends(get_db),
):
    defaults = {
        "group_name": group_name.strip(),
        "phone": phone.strip(),
        "employee": employee.strip(),
    }

    parsed_lines: list[dict] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        parsed = parse_batch_line(line)
        if not parsed:
            continue
        key = parsed["username"].lower()
        if key in seen:
            continue
        seen.add(key)
        parsed_lines.append(parsed)

    if not parsed_lines:
        return _redirect_with_msg("/", "error", "没有有效的账号行，请检查格式")

    if len(parsed_lines) > 500:
        return _redirect_with_msg("/", "error", "单次最多导入 500 个账号")

    names_lower = list(seen)
    existing_rows = {
        row.username.lower(): row
        for row in db.query(Account).filter(func.lower(Account.username).in_(names_lower)).all()
    }

    added_ids: list[int] = []
    updated_ids: list[int] = []
    added = 0
    updated = 0
    for parsed in parsed_lines:
        key = parsed["username"].lower()
        existing = existing_rows.get(key)
        if existing:
            apply_parsed_tags(existing, parsed, defaults)
            updated += 1
            updated_ids.append(existing.id)
            continue

        account = Account(
            username=parsed["username"],
            group_name=(parsed["group_name"] or defaults["group_name"]).strip(),
            phone=(parsed["phone"] or defaults["phone"]).strip(),
            employee=(parsed["employee"] or defaults["employee"]).strip(),
            note=parsed.get("note", "").strip(),
            created_at=datetime.now(timezone.utc),
        )
        db.add(account)
        db.flush()
        added_ids.append(account.id)
        added += 1

    db.commit()
    sync_ids = list(dict.fromkeys(added_ids + updated_ids))
    if sync_ids:
        enqueue_account_sync(sync_ids)

    parts = []
    if added:
        parts.append(f"新增 {added} 个")
    if updated:
        parts.append(f"更新标签 {updated} 个")
    msg = "，".join(parts) if parts else "没有变更"
    if sync_ids:
        msg += f"，{len(sync_ids)} 个已加入同步队列"
    return _redirect_with_msg("/", "success", msg)


@app.post("/accounts/{account_id}/edit")
def edit_account(
    account_id: int,
    group_name: str = Form(""),
    phone: str = Form(""),
    employee: str = Form(""),
    note: str = Form(""),
    db: Session = Depends(get_db),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    account.group_name = group_name.strip()
    account.phone = phone.strip()
    account.employee = employee.strip()
    account.note = note.strip()
    db.commit()
    return RedirectResponse(url=f"/account/{account_id}", status_code=303)


@app.post("/api/accounts/{account_id}/tags")
def api_update_tags(
    account_id: int,
    group_name: str = Form(""),
    phone: str = Form(""),
    employee: str = Form(""),
    note: str = Form(""),
    db: Session = Depends(get_db),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return JSONResponse(status_code=404, content={"status": "error", "message": "账号不存在"})
    account.group_name = group_name.strip()
    account.phone = phone.strip()
    account.employee = employee.strip()
    account.note = note.strip()
    db.commit()
    return {
        "status": "success",
        "message": "已保存",
        "tags": {
            "group_name": account.group_name,
            "phone": account.phone,
            "employee": account.employee,
            "note": account.note,
        },
    }


@app.post("/accounts/bulk-tag")
def bulk_tag_accounts(
    request: Request,
    group_name: str = Form(""),
    phone: str = Form(""),
    employee: str = Form(""),
    db: Session = Depends(get_db),
):
    group = request.query_params.get("group", "").strip()
    phone_f = request.query_params.get("phone", "").strip()
    employee_f = request.query_params.get("employee", "").strip()
    search = request.query_params.get("q", "").strip()

    q = db.query(Account).filter(Account.is_active == 1)
    q = _apply_filters(q, group, phone_f, employee_f, search)
    accounts = q.all()
    updated = 0
    for acc in accounts:
        if group_name.strip():
            acc.group_name = group_name.strip()
        if phone.strip():
            acc.phone = phone.strip()
        if employee.strip():
            acc.employee = employee.strip()
        updated += 1
    db.commit()
    return _redirect_with_msg("/", "success", f"已更新 {updated} 个账号的标签")


@app.post("/api/accounts/add")
def api_add_account(
    username: str = Form(...),
    group_name: str = Form(""),
    phone: str = Form(""),
    employee: str = Form(""),
    note: str = Form(""),
    db: Session = Depends(get_db),
):
    username = normalize_username(username)
    if not username:
        return JSONResponse(content={"status": "error", "message": "请输入有效的用户名或 TikTok 链接"})

    existing = db.query(Account).filter(func.lower(Account.username) == username.lower()).first()
    if existing:
        return JSONResponse(
            content={"status": "error", "message": f"@{username} 已在监控列表中", "account_id": existing.id}
        )

    account = Account(
        username=username,
        group_name=group_name.strip(),
        phone=phone.strip(),
        employee=employee.strip(),
        note=note.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    log_action(db, "add_account", f"@{username}", account_id=account.id)
    db.commit()
    enqueue_account_sync([account.id])
    return JSONResponse(
        content={
            "status": "success",
            "message": f"@{username} 已添加，已加入同步队列",
            "account_id": account.id,
        }
    )


@app.get("/export/accounts.csv")
def export_accounts(db: Session = Depends(get_db)):
    content = export_accounts_csv(db)
    return Response(
        content="\ufeff" + content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=accounts.csv"},
    )


@app.get("/export/videos.csv")
def export_videos(db: Session = Depends(get_db)):
    content = export_videos_csv(db)
    return Response(
        content="\ufeff" + content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=videos.csv"},
    )


@app.get("/api/accounts")
def api_list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(Account).options(joinedload(Account.videos)).order_by(Account.id).all()
    return [_account_payload(account) for account in accounts]


@app.post("/api/accounts")
async def api_create_account(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    username = normalize_username(str(payload.get("username") or ""))
    if not username:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "请输入有效的 TikTok 用户名或主页链接"},
        )

    existing = db.query(Account).filter(func.lower(Account.username) == username.lower()).first()
    if existing:
        return JSONResponse(
            status_code=409,
            content={
                "status": "error",
                "message": f"@{username} 已在监控列表中",
                "account": _account_payload(existing),
            },
        )

    account = Account(
        username=username,
        group_name=str(payload.get("group_name") or payload.get("group") or "").strip(),
        phone=str(payload.get("phone") or "").strip(),
        employee=str(payload.get("employee") or "").strip(),
        note=str(payload.get("note") or "").strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    log_action(db, "add_account", f"@{username}", account_id=account.id)
    db.commit()

    if payload.get("sync", True):
        enqueue_account_sync([account.id])

    return JSONResponse(
        status_code=201,
        content={
            "status": "success",
            "message": f"@{username} 已添加",
            "account": _account_payload(account),
        },
    )


@app.post("/api/accounts/import")
async def api_import_accounts(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    raw = str(payload.get("raw") or payload.get("text") or "")
    defaults = {
        "group_name": str(payload.get("group_name") or payload.get("group") or "").strip(),
        "phone": str(payload.get("phone") or "").strip(),
        "employee": str(payload.get("employee") or "").strip(),
    }

    parsed_lines: list[dict] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        parsed = parse_batch_line(line)
        if not parsed:
            continue
        key = parsed["username"].lower()
        if key in seen:
            continue
        seen.add(key)
        parsed_lines.append(parsed)

    if not parsed_lines:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "没有有效的账号行"},
        )
    if len(parsed_lines) > 500:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "单次最多导入 500 个账号"},
        )

    existing_rows = {
        row.username.lower(): row
        for row in db.query(Account).filter(func.lower(Account.username).in_(list(seen))).all()
    }
    added_ids: list[int] = []
    updated_ids: list[int] = []
    for parsed in parsed_lines:
        key = parsed["username"].lower()
        existing = existing_rows.get(key)
        if existing:
            apply_parsed_tags(existing, parsed, defaults)
            updated_ids.append(existing.id)
            continue
        account = Account(
            username=parsed["username"],
            group_name=(parsed["group_name"] or defaults["group_name"]).strip(),
            phone=(parsed["phone"] or defaults["phone"]).strip(),
            employee=(parsed["employee"] or defaults["employee"]).strip(),
            note=parsed.get("note", "").strip(),
            created_at=datetime.now(timezone.utc),
        )
        db.add(account)
        db.flush()
        added_ids.append(account.id)

    db.commit()
    sync_ids = list(dict.fromkeys(added_ids + updated_ids))
    if payload.get("sync", True) and sync_ids:
        enqueue_account_sync(sync_ids)

    return {
        "status": "success",
        "added": len(added_ids),
        "updated": len(updated_ids),
        "queued": len(sync_ids) if payload.get("sync", True) else 0,
        "account_ids": sync_ids,
    }


@app.get("/api/accounts/{account_id}")
def api_account_detail(account_id: int, db: Session = Depends(get_db)):
    account = (
        db.query(Account)
        .options(joinedload(Account.videos))
        .filter(Account.id == account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    logs = (
        db.query(SyncLog)
        .filter(SyncLog.account_id == account_id)
        .order_by(desc(SyncLog.created_at))
        .limit(20)
        .all()
    )
    payload = _account_payload(account, include_videos=True)
    payload["logs"] = [
        {
            "id": log.id,
            "status": log.status,
            "message": log.message,
            "videos_updated": log.videos_updated,
            "duration_seconds": log.duration_seconds,
            "provider_used": log.provider_used,
            "retry_count": log.retry_count,
            "created_at": _iso(log.created_at),
        }
        for log in logs
    ]
    return payload


@app.patch("/api/accounts/{account_id}")
async def api_patch_account(account_id: int, request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")

    if "username" in payload:
        username = normalize_username(str(payload.get("username") or ""))
        if not username:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "用户名无效"},
            )
        existing = (
            db.query(Account)
            .filter(func.lower(Account.username) == username.lower(), Account.id != account_id)
            .first()
        )
        if existing:
            return JSONResponse(
                status_code=409,
                content={"status": "error", "message": f"@{username} 已存在"},
            )
        account.username = username

    for attr, keys in {
        "group_name": ("group_name", "group"),
        "phone": ("phone",),
        "employee": ("employee",),
        "note": ("note",),
    }.items():
        for key in keys:
            if key in payload:
                setattr(account, attr, str(payload.get(key) or "").strip())
                break
    if "is_active" in payload:
        account.is_active = 1 if payload.get("is_active") else 0

    log_action(db, "edit_account", f"@{account.username}", account_id=account.id)
    db.commit()
    db.refresh(account)
    return {"status": "success", "account": _account_payload(account)}


@app.delete("/api/accounts/{account_id}")
def api_delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    username = account.username
    log_action(db, "delete_account", f"@{username}", account_id=account_id)
    db.delete(account)
    db.commit()
    return {"status": "success", "message": f"@{username} 已删除"}


@app.get("/api/videos/{video_id}")
def api_video_detail(video_id: int, db: Session = Depends(get_db)):
    video = (
        db.query(Video)
        .options(joinedload(Video.account))
        .filter(Video.id == video_id)
        .first()
    )
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    history = (
        db.query(VideoStatsHistory)
        .filter(VideoStatsHistory.video_id == video_id)
        .order_by(VideoStatsHistory.recorded_at)
        .all()
    )
    payload = _video_payload(video)
    payload["history"] = [
        {
            "id": row.id,
            "play_count": row.play_count,
            "like_count": row.like_count,
            "comment_count": row.comment_count,
            "share_count": row.share_count,
            "recorded_at": _iso(row.recorded_at),
        }
        for row in history
    ]
    return payload


@app.post("/api/alerts/{alert_id}/read")
def api_read_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")
    alert.is_read = 1
    db.commit()
    return {"status": "success", "alert_id": alert_id}


@app.post("/api/alerts/read-all")
def api_read_all_alerts(db: Session = Depends(get_db)):
    updated = db.query(Alert).filter(Alert.is_read == 0).update({"is_read": 1})
    db.commit()
    return {"status": "success", "updated": updated}


@app.get("/api/settings")
def api_get_settings():
    return _public_settings()


@app.patch("/api/settings")
async def api_patch_settings(request: Request):
    payload = await request.json()
    config = _merge_config(load_config(), payload)
    _save_config(config)
    return {"status": "success", "settings": _public_settings()}


@app.post("/alerts/{alert_id}/read")
def read_alert(alert_id: int, request: Request, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert:
        alert.is_read = 1
        db.commit()
    referer = request.headers.get("referer") or "/"
    return RedirectResponse(url=referer, status_code=303)


@app.post("/alerts/read-all")
def read_all_alerts(request: Request, db: Session = Depends(get_db)):
    db.query(Alert).filter(Alert.is_read == 0).update({"is_read": 1})
    db.commit()
    referer = request.headers.get("referer") or "/"
    return RedirectResponse(url=referer, status_code=303)


def _account_stats(account: Account) -> dict:
    synced = len(account.videos)
    total_plays = sum(v.play_count for v in account.videos)
    return {
        "follower_count": account.follower_count,
        "synced_videos": synced,
        "tiktok_video_count": account.video_count,
        "total_plays": total_plays,
    }


@app.post("/api/accounts/{account_id}/sync")
def api_sync_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return JSONResponse(status_code=404, content={"status": "error", "message": "账号不存在"})

    enqueue_account_sync([account_id])
    return JSONResponse(
        content={
            "status": "success",
            "message": f"@{account.username} 已加入同步队列",
        }
    )


@app.post("/api/sync/all")
def api_sync_all(db: Session = Depends(get_db)):
    ids = [
        row.id
        for row in db.query(Account.id).filter(Account.is_active == 1).order_by(Account.id).all()
    ]
    if not ids:
        return JSONResponse(content={"status": "success", "message": "没有可同步的账号"})
    enqueue_account_sync(ids)
    return JSONResponse(
        content={
            "status": "success",
            "message": f"已加入同步队列（{len(ids)} 个账号）",
        }
    )


@app.post("/accounts/{account_id}/sync")
def sync_one(account_id: int, request: Request, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")

    if "application/json" in (request.headers.get("accept") or ""):
        return api_sync_account(account_id, db)

    settings = _monitor_settings()
    log = sync_account(db, account, max_videos=int(settings.get("max_videos_per_account", 50)))
    db.add(log)
    db.commit()
    account = (
        db.query(Account)
        .options(joinedload(Account.videos))
        .filter(Account.id == account_id)
        .first()
    )
    total_plays = sum(v.play_count for v in account.videos)
    if log.status == "success" and log.videos_updated:
        log.message = f"{log.message}（共 {len(account.videos)} 个视频，总播放 {total_plays:,}）"
    return _redirect_with_msg(f"/account/{account_id}", log.status, log.message)


@app.post("/sync/all")
def sync_all(request: Request, db: Session = Depends(get_db)):
    if "application/json" in (request.headers.get("accept") or ""):
        return api_sync_all(db)
    settings = _monitor_settings()
    logs = sync_all_accounts(db, max_videos=int(settings.get("max_videos_per_account", 50)))
    ok = sum(1 for log in logs if log.status == "success")
    msg = f"同步完成：{ok}/{len(logs)} 个账号成功"
    status = "success" if ok == len(logs) else "error"
    return _redirect_with_msg("/", status, msg)


@app.post("/accounts/{account_id}/toggle")
def toggle_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    account.is_active = 0 if account.is_active else 1
    log_action(db, "toggle_account", f"@{account.username} -> {'paused' if not account.is_active else 'active'}", account_id=account_id)
    db.commit()
    return RedirectResponse(url="/", status_code=303)


@app.post("/accounts/{account_id}/delete")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    log_action(db, "delete_account", f"@{account.username}", account_id=account_id)
    db.delete(account)
    db.commit()
    return RedirectResponse(url="/", status_code=303)
