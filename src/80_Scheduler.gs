var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var HANDLER = 'spotiSyncScheduler';

  function schedulerTriggers() {
    return ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === HANDLER;
    });
  }

  ns.Scheduler = {
    isEnabled: function () {
      return schedulerTriggers().length > 0;
    },

    enable: function () {
      ns.Scheduler.disable();
      ScriptApp.newTrigger(HANDLER)
        .timeBased()
        .everyDays(1)
        .atHour(ns.Constants.DEFAULT_SCHEDULER_HOUR)
        .create();
      ns.SheetStore.refreshDashboard();
      return true;
    },

    disable: function () {
      schedulerTriggers().forEach(function (trigger) {
        ScriptApp.deleteTrigger(trigger);
      });
      if (ns.SheetStore) {
        try {
          ns.SheetStore.refreshDashboard();
        } catch (ignored) {
          // Dashboard refresh is best effort while installation is incomplete.
        }
      }
      return true;
    }
  };
})(SpotiSync);
