var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var HANDLER = 'spotiSyncScheduler';
  var MODE_KEY = 'SCHEDULER_MODE';
  var MODE = Object.freeze({
    NONE: 'NONE',
    DAILY: 'DAILY',
    HOURLY: 'HOURLY'
  });

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

  function createSchedulerTrigger(mode) {
    var builder = ScriptApp.newTrigger(HANDLER).timeBased();
    if (mode === MODE.HOURLY) {
      return builder.everyHours(1).create();
    }
    return builder.everyDays(1).atHour(ns.Constants.DEFAULT_SCHEDULER_HOUR).create();
  }

  function requiredModeForJobs(jobs) {
    var automated = (jobs || []).filter(function (job) { return job.enabled; });
    if (!automated.length) {
      return MODE.NONE;
    }
    return automated.some(function (job) {
      return job.frequencyUnit === ns.Constants.FREQUENCY_UNITS.HOUR;
    }) ? MODE.HOURLY : MODE.DAILY;
  }

  function storedMode(triggers) {
    var status = ns.Storage.getDocumentStatus();
    var mode = ns.Core.trim(status[MODE_KEY]).toUpperCase();
    if (mode === MODE.DAILY || mode === MODE.HOURLY || mode === MODE.NONE) {
      return mode;
    }

    // v1.4 had exactly one daily scheduler and no persisted cadence marker.
    // Treat that shape as DAILY so upgrades do not churn a correct legacy trigger.
    if ((triggers || schedulerTriggers()).length === 1) {
      return MODE.DAILY;
    }
    return MODE.NONE;
  }

  function rememberMode(mode) {
    var values = {};
    values[MODE_KEY] = mode;
    ns.Storage.setDocumentStatus(values);
  }

  function scheduleLabel(timezone, mode) {
    if (mode === MODE.HOURLY) {
      return 'Hourly · ' + timezone;
    }
    if (mode === MODE.DAILY) {
      var start = String(ns.Constants.DEFAULT_SCHEDULER_HOUR).padStart(2, '0') + ':00';
      var end = String((ns.Constants.DEFAULT_SCHEDULER_HOUR + 1) % 24).padStart(2, '0') + ':00';
      return 'Daily · ' + start + '–' + end + ' · ' + timezone;
    }
    return 'Off';
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

  function reconcile(options) {
    var settings = options || {};
    var jobs = ns.SheetStore.getJobs();
    var automated = jobs.filter(function (job) { return job.enabled; }).length;
    var desiredMode = requiredModeForJobs(jobs);
    var triggers = schedulerTriggers();
    var currentMode = storedMode(triggers);
    var changed = false;

    if (desiredMode === MODE.NONE) {
      if (triggers.length) {
        deleteSchedulerTriggers(triggers);
        changed = true;
      }
      rememberMode(MODE.NONE);
      if (settings.refresh !== false) { refreshSummaryBestEffort(); }
      return {
        enabled: false,
        mode: MODE.NONE,
        triggerCount: 0,
        automatedJobs: 0,
        changed: changed
      };
    }

    if (triggers.length !== 1 || currentMode !== desiredMode) {
      deleteSchedulerTriggers(triggers);
      createSchedulerTrigger(desiredMode);
      changed = true;
      triggers = schedulerTriggers();
    }

    rememberMode(desiredMode);
    if (settings.refresh !== false) { refreshSummaryBestEffort(); }
    return {
      enabled: true,
      mode: desiredMode,
      triggerCount: triggers.length || 1,
      automatedJobs: automated,
      changed: changed
    };
  }

  ns.Scheduler = {
    modes: MODE,

    isEnabled: function () {
      return schedulerTriggers().length > 0;
    },

    getStatus: function () {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var timezone = ss ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
      var triggers = schedulerTriggers();
      var documentStatus = ns.Storage.getDocumentStatus();
      var mode = triggers.length ? storedMode(triggers) : MODE.NONE;
      return {
        enabled: triggers.length > 0,
        mode: mode,
        triggerCount: triggers.length,
        schedule: scheduleLabel(timezone, mode),
        timezone: timezone,
        lastCheckAt: documentStatus.SCHEDULER_LAST_CHECK_AT || '',
        lastCheckStatus: documentStatus.SCHEDULER_LAST_CHECK_STATUS || '',
        lastCheckError: documentStatus.SCHEDULER_LAST_CHECK_ERROR || ''
      };
    },

    reconcile: reconcile,

    // Compatibility helpers for old installed callbacks. Normal v1.5 UX never
    // exposes manual scheduler controls.
    enable: function () {
      return reconcile();
    },

    disable: function () {
      deleteSchedulerTriggers();
      rememberMode(MODE.NONE);
      refreshSummaryBestEffort();
      return true;
    },

    runDue: function () {
      try {
        var result = ns.SyncEngine.runDue();
        recordSchedulerCheck(result.status || 'Success', null);
        checkForUpdatesBestEffort();
        if (result.status !== 'No jobs due') {
          refreshSummaryBestEffort();
        }
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
    _requiredModeForJobs: requiredModeForJobs,
    _storedMode: storedMode,
    _reconcile: reconcile
  };
})(SpotiSync);
