var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var COLORS = Object.freeze({
    DARK: '#121212', GREEN: '#1DB954', LIGHT: '#f8f9fa', MUTED: '#5f6368',
    SUCCESS: '#137333', WARNING: '#b06000', ERROR: '#b3261e'
  });

  function spreadsheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) { throw new Error('Spoti Sync must run from its bound Google Sheet.'); }
    return ss;
  }

  function isEmptySheet(sheet) {
    return sheet && sheet.getLastRow() === 0 && sheet.getLastColumn() === 1 &&
      !sheet.getRange(1, 1).getValue();
  }

  function isManagedSummarySheet(sheet) {
    if (!sheet) { return false; }
    if (isEmptySheet(sheet)) { return true; }
    return ns.Core.trim(sheet.getRange(1, 1).getValue()) === 'Spoti Sync';
  }

  function nextAvailableStatusName(ss) {
    var base = 'Spoti Sync Status';
    var name = base;
    var suffix = 2;
    while (ss.getSheetByName(name)) {
      name = base + ' ' + suffix;
      suffix += 1;
    }
    return name;
  }

  function ensureSummarySheet() {
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(ns.Constants.SHEETS.SUMMARY);
    var legacy = ss.getSheetByName(ns.Constants.SHEETS.DASHBOARD);
    var candidate;
    var reserved;

    if (sheet && isManagedSummarySheet(sheet)) { return sheet; }

    // Never clear an unrelated user sheet that happened to already be named
    // "Spoti Sync". In that rare conflict, keep it intact and render status in
    // the legacy Dashboard or a uniquely named fallback sheet.
    if (legacy) {
      if (!sheet) {
        legacy.setName(ns.Constants.SHEETS.SUMMARY);
      }
      return legacy;
    }

    if (sheet) {
      return ss.insertSheet(nextAvailableStatusName(ss));
    }

    candidate = ss.getActiveSheet();
    reserved = [
      ns.Constants.SHEETS.SUMMARY,
      ns.Constants.SHEETS.DASHBOARD,
      ns.Constants.SHEETS.JOBS,
      ns.Constants.SHEETS.SCHEDULE,
      ns.Constants.SHEETS.ACTIVITY
    ];
    if (candidate && reserved.indexOf(candidate.getName()) === -1 && isEmptySheet(candidate)) {
      candidate.setName(ns.Constants.SHEETS.SUMMARY);
      return candidate;
    }

    return ss.insertSheet(ns.Constants.SHEETS.SUMMARY);
  }

  function styleTableHeader(range) {
    range.setFontWeight('bold').setBackground(COLORS.DARK).setFontColor('#ffffff')
      .setVerticalAlignment('middle');
  }

  function styleTitle(sheet, a1, title) {
    var range = sheet.getRange(a1);
    range.breakApart();
    range.merge().setValue(title).setBackground(COLORS.DARK).setFontColor('#ffffff')
      .setFontWeight('bold').setFontSize(18).setVerticalAlignment('middle');
  }

  function styleActivitySheet(sheet) {
    var width = ns.SheetStore.activityHeaders.length;
    sheet.showSheet();
    sheet.setHiddenGridlines(true);
    sheet.setFrozenRows(1);
    sheet.setTabColor('#4285f4');
    styleTableHeader(sheet.getRange(1, 1, 1, width));
    sheet.setColumnWidth(1, 175); sheet.setColumnWidth(2, 200); sheet.setColumnWidth(3, 170);
    sheet.setColumnWidth(4, 75); sheet.setColumnWidth(5, 75); sheet.setColumnWidth(6, 95);
    sheet.setColumnWidth(7, 380); sheet.hideColumns(8);
    if (sheet.getMaxRows() > 1) {
      sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('ddd, mmm d · h:mm AM/PM');
      sheet.getRange(2, 6, sheet.getMaxRows() - 1, 1).setNumberFormat('0 "ms"');
    }
  }

  function sourceSummary(job) {
    if (job.sourceType === ns.Constants.SOURCE_TYPES.LIKED_SONGS) {
      return 'Liked Songs';
    }
    return ns.Core.trim(job.sourceLabel) || 'Spotify playlist';
  }

  function targetSummary(job) {
    return ns.Core.trim(job.targetLabel) || 'Spotify playlist';
  }

  function lastSyncLabel(job) {
    return job.lastSuccess ? ns.SheetStore._formatTimestamp(job.lastSuccess, 'MMM d · h:mm a') : 'Never';
  }

  function jobStatusLabel(job) {
    return ns.SheetStore._healthLabel(job);
  }

  function refreshSummary() {
    var sheet = ensureSummarySheet();
    var status = ns.Storage.getDocumentStatus();
    var connected = ns.Auth && ns.Auth.isConnected ? ns.Auth.isConnected() : false;
    var scheduler = ns.Scheduler && ns.Scheduler.getStatus ? ns.Scheduler.getStatus() : { enabled: false };
    var read = ns.SheetStore.getJobReadResult();
    var automated = read.jobs.filter(function (job) { return job.enabled; });
    var rows = read.jobs.map(function (job) {
      return [
        job.name,
        sourceSummary(job),
        targetSummary(job),
        ns.SheetStore._behaviorLabel(job.strategy),
        ns.SheetStore.getAutomationLabel(job),
        lastSyncLabel(job),
        jobStatusLabel(job)
      ];
    });
    var errorRows = read.errors.map(function (error) {
      return [
        error.name, '—', '—', '—', error.enabled ? 'Needs attention' : 'Off',
        'Never', '✕ Configuration'
      ];
    });
    var allRows = rows.concat(errorRows);
    var schedulerLabel = automated.length
      ? (scheduler.enabled ? '● Running · ' + automated.length + ' job' + (automated.length === 1 ? '' : 's') : '⚠ Needs attention')
      : '○ No automated jobs';

    sheet.showSheet();
    sheet.getRange('A1:G200').breakApart();
    sheet.clear();
    sheet.setHiddenGridlines(true);
    sheet.setTabColor(COLORS.GREEN);

    styleTitle(sheet, 'A1:G1', 'Spoti Sync');
    sheet.setRowHeight(1, 40);

    sheet.getRange('A3:G3').merge()
      .setValue('Manage Spoti Sync from Spoti Sync → Open Spoti Sync. This sheet is status-only.')
      .setFontColor(COLORS.MUTED).setWrap(true);

    sheet.getRange('A5:B5').setValues([['System', 'Status']]);
    styleTableHeader(sheet.getRange('A5:B5'));
    sheet.getRange('A6:B9').setValues([
      ['Spotify', connected ? '● Connected' : '○ Not connected'],
      ['Automation', schedulerLabel],
      ['Last sync', status.LAST_RUN_AT ? ns.SheetStore._formatTimestamp(status.LAST_RUN_AT) : 'Never'],
      ['Version', ns.VERSION]
    ]);
    sheet.getRange('A6:A9').setFontWeight('bold');
    sheet.getRange('B6').setFontColor(connected ? COLORS.SUCCESS : COLORS.ERROR);
    sheet.getRange('B7').setFontColor(
      automated.length && !scheduler.enabled ? COLORS.WARNING : (scheduler.enabled ? COLORS.SUCCESS : COLORS.MUTED)
    );

    sheet.getRange('A11:G11').setValues([[
      'Job', 'Source', 'Target', 'Behavior', 'Automation', 'Last sync', 'Status'
    ]]);
    styleTableHeader(sheet.getRange('A11:G11'));

    if (allRows.length) {
      var statusColors = allRows.map(function (row) {
        var value = String(row[6]);
        if (value.indexOf('✓') === 0) { return [COLORS.SUCCESS]; }
        if (value.indexOf('⚠') === 0) { return [COLORS.WARNING]; }
        if (value.indexOf('✕') === 0) { return [COLORS.ERROR]; }
        return [COLORS.MUTED];
      });
      sheet.getRange(12, 1, allRows.length, 7).setValues(allRows).setWrap(true);
      sheet.getRange(12, 7, statusColors.length, 1).setFontColors(statusColors);
    } else {
      sheet.getRange('A12:G12').merge()
        .setValue('No jobs yet. Open Spoti Sync and choose + Add job.')
        .setFontColor(COLORS.MUTED);
    }

    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 210);
    sheet.setColumnWidth(2, 190);
    sheet.setColumnWidth(3, 190);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 130);
    sheet.setColumnWidth(6, 150);
    sheet.setColumnWidth(7, 150);
    sheet.getRange('A1:G80').setVerticalAlignment('middle');
  }

  function hideInternalSheets() {
    var ss = spreadsheet();
    var summary = ensureSummarySheet();
    var activity = ns.SheetStore._ensureActivitySheet();
    var jobs = ss.getSheetByName(ns.Constants.SHEETS.JOBS);
    var schedule = ss.getSheetByName(ns.Constants.SHEETS.SCHEDULE);

    summary.showSheet();
    activity.showSheet();

    if (jobs && !jobs.isSheetHidden()) {
      if (ss.getActiveSheet().getSheetId() === jobs.getSheetId()) {
        ss.setActiveSheet(summary);
      }
      jobs.hideSheet();
    }

    if (schedule && !schedule.isSheetHidden()) {
      if (ss.getActiveSheet().getSheetId() === schedule.getSheetId()) {
        ss.setActiveSheet(summary);
      }
      schedule.hideSheet();
    }
  }

  function initializeWorkbook() {
    var activity = ns.SheetStore._ensureActivitySheet();
    styleActivitySheet(activity);
    refreshSummary();
    hideInternalSheets();
  }

  ns.SheetViews = {
    initializeWorkbook: initializeWorkbook,
    refreshSummary: refreshSummary,
    hideInternalSheets: hideInternalSheets,
    refreshAll: initializeWorkbook,
    _ensureSummarySheet: ensureSummarySheet
  };
})(SpotiSync);
