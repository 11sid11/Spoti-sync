# 🎵 Spoti Sync

**Self-hosted Spotify playlist sync for Google Sheets.**  
Mirror Liked Songs or Spotify playlists automatically with Google Apps Script. No hosted backend. No always-on computer.

[![CI](https://github.com/11sid11/Spoti-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/11sid11/Spoti-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?logo=googleappsscript&logoColor=white)
![Spotify Web API](https://img.shields.io/badge/Spotify%20Web%20API-1DB954?logo=spotify&logoColor=white)

**[Install / update](https://sid.is-a.dev/Spoti-sync/)** · [Security](SECURITY.md) · [Architecture](ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md)

> **Liked Songs** → **Shareable Likes** · ✓ Synced automatically

Spoti Sync has one normal control surface: **Spoti Sync → Open Spoti Sync**. The Google Sheet stays focused on status and Activity history rather than becoming a second configuration UI.

## ✨ What it does

- Use **Liked Songs** or a Spotify playlist as the source.
- Sync into an existing playlist or create a new target playlist.
- Choose **Exact Mirror** or **Append Only** behavior.
- Set **Automation: Off, Hourly, Every N hours, Daily, or Every N days**.
- Run any job manually with **Sync now**.
- Optionally keep the target playlist description updated with Spoti Sync status.

## 🚀 Quick start

1. Open the [Spoti Sync installer](https://sid.is-a.dev/Spoti-sync/#install).
2. Create or open a Google Sheet.
3. Open **Extensions → Apps Script**.
4. Copy the generated Spoti Sync bundle into `Code.gs`, then save and reload the Sheet.
5. Open **Spoti Sync → Open Spoti Sync**.
6. Connect your Spotify Developer app from the sidebar.
7. Choose **+ Add job**.
8. Pick the source, target, behavior, and automation, then save.

No web-app deployment, local server, Node.js installation, or `clasp` setup is required for normal use.

## 🔁 How a job works

| Choice | Options |
| --- | --- |
| **Source** | Liked Songs or Spotify playlist |
| **Target** | Existing playlist or create a new playlist |
| **Behavior** | Exact Mirror or Append Only |
| **Automation** | Off, Hourly, Every N hours, Daily, or Every N days |

**Exact Mirror** keeps the managed target membership aligned with the source.  
**Append Only** adds missing source tracks and never removes existing target tracks.

Spoti Sync still uses one background scheduler. If any job uses an hour-based interval, jobs are checked hourly; Spotify is contacted only for jobs that are actually due.

## 🔐 Privacy

Spoti Sync runs in your own Google Apps Script environment. Spotify access and refresh tokens are stored in Apps Script User Properties, not on a hosted Spoti Sync backend or GitHub Pages.

See [`SECURITY.md`](SECURITY.md) for the security model and [`ARCHITECTURE.md`](ARCHITECTURE.md) for implementation details.

## ⬆️ Updating

1. Open the [update section](https://sid.is-a.dev/Spoti-sync/#update).
2. Copy the latest Apps Script bundle.
3. Replace `Code.gs` in the **same** bound Apps Script project and save.
4. Reload the Sheet and open **Spoti Sync → Open Spoti Sync**.

Updates preserve the existing installation state; they do not require recreating jobs or manually rebuilding automation.

## 🛠 Development

Node.js 22+ is used only for local build and test tooling.

```bash
node scripts/build.js
node scripts/test.js
node scripts/test-v14.js
node scripts/test-v15.js
node scripts/test-scheduler.js
node scripts/test-sheet-repair.js
node scripts/test-job-editor.js
node scripts/test-heartbeat.js
node scripts/test-update-checker.js
node scripts/test-docs.js
```

`docs/source-files.json` is the canonical ordered Apps Script source manifest used by both the build and browser installer.

## 🤝 Contributing

Focused fixes and improvements are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## 📄 License

MIT. See [`LICENSE`](LICENSE).
