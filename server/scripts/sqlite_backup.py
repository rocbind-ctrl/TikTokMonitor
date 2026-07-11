from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "monitor.db"
DEFAULT_BACKUP_DIR = ROOT / "backups"


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_utc")


def _connect(path: Path, *, read_only: bool) -> sqlite3.Connection:
    if read_only:
        uri = f"{path.resolve().as_uri()}?mode=ro"
        return sqlite3.connect(uri, uri=True)
    return sqlite3.connect(path)


def backup_database(db_path: Path, backup_dir: Path, keep_days: int | None) -> Path:
    db_path = db_path.resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    target = backup_dir / f"monitor_{_timestamp()}.db"
    with _connect(db_path, read_only=True) as source:
        with sqlite3.connect(target) as dest:
            source.backup(dest)

    if keep_days is not None:
        prune_backups(backup_dir, keep_days)

    return target


def prune_backups(backup_dir: Path, keep_days: int) -> int:
    if keep_days < 0:
        raise ValueError("--keep-days must be zero or greater")

    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    removed = 0
    for path in backup_dir.glob("monitor_*.db"):
        modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        if modified < cutoff:
            path.unlink()
            removed += 1
    return removed


def restore_database(db_path: Path, backup_path: Path, assume_yes: bool) -> Path:
    db_path = db_path.resolve()
    backup_path = backup_path.resolve()

    if not backup_path.exists():
        raise FileNotFoundError(f"Backup not found: {backup_path}")

    if not assume_yes:
        raise RuntimeError("Restore requires --yes because it replaces the live database")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    pre_restore = db_path.with_name(f"{db_path.stem}.pre_restore_{_timestamp()}{db_path.suffix}")

    if db_path.exists():
        with _connect(db_path, read_only=True) as source:
            with sqlite3.connect(pre_restore) as dest:
                source.backup(dest)
    else:
        pre_restore = Path("")

    shutil.copy2(backup_path, db_path)
    return pre_restore


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Back up or restore TikTokMonitor SQLite data.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"Database path. Default: {DEFAULT_DB}")
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=DEFAULT_BACKUP_DIR,
        help=f"Backup directory. Default: {DEFAULT_BACKUP_DIR}",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    backup = subparsers.add_parser("backup", help="Create a timestamped SQLite backup.")
    backup.add_argument("--keep-days", type=int, default=None, help="Delete monitor_*.db backups older than N days.")

    restore = subparsers.add_parser("restore", help="Restore a backup over the live database.")
    restore.add_argument("backup_file", type=Path, help="Backup database file to restore.")
    restore.add_argument("--yes", action="store_true", help="Confirm replacement of the live database.")

    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        if args.command == "backup":
            target = backup_database(args.db, args.backup_dir, args.keep_days)
            print(f"backup_created={target}")
            return 0

        if args.command == "restore":
            pre_restore = restore_database(args.db, args.backup_file, args.yes)
            print(f"restored_from={args.backup_file.resolve()}")
            if pre_restore:
                print(f"pre_restore_backup={pre_restore}")
            return 0
    except Exception as exc:
        print(f"error={exc}", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
