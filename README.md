# Spoti Sync

Self-deployed Spotify playlist automation running on Google Apps Script.

**Project / installer:** https://sid.is-a.dev/Spoti-sync/

Spoti Sync mirrors Spotify **Liked Songs** into a normal shareable playlist, can maintain an append-only archive, and provides a small foundation for other playlist synchronization rules.

## Why this project is different

- **Runs in your Google account.** There is no Spoti Sync backend, database, or always-on computer.
- **Uses your own Spotify Developer app.** OAuth tokens are not stored by this repository or the GitHub Pages site.
- **No Spotify client secret.** Authentication uses Authorization Code with PKCE.
- **No runtime dependencies.** The installed Apps Script uses built-in Google services only.
- **One scheduler.** A single daily Apps Script trigger decides which enabled jobs are due.
- **Clear operational views.** `Dashboard`, `Jobs`, `Schedule`, and `Activity` each have one purpose.
- **Spotify heartbeat.** Every successful job refreshes the target playlist description so Spotify itself shows when Spoti Sync last completed that job.
- **Automatic update awareness.** The daily scheduler checks a small GitHub version metadata file at most once per day.
- **No silent remote code execution.** Updates are detected automatically but installed explicitly by the user.
- **Open source and inspectable.** The browser installer assembles the one-file Apps Script bundle from committed `src/*.gs` modules.

## Included strategies

| Strategy | Behavior |
| --- | --- |
| `MIRROR` | Keeps managed Spotify-track membership of the target equal to the source. Missing tracks are added and obsolete tracks are removed. |
| `APPEND` | Adds source tracks missing from the target. Existing target tracks are never removed. |

Typical jobs:

1. **Liked Songs → MIRROR → Shareable Likes**, daily.
2. **Liked Songs → APPEND → Likes Archive**, every 10 days.
3. **Spotify playlist → MIRROR/APPEND → another playlist**, with playlist selection by name in the Job editor.

## Google Sheet layout

Spoti Sync 1.3 uses four operational sheets:

- **Dashboard** — connection health, scheduler state, release state, latest run, next automation, and recent activity.
- **Jobs** — compact job configuration with friendly playlist names, behavior/frequency labels, health, and next-eligible state. Stable Spotify playlist IDs, job IDs, and telemetry stay in hidden columns.
- **Schedule** — scheduler status, cloud runtime, trigger count, daily execution window, last background check, and upcoming eligible jobs.
- **Activity** — bounded execution history with result, additions/removals, duration, warnings, and errors.

Use **Spoti Sync → Add Job…** to create a job and **Edit Selected Job…** after selecting an existing Jobs row. The sidebar lets you choose **Liked Songs** or a Spotify playlist as the source, choose an existing target playlist, create a new target playlist, or paste a Spotify playlist link when needed. Playlist search happens inside the sidebar after one catalog load; typing in search does not create additional Apps Script executions.

Jobs shows friendly linked playlist names such as `Playlist · Road Trip ↗` and `Shareable Likes ↗`. The hidden Spotify playlist ID remains the synchronization source of truth, so renaming a playlist does not change which resource the job targets.

`Frequency` has one canonical set of common presets used by both the Jobs sheet and the Job editor: Daily, 2, 3, 7, 10, 14, 30, 60, and 90 days. In the Job editor, choose **Custom interval…** to enter any other whole-number schedule from 1 to 3650 days, such as 21. Existing custom jobs reopen with their interval preserved. The server-side Frequency parser remains authoritative for validation.

`Initialize / Repair Sheets` migrates the pre-1.3 Jobs/History layout into this structure. Existing Spotify Client ID, OAuth tokens, configured playlist IDs, and scheduler trigger remain in the same installation. Friendly playlist-name resolution is presentation-only; failure to resolve a display name never removes the stored playlist ID.

## Playlist heartbeat

A successful write run also updates the **target playlist description** in the same job execution. Track writes happen first; the description is updated immediately afterwards and before the run is recorded complete. This prevents Spotify from showing a fresh success timestamp if the actual playlist mutation failed.

The description rotates only the opening Spoti Sync phrase. Examples:

```text
Kept fresh with Spoti Sync ✨ · sid.is-a.dev · Synced Saturday at 2:22 AM
Kept in sync with Spoti Sync 🔄 · sid.is-a.dev · Synced Sunday at 3:14 AM
Refreshed with Spoti Sync 🎧 · sid.is-a.dev · Synced Monday at 3:09 AM
```

