import socket
import os
import subprocess
import sys
import threading
import time
import webbrowser

import uvicorn
import yaml

from app.deps import ensure_ytdlp
from app.paths import CONFIG_PATH, ensure_cwd
from app.routes import app


FALLBACK_PORTS = (8099, 8888, 9000, 9100)
APP_LABEL = "TikTok Monitor v5.0"


def _open_browser(host: str, port: int) -> None:
    time.sleep(1.2)
    url = f"http://{host}:{port}" if host != "0.0.0.0" else f"http://127.0.0.1:{port}"
    webbrowser.open(url)


def _can_bind(host: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind((host, port))
        return True
    except OSError:
        return False


def _pick_port(host: str, preferred: int) -> int:
    if preferred <= 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind((host, 0))
            return int(sock.getsockname()[1])

    if _can_bind(host, preferred):
        return preferred

    print(f"[WARN] 端口 {preferred} 不可用（可能被系统占用），尝试备用端口...")
    for port in FALLBACK_PORTS:
        if port != preferred and _can_bind(host, port):
            print(f"[INFO] 已切换到端口 {port}")
            return port

    print("[ERROR] 没有可用端口，请检查 Windows 保留端口范围：")
    try:
        subprocess.run(
            ["netsh", "interface", "ipv4", "show", "excludedportrange", "protocol=tcp"],
            check=False,
        )
    except OSError:
        pass
    sys.exit(1)


def _print_runtime_info() -> None:
    ensure_ytdlp()
    try:
        import yt_dlp

        print(f"  yt-dlp: OK ({yt_dlp.version.__version__})")
    except ImportError:
        print("  yt-dlp: MISSING - video sync will fail!")


def _run_web(host: str, port: int, display_host: str) -> None:
    url = f"http://{display_host}:{port}"
    print("================================================")
    print(f"  {APP_LABEL}  [Web 模式]")
    print(f"  URL: {url}")
    _print_runtime_info()
    print("  请勿关闭此窗口，关闭后网页将无法访问")
    print("================================================")
    if os.environ.get("TIKTOKMONITOR_NO_BROWSER") != "1":
        threading.Thread(target=_open_browser, args=(host, port), daemon=True).start()
    uvicorn.run(app, host=host, port=port, log_level="info")


def main() -> None:
    ensure_cwd()

    if not CONFIG_PATH.exists():
        print(f"[ERROR] 未找到配置文件: {CONFIG_PATH}")
        input("按回车键退出...")
        sys.exit(1)

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    server = config.get("server", {})
    host = server.get("host", "127.0.0.1")
    mode = server.get("mode", "desktop")
    if "--web" in sys.argv:
        mode = "web"
    elif "--desktop" in sys.argv:
        mode = "desktop"

    port = _pick_port(host, int(server.get("port", 8099)))
    display_host = "127.0.0.1" if host == "0.0.0.0" else host

    if mode == "desktop":
        print("================================================")
        print(f"  {APP_LABEL}  [桌面模式]")
        print("  正在打开应用窗口...")
        _print_runtime_info()
        print("================================================")
        try:
            from app.desktop import run_desktop

            run_desktop(host=display_host, port=0)
            return
        except Exception as exc:
            print(f"[WARN] 桌面窗口启动失败: {exc}")
            print("[INFO] 自动改用浏览器模式...")

    _run_web(host, port, display_host)


if __name__ == "__main__":
    main()
