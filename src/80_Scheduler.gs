var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var HANDLER = 'spotiSyncScheduler';

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

  function recordSchedulerCheck(status, error) {
    ns.Storage.setDocumentStatus({
      SCHEDULER_LAST_CHECK_AT: ns.Core.nowIso(),
      SCHEDULER_LAST_CHECK_STATUS: status,
      SCHEDULER_LAST_CHECK_ERROR: error ? ns.Core.safeErrorMessage(error) : ''
    });
  }

  function checkForUpdatesBestEffort() {
    try {
      ns.UpdateChecker.check({ force: false });
    } catch (ignored) {
      // Release checks are advisory and must never break playlist synchronization.
    }
  }

  function refreshSchedulerViewsBestEffort() {
    try {
      // Trigger changes only affect scheduler-facing status. Avoid reformatting
      // Jobs and Activity when the user enables/disables the scheduler.
      ns.SheetStore.refreshSchedule();
      ns.SheetStore.refreshDashboard();
    } catch (ignored) {
      // Keep scheduler and authorization actions functional during partial setup.
    }
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
        timezone: timezone,
        lastCheckAt: documentStatus.SCHEDULER_LAST_CHECK_AT || '',
        lastCheckStatus: documentStatus.SCHEDULER_LAST_CHECK_STATUS || '',
        lastCheckError: documentStatus.SCHEDULER_LAST_CHECK_ERROR || ''
      };
    },

    enable: function () {
      // Idempotent: enabling always replaces every existing Spoti Sync trigger
      // with exactly one daily trigger.
      deleteSchedulerTriggers();
      ScriptApp.newTrigger(HANDLER)
        .timeBased()
        .everyDays(1)
        .atHour(ns.Constants.DEFAULT_SCHEDULER_HOUR)
        .create();
      refreshSchedulerViewsBestEffort();
      return true;
    },

    disable: function () {
      deleteSchedulerTriggers();
      refreshSchedulerViewsBestEffort();
      return true;
    },

    runDue: function () {
      try {
        var result = ns.SyncEngine.runDue();
        recordSchedulerCheck(result.status || 'Success', null);
        checkForUpdatesBestEffort();
        refreshSchedulerViewsBestEffort();
        return result;
      } catch (error) {
        recordSchedulerCheck('Error', error);
        checkForUpdatesBestEffort();
        refreshSchedulerViewsBestEffort();
        throw error;
      }
    },

    refreshViews: refreshSchedulerViewsBestEffort,
    _scheduleLabel: scheduleLabel
  };
})(SpotiSync);
