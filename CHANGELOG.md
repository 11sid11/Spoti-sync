# Changelog

All notable changes to Spoti Sync are documented here.

## 1.1.0 — 2026-08-14

### Added

- Scheduler status panel in columns O:P of the Jobs sheet.
- Visible scheduler trigger count, cloud runtime, daily execution window, last background check, last check result, and next due job.
- Dedicated scheduler telemetry so background checks are distinguishable from manual syncs.
- Regression checks for scheduler idempotency and Jobs-sheet visibility.

### Changed

- Re-enabling the daily scheduler is explicitly idempotent: existing Spoti Sync scheduler triggers are removed before exactly one replacement trigger is created.
- Interactive setup, job creation, preview, manual sync, reconnect, and scheduler controls refresh the Jobs scheduler panel.
- The clock-trigger entrypoint now passes through the scheduler telemetry wrapper before running due jobs.

## 1.0.0 — 2026-08-14

Initial public release.

### Added

- Spotify Authorization Code + PKCE authentication with no client secret.
- `LIKED_SONGS` and playlist sources with per-run source caching.
- `MIRROR` strategy for an exact managed-track membership mirror.
- `APPEND` strategy for append-only archives.
- Relink-aware Spotify track comparison and duplicate repair.
- One daily Apps Script scheduler with per-job day intervals.
- Dry-run preview, manual sync, history, dashboard, and configuration diagnostics.
- Guided Google Sheet setup UI and Spotify reconnect flow.
- Dependency-free single-file Apps Script installer build.
- Static GitHub Pages setup guide.
- CI regression/safety checks and GitHub Pages deployment workflow.
