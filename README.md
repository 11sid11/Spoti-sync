# Spoti Sync

Self-deployed Spotify playlist automation powered by Google Apps Script.

Spoti Sync exists for a simple reason: Spotify's **Liked Songs** collection is useful, but it is not a normal shareable playlist. Spoti Sync can mirror Liked Songs into a regular Spotify playlist, keep an append-only archive of everything you have liked, and provide a small foundation for other playlist synchronization rules.

## Why this project is different

- **Runs in your Google account.** There is no Spoti Sync backend, database, or always-on computer.
- **Uses your own Spotify Developer app.** Your Spotify OAuth tokens are not stored by this repository or the GitHub Pages site.
- **No Spotify client secret.** Authentication uses Authorization Code with PKCE.
- **No runtime dependencies.** The installed Apps Script is plain JavaScript using built-in Google services.
- **Low quota footprint.** One daily Apps Script trigger decides which configured jobs are due.
- **Open source and inspectable.** The human-readable source lives in `src/`; CI and GitHub Pages generate a single-file `SpotiSync.gs` installer from those modules.

## Included strategies

| Strategy | Behavior |
| --- | --- |
| `MIRROR` | Keeps the managed Spotify track membership of the target equal to the source. Missing tracks are added and obsolete tracks are removed. |
| `APPEND` | Adds source tracks that are not already present in the target. Existing target tracks are never removed. |

The default use cases are:

1. **Liked Songs → MIRROR → Shareable Likes**, daily.
2. **Liked Songs → APPEND → Likes Archive**, every 10 days.

## Installation

The guided installer is designed to be hosted on GitHub Pages. Until Pages is enabled for the repository, the same steps are available in [`docs/index.html`](docs/index.html).

At a high level:

1. Create a blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Use the GitHub Pages installer to copy or download the generated `SpotiSync.gs` bundle, then replace `Code.gs` with it.
4. Save, reload the Sheet, and open **Spoti Sync → Setup**.
5. Create a Spotify Developer app, register the callback URI shown by Spoti Sync, and paste your Client ID.
6. Authorize Spotify.
7. Add sync jobs, preview changes, then enable the daily scheduler.

No web-app deployment, local server, Node.js installation, or `clasp` setup is required for end users.

## Security model

Spoti Sync requests only the Spotify capabilities needed to read library/playlist membership and modify configured playlists. It intentionally does **not** request permission to modify the user's Liked Songs library.

Sensitive OAuth credentials are stored in Apps Script **User Properties** inside the user's own bound script project. Playlist configuration and non-sensitive run history live in the bound Google Sheet.

See [`SECURITY.md`](SECURITY.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) for details.

## Development

The source is split into Apps Script-friendly modules under `src/`. A dependency-free Node script concatenates them into the installable bundle:

```bash
node scripts/build.js
node scripts/test.js
```

`node scripts/build.js --check` can verify locally generated artifacts without rewriting them. CI performs a fresh build before running tests.

## Current platform constraints

Spoti Sync targets the Spotify Web API behavior available in 2026, including the current `/playlists/{id}/items` endpoints. Spotify Development Mode currently requires the Spotify developer/app owner to have Premium and limits new development apps to a small number of authorized users; Spoti Sync avoids a shared app by having every installation use its own Spotify Client ID.

## License

MIT. See [`LICENSE`](LICENSE).
