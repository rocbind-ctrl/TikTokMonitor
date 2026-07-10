# TikTokMonitor Replica Source

This directory contains the recovered Python/FastAPI source tree from the
PyInstaller-packaged `TikTokMonitor.exe`.

## Run

```powershell
py -3.11 -m pip install -r requirements.txt
py -3.11 main.py --web
```

The app reads `config.yaml` and `data/monitor.db` from this directory.

Current sample login password:

```text
000000
```

## Verified

- `app/*.py` compiles on Python 3.11.
- FastAPI app imports successfully.
- `/api/health` returns 200 using the bundled SQLite data.
- Login with `000000` unlocks protected API/page routes.

## Verification Helpers

```powershell
py -3.11 verify_runtime.py
py -3.11 verify_providers.py --max-videos 3
py -3.11 verify_sync_once.py --max-videos 3
py -3.11 verify_web_server.py
py -3.11 verify_desktop_deps.py
py -3.11 verify_packaged_exe.py
```

`verify_providers.py` does not write to the database.
`verify_sync_once.py` writes to `data/monitor.db` and creates a timestamped
`data_backup_before_sync_*` directory first.
