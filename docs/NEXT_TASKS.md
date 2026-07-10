# Next Tasks

Updated: 2026-07-10

## Immediate Tasks

1. Publish the local repository to GitHub with GitHub Desktop.
   - Current local branch: `master`
   - Current latest commit: `3c1cec2 Add server layout and Tauri desktop client`
   - Recommended visibility: private
   - Reason: source code, workflow history, and deployment notes should not be
     public until passwords, API keys, and release process are reviewed.

2. Push the committed code to GitHub.
   - After publishing, verify that `git remote -v` shows an `origin` remote.
   - Push `master` or rename it to `main` before push if the team prefers
     GitHub's default branch naming.

3. Run GitHub Actions.
   - `Server Check` should compile and smoke-test the FastAPI server.
   - `Desktop Build` should produce Windows, macOS, and Linux artifacts.
   - Download and test each artifact before distributing to the team.

4. Change deployment secrets before team use.
   - Copy `server/config.example.yaml` to `server/config.yaml`.
   - Change `security.web_password`.
   - Change `security.api_key`.
   - Keep `config.yaml` out of Git.

5. Choose the first team server location.
   - Best long-term choice: cloud server or always-on internal server.
   - Good low-cost choice: NAS Docker if the team already has VPN/LAN access.
   - Temporary choice: one fixed office computer that stays online.

## Product Tasks

1. Complete Tauri account detail view.
   - Show account profile, recent videos, recent sync logs, and growth metrics.

2. Complete video detail view.
   - Show play/like/comment/share history and link back to the account.

3. Add batch import in the desktop client.
   - Reuse `POST /api/accounts/import`.
   - Support default group, phone, and employee fields.

4. Add settings page in the desktop client.
   - Read from `GET /api/settings`.
   - Save safe editable fields through `PATCH /api/settings`.

5. Improve alert workflows.
   - Filter unread alerts.
   - Mark one alert as read.
   - Jump from alert to account or video detail.

## Engineering Tasks

1. Standardize JSON API response shape.
   - Current APIs are usable but not fully uniform.
   - Recommended target shape: `{ "ok": true, "data": ..., "error": null }`.

2. Add pagination.
   - Accounts, videos, alerts, and sync logs should not load all rows forever.

3. Add API tests.
   - Cover login, account CRUD, sync queue endpoints, alerts, and settings.

4. Add backup workflow.
   - Document and script regular backups for `data/monitor.db`.

5. Plan database migration.
   - SQLite is fine for early use.
   - PostgreSQL is better once multiple people rely on the system every day.

## Current Local Artifacts

- Windows ARM64 installer:
  `release/TikTokMonitor_Desktop_Windows_ARM64.msi`

This file is intentionally ignored by Git.
