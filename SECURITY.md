# Security Policy

## Credential handling

Spoti Sync uses Spotify Authorization Code with PKCE and does not require a Spotify client secret.

OAuth tokens are stored in Apps Script User Properties and are never intentionally written to spreadsheet cells, GitHub, GitHub Pages, or logs.

Do not modify the project to log raw OAuth token responses, request authorization headers, or User Properties.

## OAuth scope policy

The project intentionally does not request `user-library-modify`. A normal Spoti Sync installation can read Liked Songs and modify explicitly configured playlists, but it cannot add to or remove from Liked Songs.

Spoti Sync also intentionally does not request the Google Apps Script `script.projects` scope. The installed script does not use the Apps Script API to rewrite its own project source.

## Update trust model

Spoti Sync 1.2+ checks `docs/version.json` from this repository for stable release metadata. The automatic checker reads only metadata such as the latest version, release notes, and update/changelog URLs.

The automatic checker does **not**:

- fetch and evaluate executable JavaScript;
- silently replace Apps Script source files;
- call the Apps Script `projects.updateContent` endpoint;
- request permission to modify arbitrary Apps Script projects.

When an update is available, the user explicitly opens the guided updater and replaces `Code.gs` in their existing bound Apps Script project. This deliberate handoff keeps code changes reviewable and prevents the GitHub repository from becoming a silent remote-code execution channel into installed copies.

CI includes guards against introducing `script.projects`, Apps Script self-update API calls, or dynamic `eval()` execution into the generated bundle.

## Self-deployed trust model

Each user installs the script into their own Google account and supplies their own Spotify Client ID. The repository operators do not run a central token service.

Because the installed Apps Script can read its own User Properties, users should review source updates before replacing their installed code. User Properties should not be treated as equivalent to a dedicated hardware-backed secret manager.

## Reporting a vulnerability

Please do not publish active credential leaks or exploitable security issues in a public issue. Use GitHub's private vulnerability reporting feature if it is enabled for this repository. If it is unavailable, contact the repository owner privately through an appropriate GitHub profile contact method.

Include:

- affected version/commit;
- reproduction steps;
- expected impact;
- whether credentials or user data may have been exposed;
- any suggested mitigation.
