# Changelog

All notable changes to Spoti Sync are documented here.

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
