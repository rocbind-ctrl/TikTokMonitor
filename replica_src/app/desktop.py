from __future__ import annotations

import socket
import sys
import threading
import time
import urllib.error
import urllib.request

import uvicorn

from app.deps import ensure_ytdlp
from app.routes import app


def _pick_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _wait_for_server(url: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as resp:
                if resp.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.1)
    return False


def _start_server(host: str, port: int) -> None:
    uvicorn.run(app, host=host, port=port, log_level="warning")


def run_desktop(host: str = "127.0.0.1", port: int | None = None) -> None:
    try:
        import webview
    except ImportError:
        print("[ERROR] 缺少 pywebview，请运行: pip install pywebview")
        input("按回车键退出...")
        sys.exit(1)

    ensure_ytdlp()
    bind_port = port if port and port > 0 else _pick_free_port(host)
    url = f"http://{host}:{bind_port}/"

    server = threading.Thread(
        target=_start_server,
        args=(host, bind_port),
        daemon=True,
        name="monitor-server",
    )
    server.start()

    if not _wait_for_server(url):
        print("[ERROR] 服务启动超时，请检查依赖与数据库")
        input("按回车键退出...")
        sys.exit(1)

    window = webview.create_window(
        "TikTok Monitor",
        url,
        width=1440,
        height=920,
        min_size=(1080, 720),
        text_select=True,
    )
    try:
        webview.start(debug=False)
    except Exception as exc:
        raise RuntimeError(f"pywebview 无法创建窗口（请安装 WebView2 运行时）: {exc}") from exc
