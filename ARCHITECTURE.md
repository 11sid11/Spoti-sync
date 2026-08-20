# Architecture

## Design goal

Spoti Sync is a small self-deployed automation system with one user-facing control plane:

```text
Spoti Sync sidebar = configure + operate
Google Sheet       = status + activity + hidden local persistence
```

The project intentionally avoids a hosted application server, central user database, shared Spotify credentials, runtime package manager, and per-job scheduler triggers.

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
              +-- job persistence
              +-- sync engine
              +-- optional playlist heartbeat
              +-- one reconciled scheduler
              +-- single sidebar application
              +-- read-only status + Activity views
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

Replacing `Code.gs` or migrating the Sheet layout does not clear these properties.

### Bound Google Sheet

User-facing:

- **Spoti Sync** — read-only system/job status.
- **Activity** — bounded execution history.

Internal:

- **Jobs** — hidden durable job records, including stable Job IDs, playlist IDs, behavior, automation frequency, heartbeat preference and per-job telemetry.
- **Schedule** — legacy v1.3 sheet preserved/hidden on upgrade; normal v1.5 runtime does not render it.

The existing `Frequency` cell is the canonical serialized schedule. It stores values such as `Hourly`, `Every 6 hours`, `Daily`, or `Every 7 days`; no additional scheduling column is required for v1.5.

### Document Properties

- scheduler telemetry and current scheduler mode (`NONE`, `DAILY`, or `HOURLY`)
- update-check cache/status
- latest real run summary
- playlist display-name cache
- one tiny heartbeat phrase index per stable Job ID

### GitHub

Source, static documentation, tests, CI, installer manifest, and release metadata only.

## Single-surface application

`Spoti Sync → Open Spoti Sync` opens the only normal control surface.

The sidebar owns:

- Spotify connection state/setup
- job list/cards
- Add/Edit/Delete Job
- manual Sync now
- Automation selection
- per-job playlist-description status setting
- update check
- advanced local repair

Google Sheet cells are not a second configuration interface.

## Job model

A job has stable identity plus four primary user concepts:

```text
Source → Target
Behavior
Automation
```

and one optional presentation feature:

```text
Heartbeat Enabled
```

Runtime identity uses hidden Spotify playlist IDs, not human-readable display labels.

Automation maps onto the existing storage model:

```text
Off           → enabled=false, stored Frequency retained
Hourly        → enabled=true,  unit=HOUR, interval=1
Every N hours → enabled=true,  unit=HOUR, interval=N (1–23)
Daily         → enabled=true,  unit=DAY,  interval=1
Every N days  → enabled=true,  unit=DAY,  interval=N (1–3650)
```

The canonical server-side Frequency parser remains responsible for validation. Day-based schedules retain the existing calendar-day semantics; hour-based schedules use elapsed hours since the last successful run.

## Runtime model

### Automatic runs

`Scheduler.reconcile()` enforces the invariant:

```text
0 automated jobs                         → 0 Spoti Sync triggers
only Daily / Every N days jobs           → exactly 1 DAILY Spoti Sync trigger
any Hourly / Every N hours job present   → exactly 1 HOURLY Spoti Sync trigger
```

There is never a daily and hourly Spoti Sync scheduler trigger at the same time, and there are no per-job triggers.

The scheduler persists the selected dispatcher mode in Document Properties because Apps Script project-trigger objects identify the handler but do not expose enough recurrence metadata for Spoti Sync to reliably infer whether an existing clock trigger is hourly or daily. A single legacy v1.4 trigger with no stored mode is treated as DAILY, so an upgrade with only day-based jobs does not recreate a correct trigger.

The hourly dispatcher is deliberately cheap. It loads local job state, evaluates due jobs, and exits when none are due. A no-due check does not call Spotify, append an Activity row, overwrite the last real run summary, or repaint the status sheet. Scheduler health telemetry may still be updated.

### Manual runs

A user can explicitly run any valid job by stable Job ID, including a job whose Automation setting is Off. Manual execution does not mutate the job's enabled state.

Both scheduled and manual writes use the script lock and the same job execution path.

## Sync execution

For each selected job:

```text
fetch source + target
        ↓
plan Exact Mirror / Append Only
        ↓
apply playlist item removals/additions
        ↓
if Heartbeat Enabled:
    update target playlist description
        ↓
record per-job telemetry + Activity row
```

A description-only failure is non-fatal and produces `Success with warning`. A failed music mutation never receives a misleading fresh heartbeat.

## Playlist heartbeat

`75_PlaylistHeartbeat.gs` owns description formatting and phrase rotation:

```text
[rotating Spoti Sync phrase] · sid.is-a.dev · 🔄 Thu, Aug 20 · 3:16 AM
```

The timestamp uses the spreadsheet timezone. The job-owned `Heartbeat Enabled` field controls whether SyncEngine invokes that module. Disabling it does not clear or replace the current Spotify description.

Phrase rotation state remains in Document Properties and advances only after Spotify accepts the description update.

## Playlist catalog and display names

The sidebar home uses local/cached job metadata and does not fetch the Spotify playlist catalog just to render.

Opening Add/Edit lazily loads the catalog once, with a short per-user cache. Search/filtering is client-side. Manual playlist URL/ID input remains available if the catalog cannot be loaded.

Playlist names are presentation metadata; stable Spotify IDs remain authoritative.

## View rendering

`SheetViews` owns only the read-only summary and Activity presentation.

Normal runtime does not format or add validation to hidden Jobs, and does not render the legacy Schedule sheet. This removes the earlier class of bugs where sheet validations/presentation and the sidebar competed for ownership of the same configuration cells.

## Migration

v1.5 does not add a Jobs schema column. Existing `Daily` and `Every N days` Frequency strings continue to parse exactly as day schedules and retain their existing calendar-day behavior.

The v1.4 migration protections remain in place: stable Job IDs, playlist IDs, names, behavior, frequencies, automation state, heartbeat state and telemetry are preserved. Migration remains explicit/bounded: no whole-sheet `clearFormats()` and no OAuth/property reset.

The old Dashboard is renamed to Spoti Sync when safe. A conflicting unrelated user sheet named `Spoti Sync` must never be cleared; a safe status fallback is used instead.

## Strategy contract

Strategies remain pure planning logic.

### MIRROR

- remove managed target tracks absent from source;
- add missing source tracks;
- repair duplicate managed target tracks;
- leave unsupported/non-track items alone;
- preserve expected source ordering.

### APPEND

- never remove target items;
- append only missing source tracks;
- preserve chronological append behavior for newest-first sources.

## Safety and resilience

- Script lock prevents overlapping playlist writes, including manual and scheduled runs.
- Spotify `401` can trigger token refresh/retry.
- Spotify `429` honors practical `Retry-After` values and stops rather than sleeping past the Apps Script execution budget when the requested wait is too long.
- transient `5xx` responses use bounded retries.
- one failed job does not stop later jobs.
- heartbeat failure does not replay playlist mutations.
- OAuth scopes exclude `user-library-modify`.
- tokens are never intentionally written to Sheet cells/logs.
- playlist writes are limited to configured target IDs.
- update checks never execute remote code or request `script.projects`.
