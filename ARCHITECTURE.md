# Architecture

## Goals

Spoti Sync is optimized for a small operational footprint:

- no hosted application server or central user database;
- no shared Spotify credentials;
- no always-on user device;
- no runtime package manager;
- one scheduled trigger per installation;
- source and strategy abstractions that remain easy to extend.

## Deployment model

```text
sid.is-a.dev / GitHub Pages
        |
        | setup instructions + browser-built install bundle
        v
User's Google Sheet
        |
        +-- bound Google Apps Script
              |
              +-- OAuth + PKCE
              +-- Spotify API client
              +-- sync engine
              +-- playlist heartbeat
              +-- daily scheduler
              +-- Sheet UI + activity
                    |
                    v
              Spotify Web API
```

The static site never receives Spotify tokens, Google tokens, playlist contents, or job configuration.

## Storage boundaries

### Apps Script User Properties

- Spotify Client ID
- Spotify refresh/access tokens
- access-token expiry
- authorization timestamp
- temporary PKCE verifier

Replacing `Code.gs` and rebuilding Sheet layouts does not clear User Properties.

### Bound Google Sheet

- `Dashboard` — system health, latest run, next automation, recent activity
- `Jobs` — visible job controls/status plus hidden stable job IDs, playlist IDs, and per-job telemetry
- `Schedule` — scheduler state and upcoming eligible jobs
- `Activity` — bounded execution history

### Document Properties

- scheduler telemetry
- update-check cache/status
- run summary
- one tiny heartbeat phrase index per stable job ID

### GitHub

Source, static documentation, tests, CI, and release metadata only.

## Job identity and layout

Each job receives a stable opaque `job_<id>` when created or when a pre-1.3 row is migrated. Runtime state such as heartbeat rotation keys off that ID rather than the row number. Rows may therefore move without changing job identity.

The visible Jobs columns favor human-readable values (`Liked Songs`, `Exact Mirror`, `Daily`, health and eligibility). Spotify playlist IDs and telemetry are retained in hidden columns; the visible playlist cells link to Spotify.

## Runtime model

A single time-driven trigger invokes `spotiSyncScheduler()` once per day. The scheduler reads enabled jobs and runs only jobs that are due according to their frequency.

Source snapshots are cached for one execution. Multiple jobs using Liked Songs reuse the same fetched source snapshot.

## Sync execution

For each job:

```text
fetch source + target
        ↓
plan MIRROR / APPEND
        ↓
apply playlist item removals/additions
        ↓
update target playlist description heartbeat
        ↓
record job telemetry + Activity row
```

The description request is deliberately after playlist-item writes but inside the same job execution. A failed track mutation therefore cannot leave a misleading fresh heartbeat. A description-only failure is non-fatal and produces `Success with warning`.

## Playlist heartbeat

`75_PlaylistHeartbeat.gs` owns formatting and phrase rotation. It generates:

```text
[rotating Spoti Sync phrase] · sid.is-a.dev · Synced [weekday] at [time]
```

The timestamp uses the spreadsheet timezone. Phrase state advances only after Spotify accepts `PUT /playlists/{id}`. The request body contains `description` only; Spoti Sync does not send a replacement playlist name.

## Strategy contract

Strategies remain pure planning logic.

### MIRROR

- remove managed target tracks absent from the source;
- add missing source tracks;
- repair duplicate managed target tracks;
- leave unsupported/non-track items alone;
- insert missing Liked Songs tracks at the front while preserving source order.

### APPEND

- never remove target items;
- append only missing source tracks;
- for newest-first sources, append missing tracks oldest-to-newest.

## Concurrency and retries

- A script lock prevents overlapping manual/scheduled writes.
- Spotify `401` triggers one forced token refresh and retry.
- Spotify `429` honors practical `Retry-After` values.
- transient `5xx` responses use capped backoff.
- one failed job does not stop later jobs.
- heartbeat failures are warnings and do not cause playlist mutations to be replayed.

## Safety properties

- OAuth scopes exclude `user-library-modify`; Spoti Sync cannot unlike/save library tracks.
- OAuth tokens never go to Sheet cells or application logs.
- API errors are sanitized before Sheet logging.
- playlist writes are limited to explicitly configured targets.
- update checks never request `script.projects` or execute remote code.
