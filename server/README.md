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

## Docker

```powershell
docker compose up --build
```

Data is stored in the named volume mounted at `/app/data`.

## Do Not Commit

- `config.yaml`
- `data/`
- SQLite databases
- build outputs
- packaged executables
