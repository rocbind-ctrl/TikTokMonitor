# Next Tasks

Updated: 2026-07-13

## Immediate Tasks

1. Finish 0.2.12: validate and publish operator efficiency improvements.
   - Run service tests plus desktop type/build checks.
   - Commit and publish the 0.2.12 changes after validation.
   - Deploy the server because sync V2 responses now include queue summaries.

2. Keep release operations repeatable.
   - Update docs after each version.
   - Verify GitHub Actions before deployment.
   - Create a server backup before every deployment.
   - Smoke-test the deployed API and desktop-critical flows after deployment.

3. Plan the database migration path.
   - SQLite remains acceptable for early use.
   - PostgreSQL should be planned before multiple operators rely on the system
     every day.
   - Document the migration sequence before changing production data storage.

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
- Deployed the central Docker server and verified the online API.
- Published desktop builds through GitHub Actions.
- Added desktop saved filters and CSV export workflows.
- Added richer dashboard analytics and anomaly views.
- Added desktop operations center, provider health, backup management, sync
  logs, and audit logs.
- Added V2 backup and audit APIs with tests.
- Released 0.2.6 through 0.2.11.
- Added 0.2.9 desktop operation feedback and clearer empty states.
- Added 0.2.10 account/video shortcuts, cross-links, video link actions, and
  safer bulk-update confirmations.
- Released 0.2.11 data quality API, account quality filters, desktop data
  health page, server deployment, and online smoke tests.
- Implemented 0.2.12 operation history, task duration/result feedback, sync
  duplicate guards, import confirmation, and queue summary responses in the
  working tree.

## Follow-up Product Tasks

1. Close remaining account/video productivity gaps from the recovered replica.

2. Add operator efficiency and long-running task safety improvements.

3. Improve docs and in-app guidance for non-technical team users.

## Engineering Tasks

1. Plan database migration.
   - SQLite is fine for early use.
   - PostgreSQL is better once multiple people rely on the system every day.

2. Run the first cloud deployment.
   - Use `docs/CLOUD_DEPLOYMENT.md` after the server OS, access path, and
     Docker availability are confirmed.

## Current Local Artifacts

- Windows 0.2.11 installer:
  `release/tiktokmonitor-windows-0.2.11-data-quality-health/msi/TikTokMonitor_0.2.11_x64_en-US.msi`

Release artifacts are intentionally ignored by Git.
