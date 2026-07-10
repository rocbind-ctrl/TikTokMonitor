import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
EXE = ROOT / "dist" / "TikTokMonitorReplica.exe"
PROBE = ROOT / "dist_runtime_probe"


def request(url: str) -> tuple[int, str, str]:
    with urllib.request.urlopen(url, timeout=5) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return resp.status, resp.headers.get("content-type", ""), body


def prepare_probe(port: int) -> Path:
    if not EXE.exists():
        raise FileNotFoundError(EXE)
    if PROBE.exists():
        shutil.rmtree(PROBE)
    PROBE.mkdir()
    shutil.copy2(EXE, PROBE / EXE.name)
    shutil.copytree(ROOT / "data", PROBE / "data")
    config = (ROOT / "config.yaml").read_text(encoding="utf-8")
    config = config.replace("port: 8099", f"port: {port}")
    config = config.replace('mode: "desktop"', 'mode: "web"')
    (PROBE / "config.yaml").write_text(config, encoding="utf-8")
    return PROBE / EXE.name


def kill_tree(pid: int) -> None:
    subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, capture_output=True, text=True)


def main() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])

    exe = prepare_probe(port)
    env = os.environ.copy()
    env["TIKTOKMONITOR_NO_BROWSER"] = "1"
    proc = subprocess.Popen(
        [str(exe), "--web"],
        cwd=PROBE,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        base = f"http://127.0.0.1:{port}"
        deadline = time.time() + 120
        while time.time() < deadline:
            if proc.poll() is not None:
                out, err = proc.communicate(timeout=5)
                raise RuntimeError(
                    f"packaged exe exited early code={proc.returncode}\n"
                    f"stdout={out[-2000:]}\nstderr={err[-2000:]}"
                )
            try:
                status, _, body = request(base + "/api/health")
                if status == 200 and '"ok":true' in body:
                    break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError("packaged exe did not become ready")

        for path in ("/api/health", "/", "/login"):
            status, content_type, _ = request(base + path)
            if status != 200:
                raise AssertionError(f"{path} returned {status}")
            print(f"{path} ok {status} {content_type}")
    finally:
        if proc.poll() is None:
            kill_tree(proc.pid)
        try:
            proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            kill_tree(proc.pid)

    print(f"packaged exe verification ok on port {port}")


if __name__ == "__main__":
    main()
