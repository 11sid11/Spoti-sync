# Changelog

All notable changes to Spoti Sync are documented here.

## 1.3.3 — 2026-08-15

### Fixed

- Checkbox-only future rows now count as empty Jobs rows. An unchecked validation cell with no job definition in columns B:F is no longer parsed as a disabled job or treated as migration debris.
- Normal sync reads and result writes no longer run current-layout Jobs migration/repair. Destructive migration work is restricted to the explicit **Spoti Sync → Initialize / Repair Sheets** path.
- Jobs/Activity dataset replacement no longer calls whole-sheet `clearFormats()`, so a repair cannot strip the styled Jobs presentation before the final render completes.
- Migration clearing is bounded to the used rows and Spoti Sync-owned columns instead of using the sheet-wide maximum row/column grid.
- Legacy job migration filters checkbox-only rows by actual job-definition fields, preserving real source/target playlist IDs without compacting hundreds of false-only rows into phantom jobs.

### Tests

- Added regression coverage for one real job followed by 49 checkbox-validation `FALSE` rows, verifying that exactly one job is parsed and no repair rewrite is requested.
- Added guards ensuring current-layout repair is explicit-only, migration is bounded, and whole-sheet formatting clears cannot return.

### Upgrade note

- Install the 1.3.3 bundle in the same Apps Script project and run **Spoti Sync → Initialize / Repair Sheets** once. Existing Spotify Client ID, OAuth tokens, playlist IDs, scheduler state, and job configuration remain in the same installation.

## 1.3.2 — 2026-08-15

### Fixed

- Added a repair path for partially migrated v1.3 Jobs sheets where the new headers were present but row data was still in the v1.2 layout. Existing target/source playlist IDs are recovered in place instead of asking the user to paste them again.
- Removed hidden scheduler-panel remnants and generated health cells that could appear as multiple phantom `○ Disabled` jobs.
- Jobs styling now clears legacy validation across the visible editable columns before applying the v1.3 rules. `Frequency` can no longer inherit the old `MIRROR` / `APPEND` Strategy dropdown.
- Added a clear Frequency header note describing the accepted `Daily` / `Every N days` format.

### Performance

- Enabling or disabling the daily scheduler now refreshes only **Schedule** and **Dashboard** instead of reformatting Jobs and Activity as well.
- Sync result writes no longer redraw Jobs after every individual job. Dashboard, Jobs, and Schedule are refreshed once after the complete run.
- Added dedicated regression coverage for partial migration recovery, stale Frequency validation, scheduler-targeted refreshes, and batched result rendering.

### Upgrade note

- Install the 1.3.2 bundle in the same Apps Script project and run **Spoti Sync → Initialize / Repair Sheets** once. The repair keeps existing Spotify Client ID, OAuth tokens, and recoverable playlist IDs.

## 1.3.1 — 2026-08-15

### Fixed

- Fixed the v1.2 → v1.3 Jobs migration when legacy Google Sheets data-validation rules were still attached to cells such as `C2`. The migration now explicitly clears old validation rules before writing friendly v1.3 labels such as `Liked Songs` and `Exact Mirror`.
- Fixed `TypeError: Cannot read properties of null (reading 'setTabColor')` during sheet styling. Apps Script's `setFrozenRows()` does not return a chainable `Sheet`, so tab styling now uses separate method calls.
- Made sheet migration safer by writing the converted dataset before clearing trailing legacy cells instead of destructively clearing the sheet first.
- Added regression guards for both migration-validation handling and non-chainable Sheet method usage.

### Upgrade note

- Existing Spotify Client ID and OAuth tokens remain in Apps Script User Properties and are not changed by this hotfix.
- After installing 1.3.1, run **Spoti Sync → Initialize / Repair Sheets** again to finish the Dashboard / Jobs / Schedule / Activity layout setup.

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
