# Architecture

## Goals

Spoti Sync is intentionally optimized for a small operational footprint:

- no hosted application server;
- no central user database;
- no shared Spotify credentials;
- no always-on user device;
- no runtime package manager;
- a single scheduled trigger per installation;
- source and strategy abstractions that remain easy to extend.

## Deployment model

```text
GitHub Pages / repository
        |
        | setup instructions + install bundle
        v
User's Google Sheet
        |
        +-- bound Google Apps Script
              |
              +-- OAuth + PKCE
              +-- Spotify API client
              +-- sync engine
              +-- daily scheduler
              +-- configuration + logging
                    |
                    v
              Spotify Web API
                    |
                    v
              User's Spotify account
```

The GitHub Pages site is static. It never receives Spotify tokens, Google tokens, playlist contents, or user configuration.

## Storage boundaries

### Apps Script User Properties

Sensitive or user-scoped runtime values:

- Spotify Client ID (not secret, but user-specific configuration)
- Spotify refresh token
- Spotify access token
- access-token expiry
- authorization timestamp
- temporary PKCE verifier

### Bound Google Sheet

Inspectable, non-secret application state:

- `Dashboard` — summarized installation and last-run status
- `Jobs` — sync job configuration and per-job run status
- `History` — bounded synchronization history

### GitHub

Only source code, generated install artifacts, static documentation, tests, and CI configuration.

## Runtime model

A single Apps Script time-driven trigger invokes `spotiSyncScheduler()` once per day. The scheduler reads enabled jobs and executes only jobs that are due according to their `Interval Days` value.

Source snapshots are cached for the lifetime of one scheduler execution. If five jobs all use Liked Songs, the source library is fetched once and reused by all five jobs.

## Source contract

A source returns:

```text
{
  key: stable source cache key,
  ordering: NEWEST_FIRST | PRESERVE,
  tracks: [
    {
      keyUri: canonical comparison URI,
      writeUri: URI safe to send back to Spotify,
      name: display metadata,
      artists: display metadata,
      addedAt: optional timestamp
    }
  ],
  ignoredCount: number
}
```

Initial source implementations:

- `LIKED_SONGS`
- `PLAYLIST`

## Strategy contract

A strategy is pure planning logic. It receives normalized source and target snapshots and returns a plan:

```text
{
  add: [track records],
  remove: [Spotify URIs],
  ignored: number
}
```

Initial strategies:

### MIRROR

- remove managed target tracks that are absent from the source;
- add source tracks that are absent from the target;
- repair duplicate managed target tracks by removing all occurrences of that canonical item and adding one source copy back;
- do not touch unsupported/non-track playlist items such as local files or episodes;
- add missing Liked Songs tracks at the front while preserving source ordering.

`MIRROR` guarantees managed Spotify-track membership, not continuous whole-playlist reordering.

### APPEND

- never remove target items;
- append only source tracks not already represented in the target;
- for `NEWEST_FIRST` sources such as Liked Songs, append missing tracks oldest-to-newest so the archive grows chronologically.

## Concurrency and retries

- A script lock prevents manual and scheduled synchronization from overlapping.
- Spotify `401` responses trigger one forced access-token refresh and retry.
- Spotify `429` responses honor `Retry-After` when it is small enough to remain practical within Apps Script execution limits.
- transient Spotify `5xx` errors use capped retry/backoff.
- one failing job is logged and does not prevent later jobs from running.

## Safety properties

- The OAuth scope list excludes `user-library-modify`, so Spoti Sync cannot unlike or save tracks in the user's library.
- OAuth tokens are never written to Sheet cells or application logs.
- API errors are sanitized before logging.
- Sync writes are limited to playlists explicitly configured as targets.
