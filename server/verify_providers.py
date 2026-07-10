import argparse
import json
import os
import sqlite3
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def default_username() -> str:
    con = sqlite3.connect(ROOT / "data" / "monitor.db")
    try:
        row = con.execute(
            "select username from accounts where is_active=1 order by id limit 1"
        ).fetchone()
        if not row:
            raise RuntimeError("no active account found in sample database")
        return str(row[0])
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run TikTok providers without writing DB.")
    parser.add_argument("--username", default="", help="TikTok username. Defaults to first active DB account.")
    parser.add_argument("--max-videos", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument(
        "--providers",
        nargs="+",
        default=["tikwm", "ytdlp", "direct", "auto"],
        choices=["tikwm", "ytdlp", "direct", "auto"],
    )
    args = parser.parse_args()

    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))

    from app.scraper import TikTokScraper

    username = args.username or default_username()
    results = []
    for provider in args.providers:
        started = time.time()
        try:
            scraper = TikTokScraper(timeout=args.timeout, provider=provider)
            data = scraper.fetch_user(username, max_videos=args.max_videos)
            results.append(
                {
                    "provider": provider,
                    "ok": True,
                    "seconds": round(time.time() - started, 2),
                    "username": data.username,
                    "nickname": data.nickname,
                    "followers": data.follower_count,
                    "video_count": data.video_count,
                    "fetched_videos": len(data.videos),
                    "sources_used": data.sources_used,
                    "warning": data.warning,
                    "first_video": data.videos[0].video_id if data.videos else None,
                }
            )
        except Exception as exc:
            results.append(
                {
                    "provider": provider,
                    "ok": False,
                    "seconds": round(time.time() - started, 2),
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:500],
                }
            )

    print(json.dumps({"username": username, "results": results}, ensure_ascii=False, indent=2))
    if not any(item["ok"] for item in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
