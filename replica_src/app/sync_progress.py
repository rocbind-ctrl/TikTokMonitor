import threading
from datetime import datetime, timezone

_lock = threading.Lock()
_state: dict = {
    "running": False,
    "total": 0,
    "completed": 0,
    "current_username": "",
    "started_at": None,
    "finished_at": None,
    "results": [],
}


def start_batch(total: int) -> None:
    with _lock:
        _state.update(
            {
                "running": True,
                "total": total,
                "completed": 0,
                "current_username": "",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "finished_at": None,
                "results": [],
            }
        )


def update_current(username: str) -> None:
    with _lock:
        _state["current_username"] = username


def finish_account(username: str, status: str, message: str) -> None:
    with _lock:
        _state["completed"] += 1
        _state["results"].append(
            {"username": username, "status": status, "message": message[:200]}
        )
        if _state["completed"] >= _state["total"]:
            _state["running"] = False
            _state["finished_at"] = datetime.now(timezone.utc).isoformat()
            _state["current_username"] = ""


def get_progress() -> dict:
    with _lock:
        return dict(_state)
