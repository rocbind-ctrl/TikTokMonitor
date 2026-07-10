import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "monitor.db"


def table_counts() -> dict[str, int]:
    con = sqlite3.connect(DB_PATH)
    try:
        names = [
            "accounts",
            "videos",
            "account_stats_history",
            "video_stats_history",
            "alerts",
            "sync_logs",
            "provider_health",
        ]
        return {name: con.execute(f"select count(*) from {name}").fetchone()[0] for name in names}
    finally:
        con.close()


def backup_data_dir() -> str:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = ROOT / f"data_backup_before_sync_{stamp}"
    shutil.copytree(ROOT / "data", target)
    return str(target)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one real account sync against replica DB.")
    parser.add_argument("--account-id", type=int, default=0)
    parser.add_argument("--username", default="")
    parser.add_argument("--max-videos", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()

    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))

    from app.database import Account, SessionLocal
    from app.sync_service import sync_account

    backup = None if args.no_backup else backup_data_dir()
    before = table_counts()

    db = SessionLocal()
    try:
        query = db.query(Account)
        if args.account_id:
            account = query.filter(Account.id == args.account_id).first()
        elif args.username:
            account = query.filter(Account.username == args.username).first()
        else:
            account = query.filter(Account.is_active == 1).order_by(Account.id).first()

        if not account:
            raise RuntimeError("account not found")

        log = sync_account(db, account, max_videos=args.max_videos, timeout=args.timeout)
        db.add(log)
        db.commit()
        result = {
            "id": log.id,
            "account_id": log.account_id,
            "status": log.status,
            "message": log.message,
            "videos_updated": log.videos_updated,
            "duration_seconds": log.duration_seconds,
            "provider_used": log.provider_used,
            "retry_count": log.retry_count,
        }
    finally:
        db.close()

    after = table_counts()
    print(
        json.dumps(
            {
                "backup": backup,
                "before": before,
                "after": after,
                "sync_log": result,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if result["status"] != "success":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
