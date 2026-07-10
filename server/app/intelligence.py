import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.analytics import account_growth, account_total_plays, engagement_rate
from app.database import Account, AccountStatsHistory, SyncLog


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sync_success_rate(db: Session, account_id: int, limit: int = 20) -> float:
    logs = (
        db.query(SyncLog)
        .filter(SyncLog.account_id == account_id)
        .order_by(desc(SyncLog.created_at))
        .limit(limit)
        .all()
    )
    if not logs:
        return 100.0
    ok = sum(1 for log in logs if log.status == "success")
    return ok / len(logs) * 100


def _freshness_score(last_sync: datetime | None) -> float:
    if not last_sync:
        return 0.0
    if last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)
    hours = (_utcnow() - last_sync).total_seconds() / 3600
    if hours <= 1:
        return 100.0
    if hours <= 6:
        return 80.0
    if hours <= 24:
        return 50.0
    if hours <= 72:
        return 25.0
    return 10.0


def account_health_score(db: Session, account: Account) -> dict:
    sync_rate = _sync_success_rate(db, account.id)
    freshness = _freshness_score(account.last_sync_at)
    growth = account_growth(db, account, hours=24)
    engagement = min(engagement_rate(account) * 10, 100)

    growth_score = 50.0
    if growth["follower_delta"] > 0:
        growth_score += min(growth["follower_delta"] / 10, 25)
    if growth["plays_delta"] > 0:
        growth_score += min(growth["plays_delta"] / 10000, 25)
    growth_score = min(growth_score, 100.0)

    score = round(sync_rate * 0.35 + freshness * 0.25 + growth_score * 0.2 + engagement * 0.2)
    score = max(0, min(100, score))

    if score >= 80:
        grade, color = "A", "health-a"
    elif score >= 60:
        grade, color = "B", "health-b"
    elif score >= 40:
        grade, color = "C", "health-c"
    else:
        grade, color = "D", "health-d"

    return {
        "score": score,
        "grade": grade,
        "color": color,
        "sync_rate": round(sync_rate, 1),
        "freshness": round(freshness, 1),
        "growth_score": round(growth_score, 1),
        "engagement": engagement,
    }


def detect_anomalies(db: Session, account: Account, window: int = 10) -> list[dict]:
    rows = (
        db.query(AccountStatsHistory)
        .filter(AccountStatsHistory.account_id == account.id)
        .order_by(desc(AccountStatsHistory.recorded_at))
        .limit(window + 1)
        .all()
    )
    if len(rows) < 4:
        return []

    deltas = []
    for i in range(len(rows) - 1):
        deltas.append(rows[i].total_plays - rows[i + 1].total_plays)

    if len(deltas) < 3:
        return []

    latest = deltas[0]
    history = deltas[1:]
    mean = sum(history) / len(history)
    variance = sum((x - mean) ** 2 for x in history) / len(history)
    std = math.sqrt(variance) if variance > 0 else 1.0

    anomalies = []
    z = (latest - mean) / std if std > 0 else 0

    if z >= 2.5 and latest > 0:
        anomalies.append(
            {
                "type": "play_anomaly_surge",
                "level": "warning",
                "title": f"@{account.username} 播放异常激增",
                "message": f"本次增长 {latest:,}，超出历史均值 {mean:,.0f} 的 {z:.1f} 倍标准差",
                "z_score": round(z, 2),
            }
        )
    elif z <= -2.5 and latest < 0:
        anomalies.append(
            {
                "type": "play_anomaly_drop",
                "level": "error",
                "title": f"@{account.username} 播放异常下降",
                "message": f"本次变化 {latest:,}，偏离历史均值（z={z:.1f}）",
                "z_score": round(z, 2),
            }
        )

    follower_deltas = []
    for i in range(len(rows) - 1):
        follower_deltas.append(rows[i].follower_count - rows[i + 1].follower_count)
    if len(follower_deltas) >= 3:
        flatest = follower_deltas[0]
        fhist = follower_deltas[1:]
        fmean = sum(fhist) / len(fhist)
        fvar = sum((x - fmean) ** 2 for x in fhist) / len(fhist)
        fstd = math.sqrt(fvar) if fvar > 0 else 1.0
        fz = (flatest - fmean) / fstd if fstd > 0 else 0
        if fz <= -2.5 and flatest < -5:
            anomalies.append(
                {
                    "type": "follower_anomaly_drop",
                    "level": "error",
                    "title": f"@{account.username} 粉丝异常流失",
                    "message": f"粉丝变化 {flatest:,}，z-score={fz:.1f}",
                    "z_score": round(fz, 2),
                }
            )

    return anomalies


def account_rankings(db: Session, limit: int = 20) -> list[dict]:
    accounts = db.query(Account).filter(Account.is_active == 1).all()
    ranked = []
    for account in accounts:
        health = account_health_score(db, account)
        growth = account_growth(db, account, hours=24)
        ranked.append(
            {
                "account": account,
                "health": health,
                "total_plays": account_total_plays(account),
                "follower_delta": growth["follower_delta"],
                "plays_delta": growth["plays_delta"],
                "engagement": engagement_rate(account),
            }
        )
    ranked.sort(key=lambda x: (x["health"]["score"], x["plays_delta"]), reverse=True)
    return ranked[:limit]


def global_anomalies(db: Session, limit: int = 15) -> list[dict]:
    accounts = db.query(Account).filter(Account.is_active == 1).all()
    found = []
    for account in accounts:
        for item in detect_anomalies(db, account):
            found.append({"account": account, **item})
    found.sort(key=lambda x: abs(x.get("z_score", 0)), reverse=True)
    return found[:limit]
