var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var JOB_HEADERS = [
    'Enabled', 'Name', 'Source', 'Target', 'Behavior', 'Frequency', 'Health', 'Next Eligible',
    'Job ID', 'Source Playlist ID', 'Target Playlist ID', 'Last Attempt', 'Last Success',
    'Last Status', 'Last Added', 'Last Removed', 'Last Error / Warning'
  ];

  var LEGACY_JOB_HEADERS = [
    'Enabled', 'Name', 'Source', 'Source Playlist', 'Target Playlist', 'Strategy', 'Interval Days',
    'Last Attempt', 'Last Success', 'Last Status', 'Last Added', 'Last Removed', 'Last Error'
  ];

  var ACTIVITY_HEADERS = [
    'Timestamp', 'Job', 'Result', 'Added', 'Removed', 'Duration', 'Details', 'Job ID'
  ];

  var LEGACY_HISTORY_HEADERS = [
    'Timestamp', 'Job', 'Strategy', 'Added', 'Removed', 'Ignored', 'Status', 'Duration Ms', 'Error'
  ];

  var JOB_COL = Object.freeze({
    ENABLED: 1, NAME: 2, SOURCE: 3, TARGET: 4, BEHAVIOR: 5, FREQUENCY: 6,
    HEALTH: 7, NEXT: 8, ID: 9, SOURCE_PLAYLIST_ID: 10, TARGET_PLAYLIST_ID: 11,
    LAST_ATTEMPT: 12, LAST_SUCCESS: 13, LAST_STATUS: 14, LAST_ADDED: 15,
    LAST_REMOVED: 16, LAST_ERROR: 17
  });

  function spreadsheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('Spoti Sync must run from its bound Google Sheet.');
    }
    return ss;
  }

  function timezone() {
    return spreadsheet().getSpreadsheetTimeZone();
  }

  function headersMatch(actual, expected) {
    return expected.every(function (header, index) {
      return actual[index] === header;
    });
  }

  function isBlankRow(row) {
    return !row.some(function (value) {
      return value !== '' && value !== null;
    });
  }

  function normalizeBoolean(value) {
    if (value === true) {
      return true;
    }
    return String(value).toLowerCase() === 'true' ||
      String(value).toLowerCase() === 'yes' || String(value) === '1';
  }

  function newJobId() {
    return 'job_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  }

  function safePlaylistId(value) {
    try {
      return ns.Core.parsePlaylistId(value);
    } catch (ignored) {
      return ns.Core.trim(value);
    }
  }

  function sourceLabel(sourceType) {
    return sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST ? 'Playlist ↗' : 'Liked Songs';
  }

  function parseSourceLabel(value) {
    var normalized = ns.Core.trim(value).toUpperCase();
    if (normalized === 'LIKED SONGS' || normalized === 'LIKED_SONGS') {
      return ns.Constants.SOURCE_TYPES.LIKED_SONGS;
    }
    if (normalized === 'PLAYLIST' || normalized.indexOf('PLAYLIST ') === 0) {
      return ns.Constants.SOURCE_TYPES.PLAYLIST;
    }
    throw new Error('Source must be Liked Songs or Playlist.');
  }

  function behaviorLabel(strategy) {
    return strategy === ns.Constants.STRATEGIES.APPEND ? 'Append Only' : 'Exact Mirror';
  }

  function parseBehaviorLabel(value) {
    var normalized = ns.Core.trim(value).toUpperCase();
    if (normalized === 'EXACT MIRROR' || normalized === 'MIRROR') {
      return ns.Constants.STRATEGIES.MIRROR;
    }
    if (normalized === 'APPEND ONLY' || normalized === 'APPEND') {
      return ns.Constants.STRATEGIES.APPEND;
    }
    throw new Error('Behavior must be Exact Mirror or Append Only.');
  }

  function frequencyLabel(intervalDays) {
    var days = Number(intervalDays);
    return days === 1 ? 'Daily' : 'Every ' + days + ' days';
  }

  function parseFrequency(value) {
    var normalized = ns.Core.trim(value);
    var match;
    var days;

    if (/^daily$/i.test(normalized)) {
      return 1;
    }
    match = normalized.match(/^every\s+(\d+)\s+days?$/i);
    days = match ? Number(match[1]) : Number(normalized);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error('Frequency must be Daily or Every N days, from 1 to 3650 days.');
    }
    return days;
  }

  function dateKeyFromOrdinal(ordinal) {
    return Utilities.formatDate(new Date(ordinal * 86400000), 'UTC', 'yyyy-MM-dd');
  }

  function nextEligibleLabel(job, now) {
    var tz = timezone();
    var current = now || new Date();
    var last;
    var dueOrdinal;

    if (!job.enabled) {
      return '—';
    }
    if (!job.lastSuccess) {
      return 'Ready now';
    }
    last = job.lastSuccess instanceof Date ? job.lastSuccess : new Date(job.lastSuccess);
    if (isNaN(last.getTime())) {
      return 'Ready now';
    }
    dueOrdinal = ns.Core.calendarDayOrdinal(last, tz) + job.intervalDays;
    if (dueOrdinal <= ns.Core.calendarDayOrdinal(current, tz)) {
      return 'Due now';
    }
    return dateKeyFromOrdinal(dueOrdinal);
  }

  function healthLabel(job) {
    var status = ns.Core.trim(job.lastStatus).toLowerCase();
    if (!job.enabled) { return '○ Disabled'; }
    if (status.indexOf('error') !== -1 || status.indexOf('failure') !== -1) {
      return '✕ Needs attention';
    }
    if (status.indexOf('warning') !== -1) { return '⚠ Warning'; }
    if (!job.lastSuccess) { return '● Ready'; }
    return '✓ Healthy';
  }

  function formatTimestamp(value, pattern) {
    if (!value) { return 'Never'; }
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) { return String(value); }
    return Utilities.formatDate(date, timezone(), pattern || 'EEE, MMM d · h:mm a');
  }

  function legacyJobToStoredRow(row) {
    var sourceType = parseSourceLabel(row[2]);
    var strategy = parseBehaviorLabel(row[5]);
    var intervalDays = Number(row[6]);
    return [
      normalizeBoolean(row[0]),
      ns.Core.trim(row[1]) || 'Spotify Sync',
      sourceLabel(sourceType),
      'Open playlist ↗',
      behaviorLabel(strategy),
      Number.isInteger(intervalDays) && intervalDays > 0 ? frequencyLabel(intervalDays) : ns.Core.trim(row[6]),
      '', '', newJobId(),
      sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST ? safePlaylistId(row[3]) : '',
      safePlaylistId(row[4]),
      row[7] || '', row[8] || '', ns.Core.trim(row[9]), Number(row[10] || 0),
      Number(row[11] || 0), ns.Core.trim(row[12])
    ];
  }

  function legacyActivityToRow(row) {
    var details = ns.Core.trim(row[8]);
    var ignored = Number(row[5] || 0);
    var strategy = ns.Core.trim(row[2]);
    if (!details) {
      details = strategy;
      if (ignored) {
        details += (details ? ' · ' : '') + ignored + ' unsupported ignored';
      }
    }
    return [
      row[0] || '', ns.Core.trim(row[1]), ns.Core.trim(row[6]), Number(row[3] || 0),
      Number(row[4] || 0), Number(row[7] || 0), details, ''
    ];
  }

  function hasJobDefinition(row) {
    return row.slice(1, JOB_COL.FREQUENCY).some(function (value) {
      return value !== '' && value !== null;
    });
  }

  function looksLikePartialLegacyJob(row) {
    var strategy = ns.Core.trim(row[5]).toUpperCase();
    var intervalDays = Number(row[6]);

    if ([ns.Constants.STRATEGIES.MIRROR, ns.Constants.STRATEGIES.APPEND].indexOf(strategy) === -1) {
      return false;
    }
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) {
      return false;
    }

    try {
      parseSourceLabel(row[2]);
      ns.Core.parsePlaylistId(row[4]);
      return true;
    } catch (ignored) {
      return false;
    }
  }

  function repairCurrentJobRows(rows) {
    var repaired = [];
    var changed = false;

    rows.forEach(function (row) {
      var current = row.slice(0, JOB_HEADERS.length);

      // A failed v1.3.0 migration could leave the new headers in row 1 while
      // row data was still in the v1.2 A:M layout. Recover that configuration
      // instead of asking the user to paste playlist IDs again.
      if (looksLikePartialLegacyJob(current)) {
        repaired.push(legacyJobToStoredRow(current.slice(0, LEGACY_JOB_HEADERS.length)));
        changed = true;
        return;
      }

      // Old scheduler-panel values in O:P, plus health text generated from
      // those remnants, can make otherwise empty rows look like disabled jobs.
      // A real job always has definition data in B:F.
      if (!hasJobDefinition(current)) {
        if (!isBlankRow(current)) {
          changed = true;
        }
        return;
      }

      if (!ns.Core.trim(current[JOB_COL.ID - 1])) {
        current[JOB_COL.ID - 1] = newJobId();
        changed = true;
      }
      repaired.push(current);
    });

    if (repaired.length !== rows.length) {
      changed = true;
    }
    return { rows: repaired, changed: changed };
  }

  function replaceSheetData(sheet, headers, rows) {
    var values = [headers].concat(rows || []);
    var maxRows = sheet.getMaxRows();
    var maxColumns = sheet.getMaxColumns();

    // Old layouts can leave strict validation rules behind even after content
    // and formatting are cleared. Remove those rules before writing converted
    // friendly values such as "Liked Songs" and "Exact Mirror".
    sheet.getRange(1, 1, maxRows, maxColumns).clearDataValidations();

    // Write the replacement dataset before clearing any old trailing cells. If
    // this write fails, the legacy values have not been destructively cleared.
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);

    if (maxRows > values.length) {
      sheet.getRange(values.length + 1, 1, maxRows - values.length, maxColumns).clearContent();
    }
    if (maxColumns > headers.length) {
      sheet.getRange(1, headers.length + 1, values.length, maxColumns - headers.length).clearContent();
    }
    sheet.clearFormats();
  }

  function ensureJobsSheet() {
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(ns.Constants.SHEETS.JOBS) || ss.insertSheet(ns.Constants.SHEETS.JOBS);
    var lastRow = sheet.getLastRow();
    var width = Math.max(sheet.getLastColumn(), JOB_HEADERS.length, LEGACY_JOB_HEADERS.length);
    var header = sheet.getRange(1, 1, 1, width).getValues()[0];
    var isEmpty = lastRow === 0 || (lastRow === 1 && isBlankRow(header));
    var migratedRows = [];
    var repairResult;

    if (isEmpty) {
      replaceSheetData(sheet, JOB_HEADERS, []);
    } else if (headersMatch(header, LEGACY_JOB_HEADERS)) {
      if (lastRow > 1) {
        migratedRows = sheet.getRange(2, 1, lastRow - 1, LEGACY_JOB_HEADERS.length).getValues()
          .filter(function (row) { return !isBlankRow(row); })
          .map(legacyJobToStoredRow);
      }
      replaceSheetData(sheet, JOB_HEADERS, migratedRows);
    } else if (headersMatch(header, JOB_HEADERS)) {
      if (lastRow > 1) {
        repairResult = repairCurrentJobRows(
          sheet.getRange(2, 1, lastRow - 1, JOB_HEADERS.length).getValues()
        );
        if (repairResult.changed) {
          replaceSheetData(sheet, JOB_HEADERS, repairResult.rows);
        }
      }
    } else {
      throw new Error('The Jobs sheet layout is not recognized. Spoti Sync left it unchanged to avoid losing configuration.');
    }
    return sheet;
  }

  function ensureActivitySheet() {
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(ns.Constants.SHEETS.ACTIVITY);
    var legacy = ss.getSheetByName('History');
    var lastRow;
    var width;
    var header;
    var migratedRows = [];

    if (!sheet && legacy) {
      legacy.setName(ns.Constants.SHEETS.ACTIVITY);
      sheet = legacy;
    }
    if (!sheet) {
      sheet = ss.insertSheet(ns.Constants.SHEETS.ACTIVITY);
    }

    lastRow = sheet.getLastRow();
    width = Math.max(sheet.getLastColumn(), ACTIVITY_HEADERS.length, LEGACY_HISTORY_HEADERS.length);
    header = sheet.getRange(1, 1, 1, width).getValues()[0];
    if (lastRow === 0 || (lastRow === 1 && isBlankRow(header))) {
      replaceSheetData(sheet, ACTIVITY_HEADERS, []);
    } else if (headersMatch(header, LEGACY_HISTORY_HEADERS)) {
      if (lastRow > 1) {
        migratedRows = sheet.getRange(2, 1, lastRow - 1, LEGACY_HISTORY_HEADERS.length).getValues()
          .filter(function (row) { return !isBlankRow(row); })
          .map(legacyActivityToRow);
      }
      replaceSheetData(sheet, ACTIVITY_HEADERS, migratedRows);
    } else if (!headersMatch(header, ACTIVITY_HEADERS)) {
      throw new Error('The Activity sheet layout is not recognized. Spoti Sync left it unchanged.');
    }
    return sheet;
  }

  function normalizeJob(row, rowNumber) {
    if (isBlankRow(row)) { return null; }
    var enabled = normalizeBoolean(row[JOB_COL.ENABLED - 1]);
    var job = {
      rowNumber: rowNumber,
      enabled: enabled,
      name: ns.Core.trim(row[JOB_COL.NAME - 1]) || ('Job ' + rowNumber),
      jobId: ns.Core.trim(row[JOB_COL.ID - 1]) || ('row_' + rowNumber),
      lastAttempt: row[JOB_COL.LAST_ATTEMPT - 1] || null,
      lastSuccess: row[JOB_COL.LAST_SUCCESS - 1] || null,
      lastStatus: ns.Core.trim(row[JOB_COL.LAST_STATUS - 1]),
      lastAdded: Number(row[JOB_COL.LAST_ADDED - 1] || 0),
      lastRemoved: Number(row[JOB_COL.LAST_REMOVED - 1] || 0),
      lastError: ns.Core.trim(row[JOB_COL.LAST_ERROR - 1])
    };

    if (!enabled) {
      job.sourceType = '';
      job.sourcePlaylist = ns.Core.trim(row[JOB_COL.SOURCE_PLAYLIST_ID - 1]);
      job.targetPlaylist = ns.Core.trim(row[JOB_COL.TARGET_PLAYLIST_ID - 1]);
      job.strategy = '';
      job.intervalDays = 0;
      return job;
    }

    job.sourceType = parseSourceLabel(row[JOB_COL.SOURCE - 1]);
    job.strategy = parseBehaviorLabel(row[JOB_COL.BEHAVIOR - 1]);
    job.intervalDays = parseFrequency(row[JOB_COL.FREQUENCY - 1]);
    job.sourcePlaylist = ns.Core.trim(row[JOB_COL.SOURCE_PLAYLIST_ID - 1]);
    job.targetPlaylist = ns.Core.trim(row[JOB_COL.TARGET_PLAYLIST_ID - 1]);
    if (job.sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
      job.sourcePlaylist = ns.Core.parsePlaylistId(job.sourcePlaylist);
    } else {
      job.sourcePlaylist = '';
    }
    job.targetPlaylist = ns.Core.parsePlaylistId(job.targetPlaylist);
    return job;
  }

  function parseJobRows(rows, startingRowNumber) {
    var result = { jobs: [], errors: [] };
    var firstRow = Number(startingRowNumber || 2);
    rows.forEach(function (row, index) {
      var rowNumber = firstRow + index;
      try {
        var job = normalizeJob(row, rowNumber);
        if (job) { result.jobs.push(job); }
      } catch (error) {
        if (normalizeBoolean(row[JOB_COL.ENABLED - 1])) {
          result.errors.push({
            rowNumber: rowNumber,
            jobId: ns.Core.trim(row[JOB_COL.ID - 1]),
            name: ns.Core.trim(row[JOB_COL.NAME - 1]) || ('Job row ' + rowNumber),
            strategy: ns.Core.trim(row[JOB_COL.BEHAVIOR - 1]),
            error: ns.Core.safeErrorMessage(error)
          });
        }
      }
    });
    return result;
  }

  function storedRowForNewJob(job) {
    var sourceType = ns.Core.trim(job.sourceType).toUpperCase();
    var strategy = ns.Core.trim(job.strategy).toUpperCase();
    var intervalDays = Number(job.intervalDays);
    var sourcePlaylist = sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST
      ? ns.Core.parsePlaylistId(job.sourcePlaylist) : '';
    var targetPlaylist = ns.Core.parsePlaylistId(job.targetPlaylist);

    if ([ns.Constants.SOURCE_TYPES.LIKED_SONGS, ns.Constants.SOURCE_TYPES.PLAYLIST].indexOf(sourceType) === -1) {
      throw new Error('Unsupported source type.');
    }
    if ([ns.Constants.STRATEGIES.MIRROR, ns.Constants.STRATEGIES.APPEND].indexOf(strategy) === -1) {
      throw new Error('Unsupported strategy.');
    }
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) {
      throw new Error('Interval Days must be a whole number from 1 to 3650.');
    }

    return [
      job.enabled !== false, ns.Core.trim(job.name) || 'Spotify Sync', sourceLabel(sourceType),
      'Open playlist ↗', behaviorLabel(strategy), frequencyLabel(intervalDays), '', '', newJobId(),
      sourcePlaylist, targetPlaylist, '', '', '', 0, 0, ''
    ];
  }

  function refreshViews() {
    if (ns.SheetViews && ns.SheetViews.refreshAll) {
      ns.SheetViews.refreshAll();
    }
  }

  function refreshRunViews() {
    if (!ns.SheetViews) { return; }
    ns.SheetViews.refreshJobsStatus();
    ns.SheetViews.refreshSchedule();
    ns.SheetViews.refreshDashboard();
  }

  ns.SheetStore = {
    jobHeaders: JOB_HEADERS.slice(),
    activityHeaders: ACTIVITY_HEADERS.slice(),

    initialize: function () {
      ensureJobsSheet();
      ensureActivitySheet();
      refreshViews();
    },

    getJobReadResult: function () {
      var sheet = ensureJobsSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) { return { jobs: [], errors: [] }; }
      return parseJobRows(sheet.getRange(2, 1, lastRow - 1, JOB_HEADERS.length).getValues(), 2);
    },

    getJobs: function () {
      return ns.SheetStore.getJobReadResult().jobs;
    },

    addJob: function (job) {
      var sheet = ensureJobsSheet();
      var row = storedRowForNewJob(job);
      sheet.appendRow(row);
      refreshViews();
      return row[JOB_COL.ID - 1];
    },

    isJobDue: function (job, now) {
      return ns.Core.isDueByCalendarDay(job.lastSuccess, job.intervalDays, now, timezone());
    },

    getSpreadsheetTimezone: timezone,
    getNextEligibleLabel: function (job, now) { return nextEligibleLabel(job, now || new Date()); },

    updateJobSuccess: function (job, summary) {
      var sheet = ensureJobsSheet();
      var now = new Date();
      var warning = ns.Core.trim(summary.warning);
      sheet.getRange(job.rowNumber, JOB_COL.LAST_ATTEMPT, 1, 6).setValues([[
        now, now, warning ? 'Success with warning' : 'Success', Number(summary.added || 0),
        Number(summary.removed || 0), warning
      ]]);
    },

    updateJobError: function (job, error) {
      var sheet = ensureJobsSheet();
      sheet.getRange(job.rowNumber, JOB_COL.LAST_ATTEMPT).setValue(new Date());
      sheet.getRange(job.rowNumber, JOB_COL.LAST_STATUS).setValue('Error');
      sheet.getRange(job.rowNumber, JOB_COL.LAST_ERROR).setValue(ns.Core.safeErrorMessage(error));
    },

    updateConfigurationError: function (configError) {
      var sheet = ensureJobsSheet();
      sheet.getRange(configError.rowNumber, JOB_COL.LAST_ATTEMPT).setValue(new Date());
      sheet.getRange(configError.rowNumber, JOB_COL.LAST_STATUS).setValue('Configuration error');
      sheet.getRange(configError.rowNumber, JOB_COL.LAST_ERROR).setValue(configError.error);
    },

    appendActivity: function (entry) {
      var sheet = ensureActivitySheet();
      sheet.appendRow([
        entry.timestamp || new Date(), entry.job || '', entry.status || '', Number(entry.added || 0),
        Number(entry.removed || 0), Number(entry.durationMs || 0),
        ns.Core.trim(entry.details || entry.error || ''), entry.jobId || ''
      ]);
      var dataRows = sheet.getLastRow() - 1;
      if (dataRows > ns.Constants.MAX_ACTIVITY_ROWS) {
        sheet.deleteRows(2, dataRows - ns.Constants.MAX_ACTIVITY_ROWS);
      }
    },

    setRunSummary: function (summary) {
      ns.Storage.setDocumentStatus({
        LAST_RUN_AT: summary.finishedAt || ns.Core.nowIso(),
        LAST_RUN_STATUS: summary.status || '',
        LAST_RUN_ADDED: String(summary.added || 0),
        LAST_RUN_REMOVED: String(summary.removed || 0),
        LAST_LIKED_COUNT: String(summary.likedCount || 0),
        LAST_RUN_WARNINGS: String((summary.warnings || []).length)
      });
      // Render once after the complete run instead of re-rendering Jobs after
      // every individual job result.
      refreshRunViews();
    },

    refreshJobsStatus: function () { if (ns.SheetViews) { ns.SheetViews.refreshJobsStatus(); } },
    refreshDashboard: function () { if (ns.SheetViews) { ns.SheetViews.refreshDashboard(); } },
    refreshSchedule: function () { if (ns.SheetViews) { ns.SheetViews.refreshSchedule(); } },
    refreshAllViews: refreshViews,

    _ensureJobsSheet: ensureJobsSheet,
    _ensureActivitySheet: ensureActivitySheet,
    _jobColumns: JOB_COL,
    _normalizeBoolean: normalizeBoolean,
    _healthLabel: healthLabel,
    _behaviorLabel: behaviorLabel,
    _frequencyLabel: frequencyLabel,
    _formatTimestamp: formatTimestamp,
    _nextEligibleLabel: nextEligibleLabel,
    _parseJobRows: parseJobRows,
    _normalizeJob: normalizeJob,
    _legacyJobToStoredRow: legacyJobToStoredRow,
    _repairCurrentJobRows: repairCurrentJobRows,
    _parseFrequency: parseFrequency,
    _parseBehaviorLabel: parseBehaviorLabel
  };
})(SpotiSync);
