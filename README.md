# Spoti Sync

Self-deployed Spotify playlist automation running on Google Apps Script.

**Project / installer:** https://sid.is-a.dev/Spoti-sync/

Spoti Sync keeps Spotify playlists synchronized without a hosted backend or always-on computer. The app runs in the user's Google account, uses the user's own Spotify Developer app, and keeps its normal controls in one Google Sheets sidebar.

## Product model

Spoti Sync 1.4 has one normal control surface:

**Spoti Sync → Open Spoti Sync**

From that sidebar a user can connect Spotify, add/edit/delete jobs, sync a single job now, choose automation, check updates, and repair local data when needed.

Google Sheets is no longer a second configuration UI. It is operational output:

- **Spoti Sync** — read-only connection, automation, job and sync status.
- **Activity** — bounded execution history with additions/removals, duration, warnings and errors.

The existing **Jobs** sheet remains local durable storage but is hidden. A legacy **Schedule** sheet is preserved and hidden during upgrades instead of being destructively deleted.

## A job has four primary choices

### Source

- **Liked Songs**
- **Spotify playlist** — select from the user's playlist catalog or paste a Spotify playlist URL/ID.

### Target

- **Existing playlist** — select it or paste its Spotify URL/ID.
- **Create new playlist** — choose its name and public/private setting.

### Behavior

| Behavior | Result |
| --- | --- |
| **Exact Mirror** | Keeps managed Spotify-track membership of the target equal to the source. Missing tracks are added and obsolete tracks are removed. |
| **Append Only** | Adds source tracks missing from the target. Existing target tracks are never removed. |

Behavior is the intended extension point for future Spoti Sync features.

### Automation

- **Off** — never runs in the background; the job can still be run manually.
- **Daily**
- **Every N days** — any valid whole-number interval from 1 to 3650 days.

Spoti Sync automatically reconciles its scheduler. If at least one job is automated, exactly one daily Apps Script trigger exists. If no jobs are automated, no Spoti Sync scheduler trigger is needed. There are never per-job triggers.

## Playlist status description

Each job has **Show Spoti Sync status in playlist description**, enabled by default.

When enabled, a successful job updates the target description after playlist-item writes succeed:

```text
Kept fresh with Spoti Sync ✨ · sid.is-a.dev · Synced Saturday at 2:22 AM
```

The opening phrase rotates. Spoti Sync never changes the playlist name. If the description update fails, the music sync remains successful and Activity records a warning.

Turning the setting off skips the description request; it does not blank the user's existing description.

## Manual sync

Every job card has **Sync now**. A job with Automation **Off** remains manually runnable by its stable Job ID; Spoti Sync does not temporarily enable it.

Exact Mirror asks for confirmation before an explicit manual run because it may remove target tracks that are absent from the source.

## Installation

Use the guided installer at https://sid.is-a.dev/Spoti-sync/.

1. Create a blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Copy/download the Spoti Sync bundle from the installer, replace `Code.gs`, and save.
4. Reload the Sheet and choose **Spoti Sync → Open Spoti Sync**.
5. In the same sidebar, create/configure your Spotify Developer app using the shown Redirect URI and authorize Spotify.
6. Choose **+ Add job**, select the source and target, choose a Behavior and Automation setting, then save.
7. Use the job card to **Sync now** if desired. Background automation is managed automatically.

No web-app deployment, local server, Node.js installation, or `clasp` setup is required for end users.

## Updating an existing installation

Spoti Sync checks `docs/version.json` for stable release metadata but never silently installs executable code.

1. Open the guided updater.
2. Copy the latest Apps Script bundle.
3. Replace `Code.gs` in the **same** bound Apps Script project and save.
4. Reload the Sheet.
5. Choose **Spoti Sync → Open Spoti Sync** once. The v1.4 migration runs locally and preserves existing state.

The upgrade does **not** require reconnecting Spotify, re-entering the Client ID, re-entering playlist IDs, recreating jobs, or manually recreating the scheduler.

## Migration from 1.3.x

v1.4 preserves existing OAuth/User Properties, stable Job IDs, source/target playlist IDs, job names, Exact Mirror/Append Only behavior, custom Every N days schedules, enabled/disabled state, telemetry, Activity history, heartbeat phrase state, and compatible scheduler state.

Existing jobs default the new per-job playlist-description status setting to **on**, matching prior behavior.

The old Dashboard is migrated into the read-only **Spoti Sync** status view when safe. Jobs is hidden as internal storage. An existing Schedule sheet is hidden and preserved; normal runtime no longer renders it.

## Execution model

- Opening the app does not fetch the Spotify playlist catalog merely to draw the home screen.
- Entering Add/Edit lazily loads the catalog and caches it briefly per user.
- Playlist search is browser-side and creates no Apps Script execution per keystroke.
- Saving/deleting a job writes local configuration once, reconciles the single scheduler, and refreshes the status view.
- Scheduled runs use one daily trigger and execute only automated jobs that are due.
- Source snapshots are cached within a sync execution, so multiple jobs can reuse the same Liked Songs snapshot.

## Security model

- Spotify Authorization Code with PKCE; no Spotify client secret.
- OAuth tokens live in Apps Script **User Properties**, not Sheet cells or GitHub Pages.
- `user-library-modify` is intentionally excluded, so Spoti Sync cannot unlike/save Liked Songs.
- Playlist writes are limited to explicitly configured target playlist IDs.
- Updates never request `script.projects`, execute remote code, or silently rewrite Apps Script.

See [`SECURITY.md`](SECURITY.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Development

```bash
node scripts/build.js
node scripts/test.js
node scripts/test-scheduler.js
node scripts/test-sheet-repair.js
node scripts/test-job-editor.js
node scripts/test-heartbeat.js
node scripts/test-v14.js
node scripts/test-update-checker.js
```

`docs/source-files.json` is the canonical ordered source manifest used by both the Node build and GitHub Pages installer.

## Current platform constraints

Spoti Sync targets the current Spotify Web API playlist and library endpoints used by the source tree. Spotify Development Mode requirements and limits are controlled by Spotify and may change independently of Spoti Sync.

## License

MIT. See [`LICENSE`](LICENSE).
