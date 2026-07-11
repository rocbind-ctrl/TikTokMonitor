# Next Tasks

Updated: 2026-07-11

## Immediate Tasks

1. Review, commit, and push the Docker deployment and backup workflow updates.

2. Prepare the first cloud server.
   - Recommended baseline: Ubuntu 22.04/24.04 LTS, 2 CPU, 2-4 GB RAM,
     30+ GB disk.
   - Install Docker and Docker Compose.
   - Follow `docs/CLOUD_DEPLOYMENT.md`.

3. Deploy the server with a host-local `server/config.yaml`.
   - Keep production `security.web_password` and `security.api_key` outside
     Git and outside the Docker image.

4. Configure remote access.
   - Internal testing can use port `8099`.
   - Team use should prefer HTTPS reverse proxy, VPN, or fixed-IP allowlists.

5. Schedule regular backups.
   - Use `server/scripts/sqlite_backup.py backup --keep-days 30`.
   - Run a restore drill before relying on the server for team data.

## Completed Since Last Update

- Completed desktop account detail, video detail, batch import, safe settings,
  and alert navigation/read workflows.
- Added compatible V2 JSON API envelopes and page-based pagination for
  accounts, videos, alerts, and sync logs.
- Added isolated API tests for login, account CRUD, sync queue, alerts,
  settings, and pagination.
- Migrated the current desktop client API calls to `/api/v2/*`.
- Added desktop pagination controls for V2 list metadata.
- Added native SVG trend charts to account and video details.
- Added alert level filtering and selected-alert bulk read actions.
- Published the repository to GitHub and verified GitHub Actions for server
  checks and desktop builds.
- Rotated local deployment secrets in ignored config files.
- Added Docker-safe config mounting so production secrets stay outside the
  image.
- Added SQLite backup and restore script for `data/monitor.db`.
- Added Docker backup volume mapping to keep backups in the host `backups/`
  directory.
- Added a cloud deployment guide for Ubuntu + Docker deployment, backup,
  restore, update, and rollback.
- Added a team usage guide for Web, desktop, server operations, backup,
  restore, and troubleshooting.

## Follow-up Product Tasks

1. Add saved filters and export workflows to the desktop client.

2. Add richer dashboard analytics and anomaly views to the desktop client.

## Engineering Tasks

1. Plan database migration.
   - SQLite is fine for early use.
   - PostgreSQL is better once multiple people rely on the system every day.

2. Run the first cloud deployment.
   - Use `docs/CLOUD_DEPLOYMENT.md` after the server OS, access path, and
     Docker availability are confirmed.

## Current Local Artifacts

- Windows ARM64 installer:
  `release/TikTokMonitor_Desktop_Windows_ARM64.msi`

This file is intentionally ignored by Git.
