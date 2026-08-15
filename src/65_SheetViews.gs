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

  function getOrCreateSheet(name) {
    var ss = spreadsheet();
    var sheet = ss.getSheetByName(name);
    if (sheet) { return sheet; }
    if (name === ns.Constants.SHEETS.DASHBOARD) {
      // A brand-new spreadsheet starts with one empty tab. Jobs/Activity may
      // already have been created by the time views are rendered, so reuse
      // the still-empty active tab instead of leaving an orphaned Sheet1.
      var candidate = ss.getActiveSheet();
      var reservedNames = Object.keys(ns.Constants.SHEETS).map(function (key) {
        return ns.Constants.SHEETS[key];
      });
      if (candidate && reservedNames.indexOf(candidate.getName()) === -1 &&
          candidate.getLastRow() === 0 && candidate.getLastColumn() === 1 &&
          !candidate.getRange(1, 1).getValue()) {
        candidate.setName(name);
        return candidate;
      }
    }
    return ss.insertSheet(name);
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

  function applyPlaylistLinks(sheet) {
    var columns = ns.SheetStore._jobColumns;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { return; }
    var rows = sheet.getRange(2, 1, lastRow - 1, ns.SheetStore.jobHeaders.length).getValues();
    rows.forEach(function (row, index) {
      var sourceId = ns.Core.trim(row[columns.SOURCE_PLAYLIST_ID - 1]);
      var targetId = ns.Core.trim(row[columns.TARGET_PLAYLIST_ID - 1]);
      var rowNumber = index + 2;
      if (sourceId && /^[A-Za-z0-9]{10,64}$/.test(sourceId)) {
        sheet.getRange(rowNumber, columns.SOURCE).setRichTextValue(
          SpreadsheetApp.newRichTextValue().setText('Playlist ↗')
            .setLinkUrl('https://open.spotify.com/playlist/' + sourceId).build()
        );
      }
      if (targetId && /^[A-Za-z0-9]{10,64}$/.test(targetId)) {
        sheet.getRange(rowNumber, columns.TARGET).setRichTextValue(
          SpreadsheetApp.newRichTextValue().setText('Open playlist ↗')
            .setLinkUrl('https://open.spotify.com/playlist/' + targetId).build()
        );
      }
    });
  }

  function styleJobsSheet(sheet) {
    var columns = ns.SheetStore._jobColumns;
    var width = ns.SheetStore.jobHeaders.length;
    var maxDataRows = Math.max(sheet.getMaxRows() - 1, 1);
    var validationRows = Math.min(maxDataRows, Math.max(sheet.getLastRow() + 49, 50));
    var frequencyPresets = [
      'Daily', 'Every 2 days', 'Every 3 days', 'Every 7 days', 'Every 10 days',
      'Every 14 days', 'Every 30 days', 'Every 60 days', 'Every 90 days'
    ];
    var checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();
    var source = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Liked Songs', 'Playlist ↗'], true).setAllowInvalid(false).build();
    var behavior = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Exact Mirror', 'Append Only'], true).setAllowInvalid(false).build();
    var frequency = SpreadsheetApp.newDataValidation()
      .requireValueInList(frequencyPresets, true)
      .setAllowInvalid(true)
      .setHelpText('Choose a common schedule, or type Every N days (1–3650), for example Every 21 days.')
      .build();

    sheet.setHiddenGridlines(true);
    sheet.setFrozenRows(1);
    sheet.setTabColor(COLORS.GREEN);
    styleTableHeader(sheet.getRange(1, 1, 1, width));
    sheet.setRowHeight(1, 32);

    // Always remove legacy validation from the visible editable columns first.
    // In v1.2 column F was Strategy; in v1.3 it is Frequency. Without this,
    // partially migrated sheets can incorrectly show MIRROR / APPEND in F.
    sheet.getRange(2, 1, maxDataRows, columns.FREQUENCY).clearDataValidations();
    sheet.getRange(2, 1, validationRows, 1).setDataValidation(checkbox);
    sheet.getRange(2, columns.SOURCE, validationRows, 1).setDataValidation(source);
    sheet.getRange(2, columns.BEHAVIOR, validationRows, 1).setDataValidation(behavior);
    sheet.getRange(2, columns.FREQUENCY, validationRows, 1).setDataValidation(frequency);
    sheet.getRange(1, columns.FREQUENCY)
      .setNote('Choose a preset from the dropdown, or type Every N days (1–3650), for example Every 21 days.');

    sheet.getRange(2, columns.HEALTH, maxDataRows, 2).setBackground(COLORS.LIGHT);
    sheet.setColumnWidth(columns.ENABLED, 74);
    sheet.setColumnWidth(columns.NAME, 210);
    sheet.setColumnWidth(columns.SOURCE, 135);
    sheet.setColumnWidth(columns.TARGET, 145);
    sheet.setColumnWidth(columns.BEHAVIOR, 135);
    sheet.setColumnWidth(columns.FREQUENCY, 125);
    sheet.setColumnWidth(columns.HEALTH, 150);
    sheet.setColumnWidth(columns.NEXT, 130);
    sheet.hideColumns(columns.ID, width - columns.ID + 1);
    applyPlaylistLinks(sheet);
  }

  function styleActivitySheet(sheet) {
    var width = ns.SheetStore.activityHeaders.length;
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

  function refreshJobsStatus() {
    var sheet = ns.SheetStore._ensureJobsSheet();
    var columns = ns.SheetStore._jobColumns;
    var lastRow = sheet.getLastRow();
    styleJobsSheet(sheet);
    if (lastRow < 2) { return; }
    var rows = sheet.getRange(2, 1, lastRow - 1, ns.SheetStore.jobHeaders.length).getValues();
    var values = [];
    var colors = [];
    rows.forEach(function (row, index) {
      var health;
      var next;
      var color = COLORS.MUTED;
      try {
        var job = ns.SheetStore._normalizeJob(row, index + 2);
        health = job ? ns.SheetStore._healthLabel(job) : '';
        next = job && job.enabled ? ns.SheetStore._nextEligibleLabel(job, new Date()) : (job ? '—' : '');
        if (health.indexOf('✓') === 0) { color = COLORS.SUCCESS; }
        if (health.indexOf('⚠') === 0) { color = COLORS.WARNING; }
        if (health.indexOf('✕') === 0) { color = COLORS.ERROR; }
      } catch (error) {
        var enabled = ns.SheetStore._normalizeBoolean(row[columns.ENABLED - 1]);
        health = enabled ? '✕ Configuration' : '○ Disabled';
        next = enabled ? 'Fix job' : '—';
        color = enabled ? COLORS.ERROR : COLORS.MUTED;
      }
      values.push([health, next]);
      colors.push([color, COLORS.MUTED]);
    });
    sheet.getRange(2, columns.HEALTH, values.length, 2).setValues(values).setFontColors(colors);
    applyPlaylistLinks(sheet);
  }

  function recentActivity(limit) {
    var sheet = ns.SheetStore._ensureActivitySheet();
    var lastRow = sheet.getLastRow();
    var count = Math.min(Number(limit || 5), Math.max(lastRow - 1, 0));
    if (!count) { return []; }
    return sheet.getRange(lastRow - count + 1, 1, count, 7).getValues().reverse();
  }

  function nextJobInfo(jobs, now) {
    var enabled = jobs.filter(function (job) { return job.enabled; });
    if (!enabled.length) { return null; }
    return enabled.map(function (job) {
      var label = ns.SheetStore._nextEligibleLabel(job, now);
      return {
        job: job,
        label: label,
        ordinal: label === 'Ready now' || label === 'Due now' ? -1 : ns.Core.dateKeyToOrdinal(label)
      };
    }).sort(function (a, b) { return a.ordinal - b.ordinal; })[0];
  }

  function refreshDashboard() {
    var sheet = getOrCreateSheet(ns.Constants.SHEETS.DASHBOARD);
    var status = ns.Storage.getDocumentStatus();
    var connected = ns.Auth && ns.Auth.isConnected ? ns.Auth.isConnected() : false;
    var scheduler = ns.Scheduler && ns.Scheduler.getStatus ? ns.Scheduler.getStatus() : { enabled: false };
    var update = ns.UpdateChecker && ns.UpdateChecker.getCachedStatus ? ns.UpdateChecker.getCachedStatus() : null;
    var read = ns.SheetStore.getJobReadResult();
    var enabled = read.jobs.filter(function (job) { return job.enabled; });
    var next = nextJobInfo(read.jobs, new Date());
    var recent = recentActivity(5);

    sheet.getRange('A1:F50').breakApart();
    sheet.clear();
    sheet.setHiddenGridlines(true);
    sheet.setTabColor(COLORS.GREEN);
    styleTitle(sheet, 'A1:F1', 'Spoti Sync');
    sheet.setRowHeight(1, 40);
    sheet.getRange('A3:B3').setValues([['System', 'Status']]); styleTableHeader(sheet.getRange('A3:B3'));
    sheet.getRange('A4:B7').setValues([
      ['Spotify', connected ? '● Connected' : '○ Not connected'],
      ['Scheduler', scheduler.enabled ? '● Running' : '○ Disabled'],
      ['Version', ns.VERSION],
      ['Updates', update ? ns.UpdateChecker.statusLabel(update) : 'Not checked']
    ]);
    sheet.getRange('D3:E3').setValues([['Automation', 'Latest']]); styleTableHeader(sheet.getRange('D3:E3'));
    sheet.getRange('D4:E7').setValues([
      ['Enabled jobs', enabled.length],
      ['Last sync', status.LAST_RUN_AT ? ns.SheetStore._formatTimestamp(status.LAST_RUN_AT) : 'Never'],
      ['Last result', status.LAST_RUN_STATUS || '—'],
      ['Last changes', '+' + Number(status.LAST_RUN_ADDED || 0) + ' / -' + Number(status.LAST_RUN_REMOVED || 0)]
    ]);

    sheet.getRange('A9:F9').merge().setValue('Next automation').setFontWeight('bold').setFontColor(COLORS.MUTED);
    if (read.errors.length) {
      sheet.getRange('A10:F11').merge().setValue('Fix ' + read.errors.length + ' enabled job configuration error' +
        (read.errors.length === 1 ? '' : 's') + ' before the scheduler can run them.')
        .setFontColor(COLORS.ERROR).setWrap(true);
    } else if (next) {
      sheet.getRange('A10:F10').setValues([[
        next.job.name, ns.SheetStore._behaviorLabel(next.job.strategy),
        ns.SheetStore._frequencyLabel(next.job.intervalDays), next.label,
        scheduler.enabled ? 'Scheduled' : 'Scheduler off', ''
      ]]);
      sheet.getRange('A10').setFontWeight('bold');
    } else {
      sheet.getRange('A10:F10').merge().setValue('No enabled jobs yet. Use Spoti Sync → Add Sync Job.')
        .setFontColor(COLORS.MUTED);
    }

    sheet.getRange('A13:F13').setValues([['Recent activity', 'Result', 'Added', 'Removed', 'When', 'Details']]);
    styleTableHeader(sheet.getRange('A13:F13'));
    if (recent.length) {
      sheet.getRange(14, 1, recent.length, 6).setValues(recent.map(function (row) {
        return [row[1], row[2], Number(row[3] || 0), Number(row[4] || 0),
          row[0] ? ns.SheetStore._formatTimestamp(row[0]) : '', row[6] || ''];
      })).setWrap(true);
    } else {
      sheet.getRange('A14:F14').merge().setValue('No sync activity yet.').setFontColor(COLORS.MUTED);
    }

    sheet.setColumnWidth(1, 190); sheet.setColumnWidth(2, 145); sheet.setColumnWidth(3, 90);
    sheet.setColumnWidth(4, 155); sheet.setColumnWidth(5, 175); sheet.setColumnWidth(6, 320);
    sheet.getRange('A3:F20').setVerticalAlignment('middle');
    sheet.getRange('A4:A7').setFontWeight('bold'); sheet.getRange('D4:D7').setFontWeight('bold');
    sheet.getRange('B4').setFontColor(connected ? COLORS.SUCCESS : COLORS.ERROR);
    sheet.getRange('B5').setFontColor(scheduler.enabled ? COLORS.SUCCESS : COLORS.WARNING);
  }

  function refreshSchedule() {
    var sheet = getOrCreateSheet(ns.Constants.SHEETS.SCHEDULE);
    var scheduler = ns.Scheduler && ns.Scheduler.getStatus ? ns.Scheduler.getStatus() :
      { enabled: false, triggerCount: 0, schedule: 'Not configured', lastCheckAt: '', lastCheckStatus: '' };
    var update = ns.UpdateChecker && ns.UpdateChecker.getCachedStatus ? ns.UpdateChecker.getCachedStatus() : null;
    var read = ns.SheetStore.getJobReadResult();
    var jobs = read.jobs.filter(function (job) { return job.enabled; });
    var now = new Date();

    sheet.getRange('A1:F100').breakApart();
    sheet.clear();
    sheet.setHiddenGridlines(true);
    sheet.setTabColor('#34a853');
    styleTitle(sheet, 'A1:F1', 'Automation Schedule');
    sheet.setRowHeight(1, 40);
    sheet.getRange('A3:B3').setValues([['Scheduler', scheduler.enabled ? '● Enabled' : '○ Disabled']]);
    styleTableHeader(sheet.getRange('A3:B3'));
    sheet.getRange('A4:B10').setValues([
      ['Schedule', scheduler.schedule || '—'], ['Runs on', 'Google Apps Script cloud'],
      ['Trigger count', Number(scheduler.triggerCount || 0)],
      ['Last scheduler check', scheduler.lastCheckAt ? ns.SheetStore._formatTimestamp(scheduler.lastCheckAt) : 'Never'],
      ['Last check status', scheduler.lastCheckStatus || '—'], ['Spoti Sync version', ns.VERSION],
      ['Updates', update ? ns.UpdateChecker.statusLabel(update) : 'Not checked']
    ]);
    sheet.getRange('A4:A10').setFontWeight('bold');
    sheet.getRange('B3').setFontColor(scheduler.enabled ? COLORS.SUCCESS : COLORS.WARNING);
    sheet.getRange('A12:F12').setValues([['Upcoming job', 'Behavior', 'Frequency', 'Last success', 'Next eligible', 'State']]);
    styleTableHeader(sheet.getRange('A12:F12'));

    if (jobs.length) {
      var rows = jobs.map(function (job) {
        var next = ns.SheetStore._nextEligibleLabel(job, now);
        return {
          ordinal: next === 'Due now' || next === 'Ready now' ? -1 : ns.Core.dateKeyToOrdinal(next),
          values: [job.name, ns.SheetStore._behaviorLabel(job.strategy), ns.SheetStore._frequencyLabel(job.intervalDays),
            job.lastSuccess ? ns.SheetStore._formatTimestamp(job.lastSuccess, 'MMM d · h:mm a') : 'Never',
            next, next === 'Due now' || next === 'Ready now' ? '● Ready' : '○ Waiting']
        };
      }).sort(function (a, b) { return a.ordinal - b.ordinal; }).map(function (item) { return item.values; });
      sheet.getRange(13, 1, rows.length, 6).setValues(rows);
    } else {
      sheet.getRange('A13:F13').merge().setValue(read.errors.length ?
        'Fix enabled job configuration errors in Jobs.' : 'No enabled jobs.')
        .setFontColor(read.errors.length ? COLORS.ERROR : COLORS.MUTED);
    }
    sheet.setColumnWidth(1, 210); sheet.setColumnWidth(2, 135); sheet.setColumnWidth(3, 125);
    sheet.setColumnWidth(4, 165); sheet.setColumnWidth(5, 130); sheet.setColumnWidth(6, 110);
    sheet.getRange('A1:F40').setVerticalAlignment('middle').setWrap(true);
  }

  ns.SheetViews = {
    refreshJobsStatus: refreshJobsStatus,
    refreshDashboard: refreshDashboard,
    refreshSchedule: refreshSchedule,
    refreshAll: function () {
      var activity = ns.SheetStore._ensureActivitySheet();
      styleActivitySheet(activity);
      refreshJobsStatus();
      refreshSchedule();
      refreshDashboard();
    }
  };
})(SpotiSync);
