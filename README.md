# TikTokMonitorReplica

Recovered and repackaged source for a local TikTok account monitoring tool.

## What Is Included

- `replica_src/app/`: FastAPI application source.
- `replica_src/templates/`: Jinja2 templates.
- `replica_src/static/`: Frontend assets.
- `replica_src/main.py`: readable launcher restored from the packaged app.
- `replica_src/requirements*.txt`: Windows/macOS dependencies.
- `replica_src/*.spec`: PyInstaller build specs.
- `analysis_artifacts/REPLICA_PLAN.md`: recovery, verification, and packaging notes.

## What Is Not Tracked

The repository intentionally excludes runtime data, packaged binaries, and secrets:

- `TikTokMonitor.exe`
- `release/`
- `data/`
- `replica_src/data/`
- `config.yaml`
- `*.db`
- generated `dist/` and `build/` folders

Use `config.example.yaml` or `replica_src/config.example.yaml` as a starting point.

## Run From Source

```powershell
cd replica_src
Copy-Item config.example.yaml config.yaml
py -3.11 -m pip install -r requirements.txt
py -3.11 main.py --web
```

Default local URL:

```text
http://127.0.0.1:8099
```

Change the default password before team deployment.
