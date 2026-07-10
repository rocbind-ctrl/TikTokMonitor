from sqlalchemy.orm import Session

from app.database import AuditLog


def log_action(
    db: Session,
    action: str,
    detail: str = "",
    actor: str = "system",
    account_id: int | None = None,
) -> None:
    db.add(
        AuditLog(
            action=action,
            detail=detail[:2000],
            actor=actor,
            account_id=account_id,
        )
    )
