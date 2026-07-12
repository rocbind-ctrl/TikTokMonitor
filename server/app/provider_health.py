from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import ProviderHealth


def _n(value, default: int = 0) -> int:
    return default if value is None else value


def _f(value, default: float = 0.0) -> float:
    return default if value is None else value


def record_provider_result(db: Session, provider: str, success: bool, latency_ms: float = 0) -> None:
    row = db.query(ProviderHealth).filter(ProviderHealth.provider == provider).first()
    if not row:
        row = ProviderHealth(
            provider=provider,
            success_count=0,
            failure_count=0,
            consecutive_failures=0,
            avg_latency_ms=0.0,
        )
        db.add(row)
        db.flush()

    if success:
        row.success_count = _n(row.success_count) + 1
        row.consecutive_failures = 0
        row.last_success_at = datetime.now(timezone.utc)
    else:
        row.failure_count = _n(row.failure_count) + 1
        row.consecutive_failures = _n(row.consecutive_failures) + 1
        row.last_failure_at = datetime.now(timezone.utc)

    if latency_ms > 0 and success:
        prev_avg = _f(row.avg_latency_ms)
        count = _n(row.success_count)
        row.avg_latency_ms = (prev_avg * (count - 1) + latency_ms) / count

    row.updated_at = datetime.now(timezone.utc)


def provider_available(db: Session, provider: str, max_failures: int = 5) -> bool:
    row = db.query(ProviderHealth).filter(ProviderHealth.provider == provider).first()
    if not row:
        return True
    return _n(row.consecutive_failures) < max_failures


def provider_stats(db: Session) -> list[dict]:
    rows = db.query(ProviderHealth).order_by(ProviderHealth.provider).all()
    result = []
    for row in rows:
        success = _n(row.success_count)
        failure = _n(row.failure_count)
        total = success + failure
        rate = round(success / total * 100, 1) if total else 100.0
        result.append(
            {
                "provider": row.provider,
                "success_count": success,
                "failure_count": failure,
                "success_rate": rate,
                "consecutive_failures": _n(row.consecutive_failures),
                "avg_latency_ms": round(_f(row.avg_latency_ms), 1),
                "available": _n(row.consecutive_failures) < 5,
                "last_success": row.last_success_at,
                "last_failure": row.last_failure_at,
                "last_success_at": row.last_success_at,
                "last_failure_at": row.last_failure_at,
            }
        )
    return result
