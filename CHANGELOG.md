# Changelog

All notable changes to Spoti Sync are documented here.

## 1.5.1 — 2026-08-20

### Changed

- Updated playlist heartbeat timestamps to the compact format `🔄 Thu, Aug 20 · 3:16 AM` while keeping the existing rotating Spoti Sync phrase and `sid.is-a.dev` signature.
- Preserved spreadsheet-timezone formatting, heartbeat opt-in/out behavior, phrase rotation, playlist-write ordering, and `Success with warning` semantics for description-only failures.

### Upgrade note

- Install the 1.5.1 bundle in the same Apps Script project, save, and reload the Sheet. No Spotify reconnection, job recreation, scheduler recreation, repair step, or playlist-ID re-entry is required.

## 1.5.0 — 2026-08-20

### Added

- Added **Hourly** and **Every N hours** automation alongside the existing Off, Daily, and Every N days options.
- Hour-based intervals support 1–23 hours; 24 hours remains represented canonically as **Daily**.

### Automation

- Kept the single-trigger architecture. `Scheduler.reconcile()` now selects one of three states: no trigger when no jobs are automated, one daily trigger for day-only jobs, or one hourly dispatcher when any hour-based job exists.
- Mixed schedules still use only one trigger. The hourly dispatcher checks local job state first and calls Spotify only for jobs that are actually due.
- Existing single v1.4 daily triggers are retained for day-only installations instead of being recreated unnecessarily; scheduler mode is persisted in Document Properties so later reconciliations can distinguish daily and hourly cadence safely.

### Compatibility and performance

- Existing `Daily` and `Every N days` values keep their calendar-day semantics and require no Jobs schema migration.
- Hour-based schedules use elapsed hours since the last successful run.
- A no-due hourly scheduler wake does not fetch Spotify data, append Activity noise, overwrite the last real run summary, or repaint the status sheet.
- Preserved manual Sync now for Automation Off jobs, script locking, Exact Mirror / Append Only behavior, playlist heartbeat semantics, OAuth state, playlist IDs and stable Job IDs.

### Tests

- Added regression coverage for hourly parsing/bounds, elapsed-hour eligibility, mixed daily/hourly reconciliation, legacy daily-trigger retention, hourly-to-daily downgrade, duplicate-trigger normalization, no-due execution cost and existing manual/day-based behavior.
- Kept generated-sidebar boot protections, migration guards, no-`clearFormats()` protections, playlist-catalog laziness and installer-manifest checks in CI.

### Upgrade note

- Install the 1.5.0 bundle in the same Apps Script project, save, reload the Sheet, then choose **Spoti Sync → Open Spoti Sync**. Existing Spotify connection, Client ID, jobs, playlist IDs, heartbeat preferences and automation are preserved; no repair or manual trigger recreation is required.

## 1.4.1 — 2026-08-16

### Fixed

- Fixed the blank v1.4 sidebar caused by the generated browser script declaring `function top()`, which collides with the Apps Script iframe's existing browser `top` global and prevents the client script from starting.
- Renamed the sidebar header helper to a non-conflicting identifier without changing job, scheduler, Spotify, migration, or playlist behavior.

### Resilience

- Added static **Loading Spoti Sync…** content so a client-side boot failure cannot present a completely unexplained empty sidebar.
- Added compact runtime `error` and `unhandledrejection` fallbacks that show a safe startup message without exposing credentials or private job state.

### Tests

- Added regression coverage against the production-generated sidebar HTML/client script: the script must parse, must not redeclare the browser `top` global, must retain Apps Script RPC wiring, and must include visible boot/error states.

### Upgrade note

- Install the 1.4.1 bundle in the same Apps Script project, save, reload the Sheet, then choose **Spoti Sync → Open Spoti Sync**. No Spotify reconnection, Client ID re-entry, playlist-ID re-entry, job recreation, scheduler recreation, or repair step is required.

## 1.4.0 — 2026-08-15

### Simplified

