import threading

_lock = threading.Lock()
_syncing: set[int] = set()


def mark_syncing(account_id: int) -> None:
    with _lock:
        _syncing.add(account_id)


def mark_done(account_id: int) -> None:
    with _lock:
        _syncing.discard(account_id)


def is_syncing(account_id: int) -> bool:
    with _lock:
        return account_id in _syncing


def syncing_ids() -> list[int]:
    with _lock:
        return list(_syncing)
