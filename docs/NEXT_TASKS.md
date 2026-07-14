# Next Tasks

Updated: 2026-07-14

## Immediate Tasks

1. Install-check the published 0.2.19 closeout build.
   - Install the Windows MSI and connect it to the deployed server.
   - Verify video selection and batch copy for links, IDs, and authors.
   - Verify account-row and current-page copy actions.

2. Start 0.3.0 data analytics enhancements.
   - Add clearer account and video growth comparisons.
   - Add dashboard drill-downs into the matching filtered lists.
   - Define reusable time ranges and comparison rules before changing APIs.

3. Keep release operations repeatable.
   - Update docs after each version.
   - Verify GitHub Actions before deployment.
   - Create a server backup before every deployment.
   - Smoke-test the deployed API and desktop-critical flows after deployment.

4. Plan the database migration path.
   - SQLite remains acceptable for early use.
   - PostgreSQL should be planned before multiple operators rely on the system
     every day.
   - Document the migration sequence before changing production data storage.

## Replica Feature Parity Checklist

The recovered replica is used as the functional reference. New desktop work
should keep the migrated app at least as capable as the replica, while allowing
safe additions when they improve team operations.

### Completed or covered in the migrated app

- Account management: account list, add account, account detail, safe edits,
  batch import, saved filters, pagination, and CSV export.
- Video monitoring: dedicated video list workspace, server-side video filters,
  video detail, trend charts, filtered video CSV export, open/copy original
  video actions, author jump actions, and account-detail video shortcuts.
- Sync workflows: single-account sync, sync-all queueing, duplicate guards,
  sync logs, queue summaries, operation duration/result feedback, and clearer
  empty states.
- Alerts and anomalies: alert list, level filtering, linked account/video
  navigation, selected bulk read, dashboard analytics, and anomaly views.
- Operations: provider health, backup management, audit logs, operation
  history, data-quality checks, and in-app usage guidance.
- Release/deployment: GitHub Actions server checks, desktop builds, Docker
  deployment guide, backup/restore tooling, and cloud server smoke tests.

### 0.2.x must-fill gaps (closed in 0.2.19)

1. Account list productivity.
   - Added row-level username/profile copy and current-page batch copy.
   - Kept bulk tag updates grouped in a visible, guarded action area.
   - Added health chips for stale, failed, or incomplete accounts.

2. Video list productivity.
   - Add stronger filters for missing links, low/high metrics, recent changes,
     and sync freshness. `0.2.17` implements the first server-backed version.
   - Added current-page selection and batch copy for links, video IDs, and
     author usernames in `0.2.19`.
   - Make metric changes and abnormal videos easier to spot without opening
     every detail page.

3. Replica-style workflow shortcuts.
   - Add more direct paths from dashboard cards to the filtered list that
     explains the card.
   - Preserve the current cross-links between account, video, alert, and
     health views.
   - Kept copy/open actions consistent across table rows and detail pages;
     batch copy now uses the same operation feedback.

4. Operator guidance.
   - Continue adding inline next-step hints near empty, failed, or partial-data
     states.
   - Added filtered-empty-state guidance and direct clear-filter actions on
     account and video workspaces.

### Can be enhanced after the must-fill gaps

- More configurable saved filters and named operator views.
- More dashboard drill-downs for growth, anomaly, and data-quality segments.
- More export presets for handoff/reporting.
- Optional scheduled health summaries for operators.

### Defer for now

- PostgreSQL migration execution.
- Large UI redesign.
- Public internet exposure changes, domain/TLS setup, or authentication model
  changes.
- Any destructive data cleanup or schema migration.

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
- Released 0.2.6 through 0.2.14.
- Added 0.2.9 desktop operation feedback and clearer empty states.
- Added 0.2.10 account/video shortcuts, cross-links, video link actions, and
  safer bulk-update confirmations.
- Released 0.2.11 data quality API, account quality filters, desktop data
  health page, server deployment, and online smoke tests.
- Released 0.2.12 operation history, task duration/result feedback, sync
  duplicate guards, import confirmation, queue summary responses, server
  deployment, and online smoke tests.
- Released 0.2.13 dashboard workflow shortcuts, operator next-step guidance,
  and Windows desktop installer through GitHub Actions.
- Released 0.2.14 account/video shortcuts: copy username, per-video open/copy
  actions from account detail, copy video ID, author profile actions, and
  Windows desktop installer through GitHub Actions.
- Released 0.2.15 desktop usage guide for first use, daily checks,
  import/export, sync troubleshooting, backups, connection issues, GitHub
  Actions desktop builds, and Windows installer artifact.
- Released 0.2.16 desktop video workspace: side-nav video list, paginated
  `/api/v2/videos` loading, video metrics, detail/open TikTok/copy link/copy
  ID/author jump actions, dashboard quick entry, GitHub Actions desktop builds,
  and Windows installer artifact.
- Released 0.2.17 video list filtering: server-side video filters for keyword,
  author, link status, publish freshness, sync freshness, metric bands, play
  ranges, sorting, filtered video CSV export, desktop filter controls, video
  issue chips, GitHub Actions desktop builds, Windows installer artifact,
  server deployment, and online smoke tests.
- Released 0.2.18 account list health visibility: account rows show
  data-quality chips for stale sync, no videos, no recent posts, sync failures,
  and missing metrics; clicking a chip applies the matching account health
  filter. GitHub Actions Server Check and Desktop Build passed, and the Windows
  installer artifact was downloaded locally.
- Released 0.2.19 as the 0.2.x closeout: video row selection and batch copy,
  account username/profile copy actions, clearer filtered empty states,
  consistent clipboard feedback, synchronized desktop version metadata,
  successful Server Check/Desktop Build workflows, and a downloaded Windows
  installer artifact.

## Follow-up Product Tasks

1. Start 0.3.0 with data analytics and comparison workflows.

2. Add dashboard drill-downs for growth, anomaly, and data-quality segments.

3. Keep 0.2.x behavior stable while the analytics APIs evolve.

## Engineering Tasks

1. Plan database migration.
   - SQLite is fine for early use.
   - PostgreSQL is better once multiple people rely on the system every day.

2. Run the first cloud deployment.
   - Use `docs/CLOUD_DEPLOYMENT.md` after the server OS, access path, and
     Docker availability are confirmed.

## Current Local Artifacts

- Windows 0.2.15 installer:
  `release/tiktokmonitor-windows-0.2.15-in-app-operator-guide/msi/TikTokMonitor_0.2.15_x64_en-US.msi`
- Windows 0.2.16 installer:
  `release/tiktokmonitor-windows-0.2.16-video-workspace/msi/TikTokMonitor_0.2.16_x64_en-US.msi`
- Windows 0.2.17 installer:
  `release/rocbind-tiktokmonitor-windows-0.2.17-video-filters/msi/TikTokMonitor_0.2.17_x64_en-US.msi`
- Windows 0.2.18 installer:
  `release/rocbind-tiktokmonitor-windows-0.2.18-account-health-chips/tiktokmonitor-windows-latest/msi/TikTokMonitor_0.2.18_x64_en-US.msi`
- Windows 0.2.19 installer:
  `release/rocbind-tiktokmonitor-windows-0.2.19-closeout/msi/TikTokMonitor_0.2.19_x64_en-US.msi`

Release artifacts are intentionally ignored by Git.
