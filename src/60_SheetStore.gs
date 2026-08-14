var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var JOB_HEADERS = [
    'Enabled',
    'Name',
    'Source',
    'Source Playlist',
    'Target Playlist',
    'Strategy',
    'Interval Days',
    'Last Attempt',
    'Last Success',
    'Last Status',
    'Last Added',
    'Last Removed',
    'Last Error'
  ];

  var HISTORY_HEADERS = [
    'Timestamp',
    'Job',
    'Strategy',
    'Added',
    'Removed',
    'Ignored',
    'Status',
    'Duration Ms',
    'Error'
  ];

  function spreadsheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('Spoti Sync must run from its bound Google Sheet.');
    }
    return ss;
  }

  function getOrCreateSheet(name) {
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      return sheet;
    }

    if (name === ns.Constants.SHEETS.DASHBOARD && ss.getSheets().length === 1) {
      var onlySheet = ss.getSheets()[0];
      if (onlySheet.getLastRow() === 0 || (onlySheet.getLastRow() === 1 && onlySheet.getLastColumn() === 1 && !onlySheet.getRange(1, 1).getValue())) {
        onlySheet.setName(name);
        return onlySheet;
      }
    }

    return ss.insertSheet(name);
  }

  function styleHeader(range) {
    range
      .setFontWeight('bold')
      .setBackground('#202124')
      .setFontColor('#ffffff');
  }

  function ensureJobsSheet() {
    var sheet = getOrCreateSheet(ns.Constants.SHEETS.JOBS);
    var headerRange = sheet.getRange(1, 1, 1, JOB_HEADERS.length);
    var current = headerRange.getValues()[0];
    var needsHeader = JOB_HEADERS.some(function (header, index) {
      return current[index] !== header;
    });

    if (needsHeader) {
      headerRange.setValues([JOB_HEADERS]);
    }

    styleHeader(headerRange);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, JOB_HEADERS.length, 120);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(4, 210);
    sheet.setColumnWidth(5, 210);
    sheet.setColumnWidth(13, 320);

    var maxRows = Math.max(sheet.getMaxRows() - 1, 1);
    var checkboxValidation = SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, 1, maxRows, 1).setDataValidation(checkboxValidation);

    var sourceValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList([
        ns.Constants.SOURCE_TYPES.LIKED_SONGS,
        ns.Constants.SOURCE_TYPES.PLAYLIST
      ], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, 3, maxRows, 1).setDataValidation(sourceValidation);

    var strategyValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList([
        ns.Constants.STRATEGIES.MIRROR,
        ns.Constants.STRATEGIES.APPEND
      ], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, 6, maxRows, 1).setDataValidation(strategyValidation);

    return sheet;
  }

  function ensureHistorySheet() {
    var sheet = getOrCreateSheet(ns.Constants.SHEETS.HISTORY);
    var headerRange = sheet.getRange(1, 1, 1, HISTORY_HEADERS.length);
    var current = headerRange.getValues()[0];
    var needsHeader = HISTORY_HEADERS.some(function (header, index) {
      return current[index] !== header;
    });

    if (needsHeader) {
      headerRange.setValues([HISTORY_HEADERS]);
    }
    styleHeader(headerRange);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HISTORY_HEADERS.length, 120);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(9, 360);
    return sheet;
  }

  function ensureDashboardSheet() {
    var sheet = getOrCreateSheet(ns.Constants.SHEETS.DASHBOARD);
    sheet.clearFormats();
    sheet.getRange('A1:B1').merge();
    sheet.getRange('A1').setValue('Spoti Sync').setFontSize(20).setFontWeight('bold');
    sheet.getRange('A3:A10').setFontWeight('bold');
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 360);
    return sheet;
  }

  function normalizeBoolean(value) {
    if (value === true) {
      return true;
    }
    return String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes' || String(value) === '1';
  }

  function normalizeJob(row, rowNumber) {
    var enabled = normalizeBoolean(row[0]);
    var sourceType = ns.Core.trim(row[2]).toUpperCase();
    var strategy = ns.Core.trim(row[5]).toUpperCase();
    var intervalDays = Number(row[6]);
    var targetPlaylist = ns.Core.trim(row[4]);
    var sourcePlaylist = ns.Core.trim(row[3]);

    if (!row.some(function (value) { return value !== '' && value !== null; }) || !enabled) {
      return null;
    }

    if ([ns.Constants.SOURCE_TYPES.LIKED_SONGS, ns.Constants.SOURCE_TYPES.PLAYLIST].indexOf(sourceType) === -1) {
      throw new Error('Jobs row ' + rowNumber + ': Source must be LIKED_SONGS or PLAYLIST.');
    }
    if ([ns.Constants.STRATEGIES.MIRROR, ns.Constants.STRATEGIES.APPEND].indexOf(strategy) === -1) {
      throw new Error('Jobs row ' + rowNumber + ': Strategy must be MIRROR or APPEND.');
    }
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) {
      throw new Error('Jobs row ' + rowNumber + ': Interval Days must be a whole number from 1 to 3650.');
    }
    if (sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
      sourcePlaylist = ns.Core.parsePlaylistId(sourcePlaylist);
    }
    targetPlaylist = ns.Core.parsePlaylistId(targetPlaylist);

    return {
      rowNumber: rowNumber,
      enabled: true,
      name: ns.Core.trim(row[1]) || ('Job ' + rowNumber),
      sourceType: sourceType,
      sourcePlaylist: sourcePlaylist,
      targetPlaylist: targetPlaylist,
      strategy: strategy,
      intervalDays: intervalDays,
      lastAttempt: row[7] || null,
      lastSuccess: row[8] || null,
      lastStatus: ns.Core.trim(row[9]),
      lastAdded: Number(row[10] || 0),
      lastRemoved: Number(row[11] || 0),
      lastError: ns.Core.trim(row[12])
    };
  }

  function parseJobRows(rows, startingRowNumber) {
    var result = { jobs: [], errors: [] };
    var firstRow = Number(startingRowNumber || 2);

    rows.forEach(function (row, index) {
      var rowNumber = firstRow + index;
      try {
        var job = normalizeJob(row, rowNumber);
        if (job) {
          result.jobs.push(job);
        }
      } catch (error) {
        result.errors.push({
          rowNumber: rowNumber,
          name: ns.Core.trim(row[1]) || ('Job row ' + rowNumber),
          strategy: ns.Core.trim(row[5]).toUpperCase(),
          error: ns.Core.safeErrorMessage(error)
        });
      }
    });

    return result;
  }

  ns.SheetStore = {
    jobHeaders: JOB_HEADERS.slice(),

    initialize: function () {
      ensureDashboardSheet();
      ensureJobsSheet();
      ensureHistorySheet();
      ns.SheetStore.refreshDashboard();
    },

    getJobReadResult: function () {
      var sheet = ensureJobsSheet();
      var lastRow = sheet.getLastRow();
      var result = { jobs: [], errors: [] };
      if (lastRow < 2) {
        return result;
      }

      var rows = sheet.getRange(2, 1, lastRow - 1, JOB_HEADERS.length).getValues();
      return parseJobRows(rows, 2);
    },

    getJobs: function () {
      return ns.SheetStore.getJobReadResult().jobs;
    },

    addJob: function (job) {
      var sheet = ensureJobsSheet();
      var sourceType = ns.Core.trim(job.sourceType).toUpperCase();
      var strategy = ns.Core.trim(job.strategy).toUpperCase();
      var intervalDays = Number(job.intervalDays);
      var sourcePlaylist = sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST
        ? ns.Core.parsePlaylistId(job.sourcePlaylist)
        : '';
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

      sheet.appendRow([
        job.enabled !== false,
        ns.Core.trim(job.name) || 'Spotify Sync',
        sourceType,
        sourcePlaylist,
        targetPlaylist,
        strategy,
        intervalDays,
        '', '', '', 0, 0, ''
      ]);
    },

    isJobDue: function (job, now) {
      return ns.Core.isDueByCalendarDay(
        job.lastSuccess,
        job.intervalDays,
        now,
        spreadsheet().getSpreadsheetTimeZone()
      );
    },

    updateJobSuccess: function (job, summary) {
      var sheet = ensureJobsSheet();
      var now = new Date();
      sheet.getRange(job.rowNumber, 8, 1, 6).setValues([[
        now,
        now,
        'Success',
        summary.added,
        summary.removed,
        ''
      ]]);
    },

    updateJobError: function (job, error) {
      var sheet = ensureJobsSheet();
      sheet.getRange(job.rowNumber, 8).setValue(new Date());
      sheet.getRange(job.rowNumber, 10).setValue('Error');
      sheet.getRange(job.rowNumber, 13).setValue(ns.Core.safeErrorMessage(error));
    },

    updateConfigurationError: function (configError) {
      var sheet = ensureJobsSheet();
      sheet.getRange(configError.rowNumber, 8).setValue(new Date());
      sheet.getRange(configError.rowNumber, 10).setValue('Configuration error');
      sheet.getRange(configError.rowNumber, 13).setValue(configError.error);
    },

    appendHistory: function (entry) {
      var sheet = ensureHistorySheet();
      sheet.appendRow([
        entry.timestamp || new Date(),
        entry.job || '',
        entry.strategy || '',
        Number(entry.added || 0),
        Number(entry.removed || 0),
        Number(entry.ignored || 0),
        entry.status || '',
        Number(entry.durationMs || 0),
        entry.error || ''
      ]);

      var dataRows = sheet.getLastRow() - 1;
      if (dataRows > ns.Constants.MAX_HISTORY_ROWS) {
        sheet.deleteRows(2, dataRows - ns.Constants.MAX_HISTORY_ROWS);
      }
    },

    setRunSummary: function (summary) {
      ns.Storage.setDocumentStatus({
        LAST_RUN_AT: summary.finishedAt || ns.Core.nowIso(),
        LAST_RUN_STATUS: summary.status || '',
        LAST_RUN_ADDED: String(summary.added || 0),
        LAST_RUN_REMOVED: String(summary.removed || 0),
        LAST_LIKED_COUNT: String(summary.likedCount || 0)
      });
      ns.SheetStore.refreshDashboard();
    },

    refreshDashboard: function () {
      var sheet = ensureDashboardSheet();
      var status = ns.Storage.getDocumentStatus();
      var connected = ns.Auth && ns.Auth.isConnected ? ns.Auth.isConnected() : false;
      var schedulerEnabled = ns.Scheduler && ns.Scheduler.isEnabled ? ns.Scheduler.isEnabled() : false;
      var rows = [
        ['Spotify', connected ? 'Connected' : 'Not connected'],
        ['Scheduler', schedulerEnabled ? 'Enabled (daily)' : 'Disabled'],
        ['Version', ns.VERSION],
        ['Last run', status.LAST_RUN_AT || 'Never'],
        ['Last status', status.LAST_RUN_STATUS || '—'],
        ['Last added', Number(status.LAST_RUN_ADDED || 0)],
        ['Last removed', Number(status.LAST_RUN_REMOVED || 0)],
        ['Last Liked Songs count', Number(status.LAST_LIKED_COUNT || 0)]
      ];
      sheet.getRange(3, 1, rows.length, 2).setValues(rows);
      sheet.getRange('A12').setValue('Use the Spoti Sync menu to configure Spotify, add jobs, preview changes, sync now, or enable the scheduler.');
      sheet.getRange('A12:B13').merge();
      sheet.getRange('A12').setWrap(true);
    },

    _normalizeJob: normalizeJob,
    _parseJobRows: parseJobRows
  };
})(SpotiSync);
