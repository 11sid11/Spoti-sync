var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var JOB_HEADERS = [
    'Enabled', 'Name', 'Source', 'Target', 'Behavior', 'Frequency', 'Health', 'Next Eligible',
    'Job ID', 'Source Playlist ID', 'Target Playlist ID', 'Last Attempt', 'Last Success',
    'Last Status', 'Last Added', 'Last Removed', 'Last Error / Warning', 'Heartbeat Enabled'
  ];

  // v1.3.8 storage schema. v1.4 appends one job-owned configuration field
  // without changing any existing column positions or stable IDs.
  var V138_JOB_HEADERS = [
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
    LAST_REMOVED: 16, LAST_ERROR: 17, HEARTBEAT_ENABLED: 18
  });

  var FREQUENCY_PRESET_DAYS = Object.freeze([1, 2, 3, 7, 10, 14, 30, 60, 90]);
  var FREQUENCY_LIMITS = Object.freeze({ MIN: 1, MAX: 3650 });
  var BEHAVIOR_STRATEGIES = Object.freeze([
    ns.Constants.STRATEGIES.MIRROR,
    ns.Constants.STRATEGIES.APPEND
  ]);

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

  function isBlankValue(value) {
    return value === '' || value === null || value === undefined;
  }

  function isBlankRow(row) {
    return !row.some(function (value) {
      return !isBlankValue(value);
    });
  }

  function normalizeBoolean(value) {
    if (value === true) {
      return true;
    }
    return String(value).toLowerCase() === 'true' ||
      String(value).toLowerCase() === 'yes' || String(value) === '1';
  }

  function heartbeatEnabledValue(value) {
    return isBlankValue(value) ? true : normalizeBoolean(value);
  }

  function createJobId() {
    return 'job_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  }

  // Migration-only: preserve unknown legacy values instead of destroying them.
  function recoverLegacyPlaylistId(value) {
    try {
      return ns.Core.parsePlaylistId(value);
    } catch (ignored) {
      return ns.Core.trim(value);
    }
  }

  function legacySourceLabel(sourceType) {
    return sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST ? 'Playlist' : 'Liked Songs';
  }

  function parseLegacySourceLabel(value) {
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

  function behaviorOptions() {
    return BEHAVIOR_STRATEGIES.map(behaviorLabel);
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

  function frequencyPresets() {
    return FREQUENCY_PRESET_DAYS.map(frequencyLabel);
  }

  function frequencyLimits() {
    return { min: FREQUENCY_LIMITS.MIN, max: FREQUENCY_LIMITS.MAX };
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
    if (!Number.isInteger(days) || days < FREQUENCY_LIMITS.MIN || days > FREQUENCY_LIMITS.MAX) {
      throw new Error(
        'Frequency must be Daily or Every N days, from ' + FREQUENCY_LIMITS.MIN +
        ' to ' + FREQUENCY_LIMITS.MAX + ' days.'
      );
    }
    return days;
  }

  function automationLabel(job) {
    if (!job.enabled) {
      return 'Off';
    }
    return frequencyLabel(job.intervalDays);
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
    if (status.indexOf('error') !== -1 || status.indexOf('failure') !== -1) {
      return '✕ Needs attention';
    }
    if (status.indexOf('warning') !== -1) { return '⚠ Warning'; }
    if (!job.enabled) { return '○ Manual only'; }
    if (!job.lastSuccess) { return '● Ready'; }
    return '✓ Healthy';
  }

  function formatTimestamp(value, pattern) {
    if (!value) { return 'Never'; }
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) { return String(value); }
    return Utilities.formatDate(date, timezone(), pattern || 'EEE, MMM d · h:mm a');
  }

  function isConfiguredJobRow(row) {
    var hasIdentity = ns.Core.trim(row[JOB_COL.ID - 1]) ||
      ns.Core.trim(row[JOB_COL.NAME - 1]) ||
      ns.Core.trim(row[JOB_COL.SOURCE_PLAYLIST_ID - 1]) ||
      ns.Core.trim(row[JOB_COL.TARGET_PLAYLIST_ID - 1]);
    var hasSchedule = ns.Core.trim(row[JOB_COL.BEHAVIOR - 1]) &&
      ns.Core.trim(row[JOB_COL.FREQUENCY - 1]);
    return Boolean(hasIdentity || hasSchedule);
  }

  function hasLegacyJobDefinition(row) {
    return row.slice(1, 7).some(function (value) {
      return !isBlankValue(value);
    });
  }

  function legacyJobToStoredRow(row) {
    var sourceType = parseLegacySourceLabel(row[2]);
    var strategy = parseBehaviorLabel(row[5]);
    var intervalDays = Number(row[6]);
    return [
      normalizeBoolean(row[0]),
      ns.Core.trim(row[1]) || 'Spotify Sync',
      legacySourceLabel(sourceType),
      ns.Core.trim(row[4]) || 'Spotify playlist',
      behaviorLabel(strategy),
      Number.isInteger(intervalDays) && intervalDays > 0 ? frequencyLabel(intervalDays) : ns.Core.trim(row[6]),
      '', '', createJobId(),
      sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST ? recoverLegacyPlaylistId(row[3]) : '',
      recoverLegacyPlaylistId(row[4]),
      row[7] || '', row[8] || '', ns.Core.trim(row[9]), Number(row[10] || 0),
      Number(row[11] || 0), ns.Core.trim(row[12]), true
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

  function looksLikePartialLegacyJob(row) {
    var strategy = ns.Core.trim(row[5]).toUpperCase();
    var intervalDays = Number(row[6]);

    if ([ns.Constants.STRATEGIES.MIRROR, ns.Constants.STRATEGIES.APPEND].indexOf(strategy) === -1) {
      return false;
    }
    if (!Number.isInteger(intervalDays) || intervalDays < FREQUENCY_LIMITS.MIN || intervalDays > FREQUENCY_LIMITS.MAX) {
      return false;
    }

    try {
      parseLegacySourceLabel(row[2]);
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
      while (current.length < JOB_HEADERS.length) {
        current.push('');
      }

      // Recover the specific partially migrated v1.2 row shape. This repair is
      // invoked only by Initialize / Repair, never by a normal sync.
      if (looksLikePartialLegacyJob(current)) {
        repaired.push(legacyJobToStoredRow(current.slice(0, LEGACY_JOB_HEADERS.length)));
        changed = true;
        return;
      }

      // Presentation-only Source/Target text and checkbox FALSE values never
      // define a job. Stable IDs/name or a complete Behavior/Frequency pair do.
      if (!isConfiguredJobRow(current)) {
        return;
      }

      if (!ns.Core.trim(current[JOB_COL.ID - 1])) {
        current[JOB_COL.ID - 1] = createJobId();
        changed = true;
      }
      if (isBlankValue(current[JOB_COL.HEARTBEAT_ENABLED - 1])) {
        current[JOB_COL.HEARTBEAT_ENABLED - 1] = true;
        changed = true;
      }
      repaired.push(current);
    });

    return { rows: repaired, changed: changed };
  }

  function replaceSheetData(sheet, headers, rows, legacyWidth) {
    var values = [headers].concat(rows || []);
    var usedRows = Math.max(sheet.getLastRow(), values.length, 1);
    var managedColumns = Math.max(headers.length, Number(legacyWidth || 0));

    // Migration work is bounded to the rows/columns owned by Spoti Sync.
    sheet.getRange(1, 1, usedRows, managedColumns).clearDataValidations();

    // Write before clearing trailing legacy content so a failed write leaves
    // the previous configuration intact.
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);

    if (usedRows > values.length) {
      sheet.getRange(values.length + 1, 1, usedRows - values.length, managedColumns).clearContent();
    }
    if (managedColumns > headers.length) {
      sheet.getRange(1, headers.length + 1, values.length, managedColumns - headers.length).clearContent();
    }
  }

  function ensureJobsSheet(options) {
    var settings = options || {};
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(ns.Constants.SHEETS.JOBS) || ss.insertSheet(ns.Constants.SHEETS.JOBS);
    var lastRow = sheet.getLastRow();
    var width = Math.max(sheet.getLastColumn(), JOB_HEADERS.length, V138_JOB_HEADERS.length, LEGACY_JOB_HEADERS.length);
    var header = sheet.getRange(1, 1, 1, width).getValues()[0];
    var isEmpty = lastRow === 0 || (lastRow === 1 && isBlankRow(header));
    var migratedRows = [];
    var repairResult;

    if (isEmpty) {
      replaceSheetData(sheet, JOB_HEADERS, [], JOB_HEADERS.length);
    } else if (headersMatch(header, LEGACY_JOB_HEADERS)) {
      if (!settings.repair) {
        throw new Error('The Jobs sheet needs migration. Open Spoti Sync and use Settings → Repair data once.');
      }
      if (lastRow > 1) {
        migratedRows = sheet.getRange(2, 1, lastRow - 1, LEGACY_JOB_HEADERS.length).getValues()
          .filter(hasLegacyJobDefinition)
          .map(legacyJobToStoredRow);
      }
      replaceSheetData(sheet, JOB_HEADERS, migratedRows, LEGACY_JOB_HEADERS.length);
    } else if (headersMatch(header, V138_JOB_HEADERS) && !headersMatch(header, JOB_HEADERS)) {
      if (!settings.repair) {
        throw new Error('This installation needs the Spoti Sync 1.4 data upgrade. Open Spoti Sync once.');
      }
      if (lastRow > 1) {
        repairResult = repairCurrentJobRows(
          sheet.getRange(2, 1, lastRow - 1, V138_JOB_HEADERS.length).getValues()
        );
        migratedRows = repairResult.rows;
      }
      replaceSheetData(sheet, JOB_HEADERS, migratedRows, V138_JOB_HEADERS.length);
    } else if (headersMatch(header, JOB_HEADERS)) {
      if (settings.repair && lastRow > 1) {
        repairResult = repairCurrentJobRows(
          sheet.getRange(2, 1, lastRow - 1, JOB_HEADERS.length).getValues()
        );
        if (repairResult.changed || repairResult.rows.length !== lastRow - 1) {
          replaceSheetData(sheet, JOB_HEADERS, repairResult.rows, JOB_HEADERS.length);
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
      replaceSheetData(sheet, ACTIVITY_HEADERS, [], LEGACY_HISTORY_HEADERS.length);
    } else if (headersMatch(header, LEGACY_HISTORY_HEADERS)) {
      if (lastRow > 1) {
        migratedRows = sheet.getRange(2, 1, lastRow - 1, LEGACY_HISTORY_HEADERS.length).getValues()
          .filter(function (row) { return !isBlankRow(row); })
          .map(legacyActivityToRow);
      }
      replaceSheetData(sheet, ACTIVITY_HEADERS, migratedRows, LEGACY_HISTORY_HEADERS.length);
    } else if (!headersMatch(header, ACTIVITY_HEADERS)) {
      throw new Error('The Activity sheet layout is not recognized. Spoti Sync left it unchanged.');
    }
    return sheet;
  }

  function normalizeJob(row, rowNumber) {
    if (!isConfiguredJobRow(row)) { return null; }

    var sourcePlaylist = ns.Core.trim(row[JOB_COL.SOURCE_PLAYLIST_ID - 1]);
    var targetPlaylist = ns.Core.trim(row[JOB_COL.TARGET_PLAYLIST_ID - 1]);
    var sourceType = sourcePlaylist
      ? ns.Constants.SOURCE_TYPES.PLAYLIST
      : ns.Constants.SOURCE_TYPES.LIKED_SONGS;
    var strategy = parseBehaviorLabel(row[JOB_COL.BEHAVIOR - 1]);
    var intervalDays = parseFrequency(row[JOB_COL.FREQUENCY - 1]);
    var sourceLabel = ns.Core.trim(row[JOB_COL.SOURCE - 1]);
    var targetLabel = ns.Core.trim(row[JOB_COL.TARGET - 1]);

    if (sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
      sourcePlaylist = ns.Core.parsePlaylistId(sourcePlaylist);
    } else {
      sourcePlaylist = '';
      sourceLabel = sourceLabel || 'Liked Songs';
    }
    targetPlaylist = ns.Core.parsePlaylistId(targetPlaylist);

    return {
      rowNumber: rowNumber,
      enabled: normalizeBoolean(row[JOB_COL.ENABLED - 1]),
      name: ns.Core.trim(row[JOB_COL.NAME - 1]) || ('Job ' + rowNumber),
      jobId: ns.Core.trim(row[JOB_COL.ID - 1]) || ('row_' + rowNumber),
      sourceType: sourceType,
      sourcePlaylist: sourcePlaylist,
      sourceLabel: sourceLabel || (sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST ? 'Spotify playlist' : 'Liked Songs'),
      targetPlaylist: targetPlaylist,
      targetLabel: targetLabel || 'Spotify playlist',
      strategy: strategy,
      intervalDays: intervalDays,
      heartbeatEnabled: heartbeatEnabledValue(row[JOB_COL.HEARTBEAT_ENABLED - 1]),
      lastAttempt: row[JOB_COL.LAST_ATTEMPT - 1] || null,
      lastSuccess: row[JOB_COL.LAST_SUCCESS - 1] || null,
      lastStatus: ns.Core.trim(row[JOB_COL.LAST_STATUS - 1]),
      lastAdded: Number(row[JOB_COL.LAST_ADDED - 1] || 0),
      lastRemoved: Number(row[JOB_COL.LAST_REMOVED - 1] || 0),
      lastError: ns.Core.trim(row[JOB_COL.LAST_ERROR - 1])
    };
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
        if (isConfiguredJobRow(row)) {
          result.errors.push({
            rowNumber: rowNumber,
            jobId: ns.Core.trim(row[JOB_COL.ID - 1]),
            name: ns.Core.trim(row[JOB_COL.NAME - 1]) || ('Job row ' + rowNumber),
            enabled: normalizeBoolean(row[JOB_COL.ENABLED - 1]),
            strategy: ns.Core.trim(row[JOB_COL.BEHAVIOR - 1]),
            error: ns.Core.safeErrorMessage(error)
          });
        }
      }
    });
    return result;
  }

  function findRowByJobId(jobId) {
    var sheet = ensureJobsSheet();
    var id = ns.Core.trim(jobId);
    var lastRow = sheet.getLastRow();
    var values;
    var index;

    if (!id || lastRow < 2) { return 0; }
    values = sheet.getRange(2, JOB_COL.ID, lastRow - 1, 1).getValues();
    for (index = 0; index < values.length; index += 1) {
      if (ns.Core.trim(values[index][0]) === id) {
        return index + 2;
      }
    }
    return 0;
  }

  function getJobById(jobId) {
    var id = ns.Core.trim(jobId);
    var read = ns.SheetStore.getJobReadResult();
    var job = read.jobs.filter(function (item) { return item.jobId === id; })[0];
    var configError;
    if (job) { return job; }
    configError = read.errors.filter(function (item) { return item.jobId === id; })[0];
    if (configError) {
      throw new Error(configError.error);
    }
    throw new Error('Spoti Sync job not found.');
  }

  function upsertJob(config) {
    var data = config || {};
    var sheet = ensureJobsSheet();
    var jobId = ns.Core.trim(data.jobId) || createJobId();
    var rowNumber = data.jobId ? findRowByJobId(jobId) : 0;
    var sourceType = ns.Core.trim(data.sourceType).toUpperCase();
    var sourcePlaylistId = '';
    var targetPlaylistId;
    var strategy;
    var intervalDays;
    var name;
    var sourceLabel;
    var targetLabel;
    var row;

    ns.Core.assert(
      [ns.Constants.SOURCE_TYPES.LIKED_SONGS, ns.Constants.SOURCE_TYPES.PLAYLIST].indexOf(sourceType) !== -1,
      'Choose Liked Songs or a Spotify playlist as the source.'
    );

    strategy = BEHAVIOR_STRATEGIES.indexOf(data.strategy) !== -1
      ? data.strategy
      : parseBehaviorLabel(data.behavior);
    intervalDays = parseFrequency(data.intervalDays);
    targetPlaylistId = ns.Core.parsePlaylistId(data.targetPlaylistId);

    if (sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
      sourcePlaylistId = ns.Core.parsePlaylistId(data.sourcePlaylistId);
    }

    sourceLabel = ns.Core.trim(data.sourceLabel) ||
      (sourceType === ns.Constants.SOURCE_TYPES.LIKED_SONGS ? 'Liked Songs' : 'Spotify playlist');
    targetLabel = ns.Core.trim(data.targetLabel) || 'Spotify playlist';
    name = ns.Core.trim(data.name) || (sourceLabel + ' → ' + targetLabel);

    if (rowNumber) {
      row = sheet.getRange(rowNumber, 1, 1, JOB_HEADERS.length).getValues()[0];
    } else {
      rowNumber = Math.max(sheet.getLastRow() + 1, 2);
      row = new Array(JOB_HEADERS.length).fill('');
      row[JOB_COL.ID - 1] = jobId;
      row[JOB_COL.LAST_ADDED - 1] = 0;
      row[JOB_COL.LAST_REMOVED - 1] = 0;
    }

    row[JOB_COL.ENABLED - 1] = data.enabled === true;
    row[JOB_COL.NAME - 1] = name;
    row[JOB_COL.SOURCE - 1] = sourceLabel;
    row[JOB_COL.TARGET - 1] = targetLabel;
    row[JOB_COL.BEHAVIOR - 1] = behaviorLabel(strategy);
    row[JOB_COL.FREQUENCY - 1] = frequencyLabel(intervalDays);
    row[JOB_COL.ID - 1] = jobId;
    row[JOB_COL.SOURCE_PLAYLIST_ID - 1] = sourcePlaylistId;
    row[JOB_COL.TARGET_PLAYLIST_ID - 1] = targetPlaylistId;
    row[JOB_COL.HEARTBEAT_ENABLED - 1] = data.heartbeatEnabled !== false;

    sheet.getRange(rowNumber, 1, 1, JOB_HEADERS.length).setValues([row]);
    return normalizeJob(row, rowNumber);
  }

  function deleteJob(jobId) {
    var sheet = ensureJobsSheet();
    var rowNumber = findRowByJobId(jobId);
    ns.Core.assert(rowNumber, 'Spoti Sync job not found.');
    sheet.deleteRow(rowNumber);
    return true;
  }

  function refreshSummary() {
    if (ns.SheetViews && ns.SheetViews.refreshSummary) {
      ns.SheetViews.refreshSummary();
    }
  }

  ns.SheetStore = {
    jobHeaders: JOB_HEADERS.slice(),
    activityHeaders: ACTIVITY_HEADERS.slice(),
    createJobId: createJobId,
    isConfiguredJobRow: isConfiguredJobRow,
    behaviorOptions: behaviorOptions,
    frequencyPresets: frequencyPresets,
    frequencyLimits: frequencyLimits,

    initialize: function (options) {
      var settings = options || {};
      ensureJobsSheet({ repair: true });
      ensureActivitySheet();
      if (settings.render !== false && ns.SheetViews && ns.SheetViews.initializeWorkbook) {
        ns.SheetViews.initializeWorkbook();
      }
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

    getJobById: getJobById,
    upsertJob: upsertJob,
    deleteJob: deleteJob,

    isJobDue: function (job, now) {
      return ns.Core.isDueByCalendarDay(job.lastSuccess, job.intervalDays, now, timezone());
    },

    getSpreadsheetTimezone: timezone,
    getNextEligibleLabel: function (job, now) { return nextEligibleLabel(job, now || new Date()); },
    getAutomationLabel: automationLabel,

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
    },

    refreshSummary: refreshSummary,
    refreshAllViews: function () {
      if (ns.SheetViews && ns.SheetViews.refreshAll) {
        ns.SheetViews.refreshAll();
      }
    },

    _ensureJobsSheet: ensureJobsSheet,
    _ensureActivitySheet: ensureActivitySheet,
    _jobColumns: JOB_COL,
    _normalizeBoolean: normalizeBoolean,
    _heartbeatEnabledValue: heartbeatEnabledValue,
    _healthLabel: healthLabel,
    _behaviorLabel: behaviorLabel,
    _frequencyLabel: frequencyLabel,
    _formatTimestamp: formatTimestamp,
    _nextEligibleLabel: nextEligibleLabel,
    _parseJobRows: parseJobRows,
    _normalizeJob: normalizeJob,
    _legacyJobToStoredRow: legacyJobToStoredRow,
    _repairCurrentJobRows: repairCurrentJobRows,
    _replaceSheetData: replaceSheetData,
    _findRowByJobId: findRowByJobId,
    _parseFrequency: parseFrequency,
    _parseBehaviorLabel: parseBehaviorLabel,
    _v138JobHeaders: V138_JOB_HEADERS.slice()
  };
})(SpotiSync);
