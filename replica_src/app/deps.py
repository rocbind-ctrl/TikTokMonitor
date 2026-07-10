import subprocess
import sys


def ensure_ytdlp() -> None:
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        if getattr(sys, "frozen", False):
            print("[WARN] yt-dlp 未打包，视频同步可能失败")
            return
        print("[INFO] Installing yt-dlp...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "yt-dlp", "curl_cffi", "-q"],
            stdout=subprocess.DEVNULL,
        )