- Made **Spoti Sync → Open Spoti Sync** the single normal application surface. Connection, job management, manual sync, automation, update checks and repair now live in one sidebar instead of competing menu/sheet workflows.
- Replaced the user-facing Enabled + Frequency + Scheduler model with **Automation: Off / Daily / Every N days**. The existing server-side interval parser remains authoritative.
- Converted Google Sheets into operational output: a read-only **Spoti Sync** status sheet plus **Activity** history. `Jobs` remains hidden local persistence and legacy `Schedule` is preserved/hidden instead of rendered as another control surface.
- Added job-card **Sync now**, Edit and Delete actions keyed by stable Job ID. Automation Off jobs remain manually runnable without temporarily enabling them.

### Automation

- Added idempotent scheduler reconciliation: zero automated jobs means zero Spoti Sync triggers; one or more automated jobs means exactly one daily trigger. An already-correct trigger is retained instead of being recreated on every edit.
- Add/Edit/Delete and repair reconcile scheduler state automatically, so normal users no longer enable or disable Apps Script triggers manually.

### Playlist status

- Added per-job **Show Spoti Sync status in playlist description**, enabled by default for existing and new jobs. Turning it off skips the description request without blanking the user's current description.
- Preserved the existing rotating `sid.is-a.dev` heartbeat wording and Success-with-warning behavior when only description updating fails.

### Migration and safety

- Appended `Heartbeat Enabled` to the Jobs storage schema while preserving all existing column positions, Job IDs, source/target playlist IDs, custom schedules, telemetry and Activity history.
- Preserved Spotify Client ID, OAuth tokens/session, heartbeat phrase indexes and compatible scheduler trigger state.
- Kept migration bounded and explicit with no whole-sheet `clearFormats()` and no unnecessary dataset rewrite.
- Protected unrelated user sheets from a rare name collision with the new `Spoti Sync` summary sheet.

### Performance and ownership

- The app home renders from local job/status data and does not fetch the Spotify playlist catalog. Catalog loading is lazy/cached for Add/Edit, and playlist search remains client-side.
- Removed normal Jobs validation/presentation and Schedule rendering so hidden persistence is no longer treated as a second UI.
- Kept business rules in SheetStore/SyncEngine/Scheduler and thin RPC/menu entrypoints rather than duplicating configuration logic in the sidebar.

### Upgrade note

- Install the 1.4.0 bundle in the same Apps Script project, save, reload the Sheet, then choose **Spoti Sync → Open Spoti Sync** once. The local migration runs automatically. No Spotify reconnection, Client ID re-entry, playlist-ID re-entry, job recreation or manual scheduler recreation is required.

## 1.3.8 — 2026-08-15

### Improved

- Replaced the Job editor Frequency datalist with an explicit preset selector plus **Custom interval…**. Existing custom schedules reopen with their day count preserved, and custom values still pass through the canonical server-side Frequency parser.
- Centralized Frequency presets/limits and Behavior labels/options in `SheetStore`, so Jobs validation and the Job editor consume the same configuration definitions.
- Runtime source identity now comes from the hidden stable source-playlist ID instead of visible Source presentation text.
- Added one canonical `docs/source-files.json` manifest consumed by both the Node bundle build and the GitHub Pages browser installer.

### Cleanup

- Removed the dead prompt-based Add Job implementation and its obsolete `SheetStore.addJob` path; Add/Edit Job now has one runtime implementation in `JobEditor`.
- Removed duplicate job-ID generation and duplicate configured-row classification from `JobEditor`; both now use `SheetStore`.
- Replaced the JobEditor monkey-patch of SheetViews refresh functions with an explicit Source/Target presentation call from `SheetViews`.
- Consolidated the two Initialize / Repair entrypoint implementations behind one shared helper.
- Removed an immediate duplicate full-view refresh from Setup.
- Renamed permissive legacy playlist/source helpers to make their migration-only responsibility explicit.

### Safety

- Preserved the single daily scheduler trigger, due-job calculation, Spotify API behavior, OAuth state, playlist IDs, job IDs, heartbeat state, Activity history, and explicit-only bounded migration behavior.
- Source and Target remain presentation-only in Jobs. Enabled, Behavior, and Frequency retain their existing Sheet validations.
- No new scheduled executions or Spotify API calls were introduced for Frequency configuration.

