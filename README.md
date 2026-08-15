# Spoti Sync

Self-hosted Spotify playlist sync for Google Sheets. Mirror Liked Songs or playlists automatically with Google Apps Script — no hosted backend and no always-on computer.

**Install / update:** https://sid.is-a.dev/Spoti-sync/  
**Source:** https://github.com/11sid11/Spoti-sync

## What it does

- Sync **Liked Songs** or a Spotify playlist into another playlist.
- Use **Exact Mirror** or **Append Only** behavior.
- Choose **Automation: Off, Daily, or Every N days**.
- Run any job manually with **Sync now**.
- Optionally keep the target playlist description updated with Spoti Sync status.

Spoti Sync has one normal control surface: **Spoti Sync → Open Spoti Sync**. The visible Google Sheet is status and Activity history, not a second configuration UI.

## Quick start

1. Open the [Spoti Sync installer](https://sid.is-a.dev/Spoti-sync/#install).
2. Create a blank Google Sheet and open **Extensions → Apps Script**.
3. Copy the generated Spoti Sync bundle into `Code.gs`, save, and reload the Sheet.
4. Open **Spoti Sync → Open Spoti Sync**.
5. Follow the sidebar to connect your Spotify Developer app.
6. Choose **+ Add job**.
7. Pick the source, target, behavior, and automation. Save — Spoti Sync manages background scheduling automatically.

No web-app deployment, local server, Node.js installation, or `clasp` setup is required for normal use.

## How a job works

| Choice | Options |
| --- | --- |
| **Source** | Liked Songs or Spotify playlist |
| **Target** | Existing playlist or create a new playlist |
| **Behavior** | Exact Mirror or Append Only |
| **Automation** | Off, Daily, or Every N days |

**Exact Mirror** keeps the managed target membership aligned with the source.  
**Append Only** adds missing source tracks and never removes existing target tracks.

## Privacy

Spoti Sync runs in your own Google Apps Script environment. Spotify access/refresh tokens are stored in Apps Script User Properties, not on a hosted Spoti Sync backend or GitHub Pages.

See [`SECURITY.md`](SECURITY.md) for the security model and [`ARCHITECTURE.md`](ARCHITECTURE.md) for implementation details.

## Updating

1. Open the [update section](https://sid.is-a.dev/Spoti-sync/#update).
2. Copy the latest Apps Script bundle.
3. Replace `Code.gs` in the **same** bound Apps Script project and save.
4. Reload the Sheet and open **Spoti Sync → Open Spoti Sync**.

Updates preserve the existing installation state; they do not require recreating jobs or manually rebuilding automation.

## Development

Node.js 22+ is used only for local build/test tooling.

```bash
node scripts/build.js
node scripts/test.js
node scripts/test-v14.js
node scripts/test-scheduler.js
node scripts/test-sheet-repair.js
node scripts/test-job-editor.js
node scripts/test-heartbeat.js
node scripts/test-update-checker.js
node scripts/test-docs.js
```

`docs/source-files.json` is the canonical ordered Apps Script source manifest used by the build and browser installer.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution guidance.

## License

MIT. See [`LICENSE`](LICENSE).
