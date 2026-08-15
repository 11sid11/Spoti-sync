var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var HANDLER = 'spotiSyncScheduler';

  function schedulerTriggers() {
    return ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === HANDLER;
    });
  }

  function deleteSchedulerTriggers(triggers) {
    (triggers || schedulerTriggers()).forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  }

  function createSchedulerTrigger() {
    return ScriptApp.newTrigger(HANDLER)
      .timeBased()
      .everyDays(1)
      .atHour(ns.Constants.DEFAULT_SCHEDULER_HOUR)
      .create();
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

  function refreshSummaryBestEffort() {
    try {
      ns.SheetStore.refreshSummary();
    } catch (ignored) {
      // Trigger management must not depend on Sheet presentation.
    }
  }

  function automatedJobCount() {
    return ns.SheetStore.getJobs().filter(function (job) { return job.enabled; }).length;
  }

  function reconcile(options) {
    var settings = options || {};
    var automated = automatedJobCount();
    var triggers = schedulerTriggers();
    var changed = false;

    if (!automated) {
      if (triggers.length) {
        deleteSchedulerTriggers(triggers);
        changed = true;
      }
      if (settings.refresh !== false) { refreshSummaryBestEffort(); }
      return {
        enabled: false,
        triggerCount: 0,
        automatedJobs: 0,
        changed: changed
      };
    }

    if (triggers.length !== 1) {
      deleteSchedulerTriggers(triggers);
      createSchedulerTrigger();
      changed = true;
      triggers = schedulerTriggers();
    }

    if (settings.refresh !== false) { refreshSummaryBestEffort(); }
    return {
      enabled: true,
      triggerCount: triggers.length || 1,
      automatedJobs: automated,
      changed: changed
    };
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

    reconcile: reconcile,

    // Compatibility helpers for old installed callbacks. Normal v1.4 UX never
    // exposes manual scheduler controls.
    enable: function () {
      return reconcile();
    },

    disable: function () {
      deleteSchedulerTriggers();
      refreshSummaryBestEffort();
      return true;
    },

    runDue: function () {
      try {
        var result = ns.SyncEngine.runDue();
        recordSchedulerCheck(result.status || 'Success', null);
        checkForUpdatesBestEffort();
        refreshSummaryBestEffort();
        return result;
      } catch (error) {
        recordSchedulerCheck('Error', error);
        checkForUpdatesBestEffort();
        refreshSummaryBestEffort();
        throw error;
      }
    },

    _schedulerTriggers: schedulerTriggers,
    _scheduleLabel: scheduleLabel,
    _reconcile: reconcile
  };
})(SpotiSync);