### Tests

- Added ownership regressions for canonical Frequency/Behavior definitions, hidden-ID source identity, custom Frequency initialization/save behavior, one installer source manifest, removal of dead Add Job code, explicit view integration, and single-render Setup behavior.
- Preserved the v1.3.3–v1.3.7 migration, checkbox-row, Source/Target presentation, scheduler, heartbeat, update, and installer safety coverage.

### Upgrade note

- Install the 1.3.8 bundle in the same Apps Script project, reload the Sheet, then run **Spoti Sync → Initialize / Repair Sheets** once. Existing Spotify Client ID, OAuth tokens, playlist IDs, job IDs, scheduler state, heartbeat state, Activity history, and job configuration are preserved.

## 1.3.7 — 2026-08-15

### Fixed

- Removed the obsolete Jobs **Source** dropdown from `SheetViews`, eliminating the refresh/repair flash where `Liked Songs / Playlist ↗` briefly appeared before the Job editor presentation layer cleared it.
- Removed the old generic `Playlist ↗` / `Open playlist ↗` renderer from `SheetViews`; friendly Source/Target names now have one presentation owner in `JobEditor`.
- Source and Target remain display-only in Jobs and are configured through **Spoti Sync → Add Job…** / **Edit Selected Job…**. Enabled checkbox, Behavior dropdown, and Frequency dropdown remain unchanged.

### Safety

- The existing broad validation cleanup through Frequency remains in place so stale legacy Source/Strategy validation is still removed during repair.
- No scheduler behavior, Spotify API calls, OAuth state, playlist IDs, sync logic, heartbeat state, migration semantics, or Jobs dataset rewrites were changed.
- The hotfix does not add `clearFormats()` or new scheduled executions.

### Tests

- Added regression guards proving `SheetViews` cannot recreate Source validation or generic Source/Target playlist labels while Enabled, Behavior, and Frequency validations remain present.
- Preserved the v1.3.3 checkbox-row, v1.3.4 Frequency, v1.3.5 Job editor, and v1.3.6 empty-row cleanup coverage.

### Upgrade note

- Install the 1.3.7 bundle in the same Apps Script project, reload the Sheet, then run **Spoti Sync → Initialize / Repair Sheets** once. Existing Spotify Client ID, OAuth tokens, playlist IDs, scheduler state, heartbeat state, and real job data are preserved.

## 1.3.6 — 2026-08-15

### Fixed

- Fixed the v1.3.5 friendly-name renderer so empty future Jobs rows stay blank instead of being populated with `Liked Songs`.
- Friendly Source/Target rendering now first confirms that a row is actually configured using non-presentation job state; Source display text is never used as the job-existence signal.
- `Initialize / Repair Sheets` now runs a narrow presentation cleanup first on current layouts, preventing v1.3.5-polluted empty rows from being assigned Job IDs during repair.
- Existing real Liked Songs jobs and playlist-source jobs continue to show friendly Source/Target labels while hidden Spotify playlist IDs remain authoritative.

### Safety

- No scheduler behavior, trigger count, OAuth state, playlist IDs, heartbeat state, Frequency parsing, or migration semantics were changed.
- The hotfix does not add `clearFormats()`, whole-sheet rewrites, or new scheduled executions.

### Tests

- Added regression coverage for one real Liked Songs job, a real playlist-source job, and 49 v1.3.5-polluted future rows, verifying that empty Source/Target cells are restored and remain non-jobs.
- Preserved the existing v1.3.3 checkbox-only row, v1.3.4 Frequency, scheduler, and installer safety checks.

### Upgrade note

- Install the 1.3.6 bundle in the same Apps Script project, reload the Sheet, then run **Spoti Sync → Initialize / Repair Sheets** once. The pre-repair cleanup removes the accidental `Liked Songs` presentation values before repair. Existing Spotify Client ID, OAuth tokens, playlist IDs, scheduler state, heartbeat state, and real job data are preserved.