The full rotation is:

- `Kept fresh with Spoti Sync ✨`
- `Kept in sync with Spoti Sync 🔄`
- `Refreshed with Spoti Sync 🎧`
- `Kept current with Spoti Sync 🟢`
- `Tuned with Spoti Sync 🎵`
- `Staying fresh with Spoti Sync 💿`

The timestamp uses the spreadsheet timezone. A `+0 / -0` run still refreshes the heartbeat because the playlist was successfully checked. If description updating fails after the playlist itself was synchronized, the run is recorded as **Success with warning** rather than retried as a failed music sync. Spotify requires the authorized account to own the playlist before changing its description, so collaborator-only targets can still sync items while recording a heartbeat warning.

Spoti Sync never sends a replacement playlist name when updating the description.

## Scheduler behavior

Spoti Sync uses exactly one clock trigger named `spotiSyncScheduler`. Enabling is idempotent: existing Spoti Sync scheduler triggers are removed before exactly one replacement is created.

Google Apps Script selects a time within the configured hourly window. Spoti Sync currently configures the `03:00–04:00` window in the spreadsheet timezone. The `Schedule` sheet therefore reports eligibility and the window rather than inventing an exact future minute.

The Job editor does not create, delete, or duplicate scheduler triggers. Opening it loads the playlist catalog once (with a short user cache), searching is client-side, and saving happens in one server execution.

## Updates

Starting with 1.2, Spoti Sync automatically checks `docs/version.json` for release metadata. In 1.3, update state appears in the redesigned Dashboard and Schedule views.

The updater intentionally does **not** call the Apps Script `projects.updateContent` API, request `script.projects`, or evaluate source fetched from GitHub. When a release is available:

1. Open **Spoti Sync → Check for Updates**.
2. Open the guided updater.
3. Copy the latest Apps Script bundle.
4. Replace `Code.gs` in the **same** bound Apps Script project.
5. Save, reload the Sheet, and run **Initialize / Repair Sheets** once.

The existing Spotify Client ID, OAuth tokens, job playlist IDs, and trigger remain in that installation.

## Installation

Use the guided installer at https://sid.is-a.dev/Spoti-sync/.

At a high level:

1. Create a blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Use **Copy Apps Script** or **Download Apps Script** on the setup page.
4. Replace `Code.gs` and save.
5. Reload the Sheet and open **Spoti Sync → Setup**.
6. Create a Spotify Developer app, register the callback URI shown by Spoti Sync, select **Web API**, and paste your Client ID.
7. Authorize Spotify, add a job from **Spoti Sync → Add Job…**, preview, run once, then enable the daily scheduler.
8. Use **Schedule** to verify that the scheduler is enabled and trigger count is `1`.

No web-app deployment, local server, Node.js installation, or `clasp` setup is required for end users.

## Security model

Spoti Sync intentionally excludes `user-library-modify`, so Liked Songs remains read-only. Playlist modification scopes are used only for explicitly configured targets, including their managed description heartbeat.

Sensitive OAuth credentials are stored in Apps Script **User Properties** inside the user's bound project. Job configuration, activity, scheduler/update telemetry, friendly playlist-name cache, and the tiny heartbeat rotation index live in the user's Sheet or Document Properties.

See [`SECURITY.md`](SECURITY.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Development

```bash
node scripts/build.js
node scripts/test.js
node scripts/test-scheduler.js
node scripts/test-sheet-repair.js
node scripts/test-job-editor.js
node scripts/test-heartbeat.js
node scripts/test-update-checker.js
```

`docs/source-files.json` is the canonical ordered list of Apps Script source modules used by both the Node build and the GitHub Pages browser installer. The generated local bundle lives under ignored `dist/`; production installation is assembled directly from committed source modules.

## Current platform constraints

Spoti Sync targets the current Spotify Web API `/playlists/{id}/items` endpoints, `GET /me/playlists`, `POST /me/playlists`, and `PUT /playlists/{id}` for playlist descriptions. Spotify Development Mode requirements and limits are controlled by Spotify and may change independently of Spoti Sync.

## License

MIT. See [`LICENSE`](LICENSE).
