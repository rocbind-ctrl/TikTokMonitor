import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def request(url: str) -> tuple[int, str, str]:
    with urllib.request.urlopen(url, timeout=5) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return resp.status, resp.headers.get("content-type", ""), body


def main() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.routes:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]
    proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        base = f"http://127.0.0.1:{port}"
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                status, _, body = request(base + "/api/health")
                if status == 200 and '"ok":true' in body:
                    break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError("uvicorn did not become ready")

        for path in ("/api/health", "/", "/login"):
            status, content_type, _ = request(base + path)
            if status != 200:
                raise AssertionError(f"{path} returned {status}")
            print(f"{path} ok {status} {content_type}")
    finally:
        proc.terminate()
        try:
            proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate(timeout=10)

    print("web server verification ok")


if __name__ == "__main__":
    main()
