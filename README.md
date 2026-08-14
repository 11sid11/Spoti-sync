# Spoti Sync

Self-deployed Spotify playlist automation powered by Google Apps Script.

Spoti Sync exists for a simple reason: Spotify's **Liked Songs** collection is useful, but it is not a normal shareable playlist. Spoti Sync can mirror Liked Songs into a regular Spotify playlist, keep an append-only archive of everything you have liked, and provide a small foundation for other playlist synchronization rules.

## Why this project is different

- **Runs in your Google account.** There is no Spoti Sync backend, database, or always-on computer.
- **Uses your own Spotify Developer app.** Your Spotify OAuth tokens are not stored by this repository or the GitHub Pages site.
- **No Spotify client secret.** Authentication uses Authorization Code with PKCE.
- **No runtime dependencies.** The installed Apps Script is plain JavaScript using built-in Google services.
- **Low quota footprint.** One daily Apps Script trigger decides which configured jobs are due.
- **Visible scheduler state.** The Jobs sheet shows whether the cloud scheduler is enabled, how many Spoti Sync triggers exist, its daily execution window, the last background check, and the next due job.
- **Open source and inspectable.** Human-readable source lives in `src/`; the GitHub Pages installer assembles the one-file `SpotiSync.gs` bundle directly from those committed modules in the user's browser.

## Included strategies

| Strategy | Behavior |
| --- | --- |
| `MIRROR` | Keeps the managed Spotify track membership of the target equal to the source. Missing tracks are added and obsolete tracks are removed. |
| `APPEND` | Adds source tracks that are not already present in the target. Existing target tracks are never removed. |

The default use cases are:

1. **Liked Songs → MIRROR → Shareable Likes**, daily.
2. **Liked Songs → APPEND → Likes Archive**, every 10 days.

## Scheduler visibility

Spoti Sync uses exactly one clock trigger named `spotiSyncScheduler`. Enabling the scheduler is idempotent: the script removes any existing Spoti Sync scheduler triggers before creating one replacement trigger, so repeated clicks do not stack duplicate daily jobs.

The **Jobs** sheet keeps the A:M job table unchanged and adds a scheduler panel in **O:P** showing:

- enabled / disabled state;
- the daily Apps Script execution window and spreadsheet timezone;
- that execution happens in the Google Apps Script cloud;
- the actual Spoti Sync scheduler trigger count;
- the last scheduler check and result;
- the next due enabled job;
- where per-job attempt/success/add/remove/error telemetry is recorded.

Google Apps Script selects a time within the configured hourly window and then keeps that recurring timing approximately consistent. Spoti Sync currently configures the 03:00 hour in the spreadsheet timezone.

## Installation

Use the guided GitHub Pages installer. The site is static and does not receive Spotify or Google credentials.

At a high level:

1. Create a blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Use **Copy Apps Script** or **Download Apps Script** on the setup page. The bundle is assembled on demand from `src/*.gs`; there is no separately hosted generated file to go stale or disappear.
4. Replace `Code.gs` with the generated bundle and save.
5. Reload the Sheet and open **Spoti Sync → Setup**.
6. Create a Spotify Developer app, register the callback URI shown by Spoti Sync, and paste your Client ID.
7. Authorize Spotify, add sync jobs, preview changes, then enable the daily scheduler.
8. Open the **Jobs** sheet to confirm the scheduler panel says **Enabled** and `Trigger count` is `1`.

No web-app deployment, local server, Node.js installation, or `clasp` setup is required for end users.

## Security model

Spoti Sync requests only the Spotify capabilities needed to read library/playlist membership and modify configured playlists. It intentionally does **not** request permission to modify the user's Liked Songs library.

Sensitive OAuth credentials are stored in Apps Script **User Properties** inside the user's own bound script project. Playlist configuration and non-sensitive run history live in the bound Google Sheet.

See [`SECURITY.md`](SECURITY.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) for details.

## Development

The source is split into Apps Script-friendly modules under `src/`. A dependency-free Node script can build the same combined file locally for validation:

```bash
node scripts/build.js
node scripts/test.js
node scripts/test-scheduler.js
```

The generated local bundle lives under ignored `dist/`; production installation does not depend on committing or publishing generated code.

## GitHub Pages

The repository currently publishes GitHub Pages directly from the `main` branch. Root `index.html` routes users to the guided site under `docs/`. The site's copy/download controls build the Apps Script bundle client-side from the repository source, so Pages does not need a build workflow.

## Current platform constraints

Spoti Sync targets the Spotify Web API behavior available in 2026, including the current `/playlists/{id}/items` endpoints. Spotify Development Mode currently requires the Spotify developer/app owner to have Premium and limits new development apps to a small number of authorized users; Spoti Sync avoids a shared app by having every installation use its own Spotify Client ID.

## License

MIT. See [`LICENSE`](LICENSE).
