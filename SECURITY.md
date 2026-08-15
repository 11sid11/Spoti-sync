# Security Policy

## Credential handling

Spoti Sync uses Spotify Authorization Code with PKCE and does not require a Spotify client secret.

OAuth tokens are stored in Apps Script User Properties and are never intentionally written to spreadsheet cells, GitHub, GitHub Pages, or logs. Rebuilding the local Sheet layout or replacing `Code.gs` does not clear those User Properties.

Do not modify the project to log raw OAuth token responses, authorization headers, or User Properties.

## OAuth scope policy

The project intentionally does not request `user-library-modify`. A normal installation can read Liked Songs and modify explicitly configured playlists, but cannot add to or remove from Liked Songs.

The existing playlist modification scopes also authorize the optional playlist-description status update. v1.4 introduces no additional Spotify scope.

Spoti Sync intentionally does not request the Google Apps Script `script.projects` scope and does not rewrite its own Apps Script project through the Apps Script API.

## Playlist-description trust boundary

Each job can enable or disable **Show Spoti Sync status in playlist description**. Existing and new jobs default it to enabled.

When enabled, Spoti Sync sends `PUT /playlists/{id}` with a `description` field only after playlist-item mutations for that job succeed. It never sends or changes the playlist name.

The description contains only a short Spoti Sync phrase, `sid.is-a.dev`, and a timestamp in the spreadsheet timezone. No OAuth token, Client ID, source track list, or other secret is placed in the description.

If description updating fails, the playlist sync remains successful and the warning is recorded locally instead of replaying music mutations. When the setting is disabled, Spoti Sync skips the description request; it does not blank or replace the user's existing description.

## Local data boundary

Spoti Sync 1.4 uses the sidebar as the normal configuration surface. The visible **Spoti Sync** sheet is status-only and **Activity** is execution history. Job configuration remains in a hidden local **Jobs** sheet in the user's bound spreadsheet.

Stable playlist IDs, Job IDs and job configuration are never sent to the GitHub Pages installer.

## Update trust model

Spoti Sync checks `docs/version.json` for stable release metadata. The checker does not:

- fetch and evaluate executable JavaScript;
- silently replace Apps Script source files;
- call `projects.updateContent`;
- request permission to modify arbitrary Apps Script projects.

The user explicitly replaces `Code.gs` in the existing bound project. CI guards against introducing `script.projects`, self-update API calls, or dynamic `eval()` execution.

## Self-deployed trust model

Each user installs into their own Google account and supplies their own Spotify Client ID. The repository operators do not run a central token service.

Because installed Apps Script can read its own User Properties, users should review source updates before replacing their installed code. User Properties are convenient account-local storage, not a hardware-backed secret manager.

## Reporting a vulnerability

Do not publish active credential leaks or exploitable issues in a public issue. Use GitHub private vulnerability reporting if enabled, or contact the repository owner privately through an appropriate GitHub profile channel.

Include the affected version/commit, reproduction steps, expected impact, whether credentials/user data may have been exposed, and any suggested mitigation.
