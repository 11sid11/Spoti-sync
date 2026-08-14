var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var HANDLER = 'spotiSyncScheduler';
  var PANEL_START_COLUMN = 15; // O
  var PANEL_ROWS = 8;

  function schedulerTriggers() {
    return ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === HANDLER;
    });
  }

  function deleteSchedulerTriggers() {
    schedulerTriggers().forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  }

  function scheduleLabel(timezone) {
    var start = String(ns.Constants.DEFAULT_SCHEDULER_HOUR).padStart(2, '0') + ':00';
    var end = String((ns.Constants.DEFAULT_SCHEDULER_HOUR + 1) % 24).padStart(2, '0') + ':00';
    return 'Daily · ' + start + '–' + end + ' · ' + timezone;
  }

  function formatTimestamp(value, timezone) {
    if (!value) {
      return 'Never';
    }

    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      return String(value);
    }

    return Utilities.formatDate(date, timezone, 'yyyy-MM-dd HH:mm:ss');
  }

  function dateKeyFromOrdinal(ordinal) {
    return Utilities.formatDate(new Date(ordinal * 86400000), 'UTC', 'yyyy-MM-dd');
  }

  function nextDueLabel(readResult, now, timezone) {
    if (readResult.errors.length) {
      return 'Fix ' + readResult.errors.length + ' configuration error' +
        (readResult.errors.length === 1 ? '' : 's');
    }

    if (!readResult.jobs.length) {
      return 'No enabled jobs';
    }

    var dueNow = readResult.jobs.filter(function (job) {
      return ns.SheetStore.isJobDue(job, now);
    });

    if (dueNow.length) {
      return dueNow[0].name + (dueNow.length > 1 ? ' +' + (dueNow.length - 1) + ' more · due now' : ' · due now');
    }

    var next = readResult.jobs.map(function (job) {
      var last = job.lastSuccess instanceof Date ? job.lastSuccess : new Date(job.lastSuccess);
      var lastOrdinal = ns.Core.calendarDayOrdinal(last, timezone);
      return {
        name: job.name,
        ordinal: lastOrdinal + job.intervalDays
      };
    }).sort(function (a, b) {
      return a.ordinal - b.ordinal;
    })[0];

    return next.name + ' · ' + dateKeyFromOrdinal(next.ordinal);
  }

  function renderPanel() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return;
    }

    var sheet = ss.getSheetByName(ns.Constants.SHEETS.JOBS);
    if (!sheet) {
      return;
    }

    var timezone = ss.getSpreadsheetTimeZone();
    var triggers = schedulerTriggers();
    var status = ns.Storage.getDocumentStatus();
    var readResult = ns.SheetStore.getJobReadResult();
    var values = [
      ['Scheduler', triggers.length ? 'Enabled' : 'Disabled'],
      ['Schedule', scheduleLabel(timezone)],
      ['Runs on', 'Google Apps Script cloud'],
      ['Trigger count', triggers.length],
      ['Last scheduler check', formatTimestamp(status.SCHEDULER_LAST_CHECK_AT, timezone)],
      ['Last check status', status.SCHEDULER_LAST_CHECK_STATUS || '—'],
      ['Next due job', nextDueLabel(readResult, new Date(), timezone)],
      ['Control', 'Spoti Sync menu → Enable / Disable / Sync Now']
    ];

    var range = sheet.getRange(1, PANEL_START_COLUMN, PANEL_ROWS, 2);
    range.clearFormat();
    range.setValues(values);
    range.setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(1, PANEL_START_COLUMN, 1, 2)
      .setBackground('#202124')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.getRange(2, PANEL_START_COLUMN, PANEL_ROWS - 1, 1).setFontWeight('bold');
    sheet.getRange(1, PANEL_START_COLUMN, PANEL_ROWS, 2).setWrap(true).setVerticalAlignment('middle');
    sheet.setColumnWidth(PANEL_START_COLUMN, 155);
    sheet.setColumnWidth(PANEL_START_COLUMN + 1, 330);

    if (triggers.length) {
      sheet.getRange(1, PANEL_START_COLUMN + 1).setFontColor('#137333');
    } else {
      sheet.getRange(1, PANEL_START_COLUMN + 1).setFontColor('#d93025');
    }
  }

  function recordSchedulerCheck(status, error) {
    ns.Storage.setDocumentStatus({
      SCHEDULER_LAST_CHECK_AT: ns.Core.nowIso(),
      SCHEDULER_LAST_CHECK_STATUS: status,
      SCHEDULER_LAST_CHECK_ERROR: error ? ns.Core.safeErrorMessage(error) : ''
    });
  }

  ns.Scheduler = {
    isEnabled: function () {
      return schedulerTriggers().length > 0;
    },

    getStatus: function () {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var timezone = ss ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
      var triggers = schedulerTriggers();
      var documentStatus = ns.Storage.getDocumentStatus();
      return {
        enabled: triggers.length > 0,
        triggerCount: triggers.length,
        schedule: scheduleLabel(timezone),
        lastCheckAt: documentStatus.SCHEDULER_LAST_CHECK_AT || '',
        lastCheckStatus: documentStatus.SCHEDULER_LAST_CHECK_STATUS || ''
      };
    },

    enable: function () {
      // Idempotent by design: remove every existing Spoti Sync scheduler trigger
      // before creating exactly one replacement trigger.
      deleteSchedulerTriggers();
      ScriptApp.newTrigger(HANDLER)
        .timeBased()
        .everyDays(1)
        .atHour(ns.Constants.DEFAULT_SCHEDULER_HOUR)
        .create();
      ns.SheetStore.refreshDashboard();
      renderPanel();
      return true;
    },

    disable: function () {
      deleteSchedulerTriggers();
      if (ns.SheetStore) {
        try {
          ns.SheetStore.refreshDashboard();
          renderPanel();
        } catch (ignored) {
          // Dashboard/panel refresh is best effort while installation is incomplete.
        }
      }
      return true;
    },

    runDue: function () {
      try {
        var result = ns.SyncEngine.runDue();
        recordSchedulerCheck(result.status || 'Success', null);
        renderPanel();
        return result;
      } catch (error) {
        recordSchedulerCheck('Error', error);
        try {
          renderPanel();
        } catch (ignored) {
          // Preserve the original scheduler error.
        }
        throw error;
      }
    },

    refreshPanel: renderPanel
  };
})(SpotiSync);
