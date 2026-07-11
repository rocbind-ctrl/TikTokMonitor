# Next Tasks

Updated: 2026-07-11

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

## Follow-up Product Tasks

1. Add saved filters and export workflows to the desktop client.

2. Add richer dashboard analytics and anomaly views to the desktop client.

## Engineering Tasks

1. Add backup workflow.
   - Document and script regular backups for `data/monitor.db`.

2. Plan database migration.
   - SQLite is fine for early use.
   - PostgreSQL is better once multiple people rely on the system every day.

## Current Local Artifacts

- Windows ARM64 installer:
  `release/TikTokMonitor_Desktop_Windows_ARM64.msi`

This file is intentionally ignored by Git.