## 1.3.5 — 2026-08-15

### Added

- Added **Spoti Sync → Add Job…** and **Edit Selected Job…** sidebars so users can configure jobs without typing Spotify playlist IDs.
- Added searchable source and target playlist pickers backed by the current user's Spotify playlist catalog.
- Added a manual Spotify playlist URL/ID fallback for playlists that are not convenient to select from the catalog.
- Added optional target-playlist creation directly from the Job editor using the existing playlist modification scopes.

### Improved

- Jobs now shows friendly linked playlist names such as `Playlist · Road Trip ↗` and `Shareable Likes ↗` while keeping stable Spotify playlist IDs in hidden columns as the synchronization source of truth.
- Source selection is no longer an ambiguous `Playlist ↗` dropdown. `Liked Songs` and Spotify playlist sources are chosen explicitly in the Job editor.
- Playlist catalog search is entirely client-side after the sidebar opens. Opening the editor performs one Apps Script execution; saving performs one execution; no scheduler triggers or periodic jobs are added.
- Playlist catalog responses are cached briefly per user, and normal scheduled syncs do not call Spotify solely to refresh display names.
- `Initialize / Repair Sheets` refreshes friendly names when Spotify is available, but display-name failures never remove or replace stored playlist IDs.

### Safety

- Preserved the v1.3.3 explicit-only migration path, checkbox-only row protections, bounded sheet repair, and no-`clearFormats()` runtime behavior.
- Preserved v1.3.4 Frequency validation and custom `Every N days` schedules.
- Job edits update the configured row and hidden playlist IDs without rewriting the Jobs dataset or touching OAuth credentials, heartbeat state, or scheduler state.

### Tests

- Added regression coverage for friendly playlist labels, duplicate playlist names resolved by ID, playlist-source parsing, Job editor menu wiring, caching/scheduler guards, and installer inclusion.

### Upgrade note

- Install the 1.3.5 bundle in the same Apps Script project and run **Spoti Sync → Initialize / Repair Sheets** once. Existing Spotify Client ID, OAuth tokens, playlist IDs, scheduler trigger/state, heartbeat state, telemetry, and job data are preserved.

## 1.3.4 — 2026-08-15

### Improved

- Added a dedicated **Frequency** dropdown in Jobs with common presets: `Daily`, `Every 2 days`, `Every 3 days`, `Every 7 days`, `Every 10 days`, `Every 14 days`, `Every 30 days`, `Every 60 days`, and `Every 90 days`.
- Kept the existing flexible parser: users can still type any valid custom interval such as `Every 21 days`, from 1 to 3650 days, instead of being limited to preset values.
- Added validation help text and a clearer Frequency column note so new users can discover both preset and custom scheduling without reading documentation first.
- Frequency validation is separate from Behavior validation and continues to clear legacy v1.2 rules first, so `MIRROR` / `APPEND` cannot reappear as Frequency choices.

### Tests

- Added regression coverage for the preset list, dropdown configuration, custom-value allowance, help text, legacy-strategy exclusion, and parsing a non-preset `Every 21 days` schedule.

### Upgrade note

- Install the 1.3.4 bundle in the same Apps Script project and run **Spoti Sync → Initialize / Repair Sheets** once so the updated Frequency validation is applied. Existing Spotify Client ID, OAuth tokens, playlist IDs, scheduler state, and job data are preserved.

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
- `Initialize / Repair Sheets` migrates existing job playlist IDs and telemetry into this structure while leaving User Properties untouched, so the Spotify Client ID and OAuth tokens do not need to be entered again.
- Scheduler and interactive state changes refresh Dashboard, Jobs, Schedule, and Activity-derived views together.
- User-facing project links now prefer `https://sid.is-a.dev/Spoti-sync/`; GitHub remains the source/changelog location.

### Spotify heartbeat behavior

- Track additions/removals and description updating happen inside the same Spoti Sync job execution.
- Playlist-item writes complete before the heartbeat description is sent, preventing a false fresh timestamp when the playlist mutation failed.
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
