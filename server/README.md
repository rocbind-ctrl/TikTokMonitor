# TikTokMonitor Server

This directory contains the FastAPI server used by the web UI and the new
cross-platform desktop client.

## Local Run

```powershell
cd server
py -3.11 -m pip install -r requirements.txt
Copy-Item config.example.yaml config.yaml
py -3.11 main.py --web
```

Default URL:

```text
http://127.0.0.1:8099
```

For team access on a LAN, edit `config.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 8099
  mode: "web"
```

Then let each desktop client connect to:

```text
http://SERVER_LAN_IP:8099
```

## API

The desktop client uses JSON APIs under `/api/*`, including:

- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/stats`
- `GET /api/accounts`
- `POST /api/accounts`
- `GET /api/accounts/{account_id}`
- `PATCH /api/accounts/{account_id}`
- `DELETE /api/accounts/{account_id}`
- `GET /api/videos/{video_id}`
- `GET /api/alerts`
- `POST /api/alerts/{alert_id}/read`
- `POST /api/alerts/read-all`
- `GET /api/settings`
- `PATCH /api/settings`

## V2 API

New clients should prefer `/api/v2/*`. V2 responses use the compatible
envelope `{ "ok": true, "data": ..., "error": null }`; paginated endpoints
also include `meta` with `page`, `per_page`, `total`, and `total_pages`.

- `POST /api/v2/auth/login`
- `GET /api/v2/accounts?page=1&per_page=50`
- `GET /api/v2/videos?page=1&per_page=50`
- `GET /api/v2/alerts?page=1&per_page=50`
- `GET /api/v2/sync/logs?page=1&per_page=50`

The original `/api/*` endpoints remain available for existing clients during
the migration.

## API Tests

Run the isolated API test suite with:

```powershell
cd server
python -m unittest discover -s tests -v
```

## Docker

For cloud servers, see the full guide in `docs/CLOUD_DEPLOYMENT.md`.

Prepare a server-local config before the first Docker run. This file is mounted
into the container and must not be committed to Git.

```powershell
Copy-Item server/config.example.yaml server/config.yaml
```

Edit `server/config.yaml` for production:

```yaml
server:
  host: "0.0.0.0"
  port: 8099
  mode: "web"

security:
  web_password: "replace-with-a-random-password"
  api_key: "replace-with-a-random-long-token"
```

Then start the server from the repository root:

```powershell
docker compose up --build -d
```

Data is stored in the named volume mounted at `/app/data`.

Backups are written to the host `backups/` directory, which is ignored by Git:

```powershell
New-Item -ItemType Directory -Force backups
docker compose exec tiktokmonitor-server python scripts/sqlite_backup.py backup --keep-days 30
```

To restore, stop the server first, then run the restore command with an explicit
confirmation flag:

```powershell
docker compose stop tiktokmonitor-server
docker compose run --rm tiktokmonitor-server python scripts/sqlite_backup.py restore /app/backups/monitor_YYYYMMDD_HHMMSS_utc.db --yes
docker compose up -d
```

For local non-Docker runs:

```powershell
cd server
python scripts/sqlite_backup.py backup --keep-days 30
```

## Do Not Commit

- `config.yaml`
- `data/`
- `backups/`
- SQLite databases
- build outputs
- packaged executables
