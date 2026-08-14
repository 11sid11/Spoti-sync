# Changelog

All notable changes to Spoti Sync are documented here.

## 1.3.0 — 2026-08-15

### Added

- Dedicated **Schedule** sheet for scheduler health, cloud runtime, trigger count, execution window, last scheduler check, and upcoming eligible jobs.
- Redesigned **Dashboard** with connection/scheduler/update health, latest run summary, next automation, and recent activity.
- Stable hidden job IDs used to associate runtime state with a job independently of row position.
- Spotify playlist-description heartbeat on every successful sync, including zero-change runs.
- Six rotating Spoti Sync heartbeat phrases with `sid.is-a.dev` and a spreadsheet-timezone `Synced [day] at [time]` suffix.
- Regression tests for heartbeat rotation, same-job ordering, non-fatal description failures, sheet migration, and new scheduler visibility.

### Changed

- `Jobs` is now a compact operational table with friendly Source, Behavior, Frequency, Health, and Next Eligible columns; internal IDs and telemetry moved to hidden columns.
- `History` is migrated/renamed to **Activity**, with human-readable result, change counts, duration, details, and hidden job ID.
- The old scheduler panel in Jobs columns O:P has been removed entirely.
- `Initialize / Repair Sheets` migrates existing job playlist IDs and telemetry into the 1.3 layout while leaving User Properties untouched, so the Spotify Client ID and OAuth tokens do not need to be entered again.
- Scheduler and interactive state changes refresh Dashboard, Jobs, Schedule, and Activity-derived views together.
- User-facing project links now prefer `https://sid.is-a.dev/Spoti-sync/`; GitHub remains the source/changelog location.

### Spotify heartbeat behavior

- Track additions/removals and description updating happen inside the same Spoti Sync job execution.
- Playlist-item writes complete before the heartbeat description is sent, preventing a false fresh timestamp when the playlist mutation fails.
- Description failures do not turn a successful playlist sync into a failed music sync; they are recorded as **Success with warning**.
- Spoti Sync updates only the playlist `description` field and never changes the playlist name.
- Phrase rotation advances only after Spotify accepts the description update.

## 1.2.0 — 2026-08-15

### Added

- Automatic GitHub release-metadata checks through the existing daily scheduler, rate-limited to once every 24 hours.
- Manual **Spoti Sync → Check for Updates** command.
- Update status and last update-check time in the Dashboard and Jobs scheduler panel.
- Guided update dialog with release notes and links to the updater/changelog.
- Dedicated GitHub Pages section for updating an existing installation without repeating Spotify setup.
- Semantic-version comparison and update-check behavior regression tests.
- `docs/version.json` as the single published stable-release metadata record.

### Security

- Update checks download metadata only; they do not download, evaluate, or silently install executable code.
- Spoti Sync still does not request the Apps Script `script.projects` scope or call `projects.updateContent`.
- CI guards against accidentally introducing Apps Script project-write scope, self-update API calls, or dynamic `eval()` execution.

## 1.1.0 — 2026-08-14

### Added

- Scheduler status panel in columns O:P of the Jobs sheet.
- Visible scheduler trigger count, cloud runtime, daily execution window, last background check, last check result, and next due job.
- Dedicated scheduler telemetry so background checks are distinguishable from manual syncs.

## 1.0.0 — 2026-08-14

Initial public release with PKCE authentication, Liked Songs and playlist sources, MIRROR/APPEND strategies, daily scheduling, dry-run preview, dashboard/history, guided setup, and CI safety checks.
