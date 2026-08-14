# Security Policy

## Credential handling

Spoti Sync uses Spotify Authorization Code with PKCE and does not require a Spotify client secret.

OAuth tokens are stored in Apps Script User Properties and are never intentionally written to spreadsheet cells, GitHub, GitHub Pages, or logs.

Do not modify the project to log raw OAuth token responses, request authorization headers, or User Properties.

## OAuth scope policy

The project intentionally does not request `user-library-modify`. A normal Spoti Sync installation can read Liked Songs and modify explicitly configured playlists, but it cannot add to or remove from Liked Songs.

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
