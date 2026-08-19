#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const schedulerSource = fs.readFileSync(path.join(root, 'src', '80_Scheduler.gs'), 'utf8');
const entrypoints = fs.readFileSync(path.join(root, 'src', '99_Entrypoints.gs'), 'utf8');
const sheetViews = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src', '00_Core.gs'), 'utf8');

function dayJob(id, interval = 1, enabled = true) {
  return {
    jobId: id,
    enabled,
    frequencyUnit: 'DAY',
    frequencyInterval: interval,
    intervalDays: interval
  };
}

function hourJob(id, interval = 1, enabled = true) {
  return {
    jobId: id,
    enabled,
    frequencyUnit: 'HOUR',
    frequencyInterval: interval,
    intervalHours: interval
  };
}

function makeContext(jobs, initialTriggerCount, initialMode) {
  let triggerId = 0;
  let triggers = Array.from({ length: initialTriggerCount }, () => ({
    id: ++triggerId,
    getHandlerFunction() { return 'spotiSyncScheduler'; }
  }));
  let creates = 0;
  let deletes = 0;
  let summaryRefreshes = 0;
  let updateChecks = 0;
  const createdCadences = [];
  const documentStatus = {};
  if (initialMode !== undefined && initialMode !== null) {
    documentStatus.SCHEDULER_MODE = initialMode;
  }

  const context = vm.createContext({
    console, Date, Object, Array, String, Number, Boolean, Math, JSON, RegExp, Error,
    Session: { getScriptTimeZone() { return 'UTC'; } },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSpreadsheetTimeZone() { return 'UTC'; } };
      }
    },
    ScriptApp: {
      getProjectTriggers() { return triggers.slice(); },
      deleteTrigger(trigger) {
        deletes += 1;
        triggers = triggers.filter((item) => item !== trigger);
      },
      newTrigger(handler) {
        assert.strictEqual(handler, 'spotiSyncScheduler');
        let cadence = '';
        return {
          timeBased() { return this; },
          everyDays(days) {
            assert.strictEqual(days, 1);
            cadence = 'DAILY';
            return this;
          },
          everyHours(hours) {
            assert.strictEqual(hours, 1);
            cadence = 'HOURLY';
            return this;
          },
          atHour() { return this; },
          create() {
            creates += 1;
            createdCadences.push(cadence);
            const trigger = {
              id: ++triggerId,
              getHandlerFunction() { return 'spotiSyncScheduler'; }
            };
            triggers.push(trigger);
            return trigger;
          }
        };
      }
    }
  });

  context.SpotiSync = {
    Constants: {
      DEFAULT_SCHEDULER_HOUR: 3,
      FREQUENCY_UNITS: { HOUR: 'HOUR', DAY: 'DAY' }
    },
    Core: {
      trim(value) { return value === null || value === undefined ? '' : String(value).trim(); },
      nowIso() { return new Date().toISOString(); },
      safeErrorMessage(error) { return String(error && error.message || error); }
    },
    Storage: {
      getDocumentStatus() { return { ...documentStatus }; },
      setDocumentStatus(values) { Object.assign(documentStatus, values); }
    },
    SheetStore: {
      getJobs() { return jobs.slice(); },
      refreshSummary() { summaryRefreshes += 1; }
    },
    UpdateChecker: { check() { updateChecks += 1; } },
    SyncEngine: { runDue() { return { status: 'Success' }; } }
  };
  vm.runInContext(schedulerSource, context, { filename: '80_Scheduler.gs' });

  return {
    Scheduler: context.SpotiSync.Scheduler,
    setRunDueResult(result) { context.SpotiSync.SyncEngine.runDue = () => result; },
    stats() {
      return {
        creates,
        deletes,
        triggerCount: triggers.length,
        createdCadences: createdCadences.slice(),
        mode: documentStatus.SCHEDULER_MODE || '',
        summaryRefreshes,
        updateChecks
      };
    }
  };
}

(function testZeroAutomatedJobsRemovesTriggers() {
  const env = makeContext([], 2, 'DAILY');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.enabled, false);
  assert.strictEqual(result.mode, 'NONE');
  assert.strictEqual(env.stats().triggerCount, 0);
  assert.strictEqual(env.stats().creates, 0);
  assert.strictEqual(env.stats().deletes, 2);
  assert.strictEqual(env.stats().mode, 'NONE');
})();

(function testLegacySingleDailyTriggerIsRetainedAndMarked() {
  const env = makeContext([dayJob('job_day')], 1, null);
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.mode, 'DAILY');
  assert.strictEqual(result.changed, false);
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.strictEqual(env.stats().creates, 0);
  assert.strictEqual(env.stats().deletes, 0);
  assert.strictEqual(env.stats().mode, 'DAILY');
})();

(function testMissingDailyTriggerIsCreatedOnce() {
  const env = makeContext([dayJob('job_day', 7)], 0, 'NONE');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.mode, 'DAILY');
  assert.strictEqual(result.changed, true);
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.deepStrictEqual(env.stats().createdCadences, ['DAILY']);
})();

(function testHourlyJobCreatesOneHourlyDispatcher() {
  const env = makeContext([hourJob('job_hour', 6)], 0, 'NONE');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.mode, 'HOURLY');
  assert.strictEqual(result.triggerCount, 1);
  assert.deepStrictEqual(env.stats().createdCadences, ['HOURLY']);
})();

(function testMixedSchedulesUseOneHourlyDispatcher() {
  const env = makeContext([
    hourJob('job_hour', 12),
    dayJob('job_daily', 1),
    dayJob('job_weekly', 7)
  ], 0, 'NONE');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.mode, 'HOURLY');
  assert.strictEqual(result.automatedJobs, 3);
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.deepStrictEqual(env.stats().createdCadences, ['HOURLY']);
})();

(function testCorrectHourlyTriggerIsNotRecreated() {
  const env = makeContext([hourJob('job_hour', 2)], 1, 'HOURLY');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.changed, false);
  assert.strictEqual(env.stats().creates, 0);
  assert.strictEqual(env.stats().deletes, 0);
})();

(function testDuplicateTriggersNormalizeToOneDesiredCadence() {
  const env = makeContext([hourJob('job_hour', 8)], 3, 'HOURLY');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.mode, 'HOURLY');
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.strictEqual(env.stats().deletes, 3);
  assert.strictEqual(env.stats().creates, 1);
  assert.deepStrictEqual(env.stats().createdCadences, ['HOURLY']);
})();

(function testRemovingFinalHourlyJobDowngradesToDaily() {
  const jobs = [hourJob('job_hour', 6), dayJob('job_day', 7)];
  const env = makeContext(jobs, 1, 'HOURLY');
  jobs.splice(0, 1);
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.mode, 'DAILY');
  assert.strictEqual(env.stats().deletes, 1);
  assert.strictEqual(env.stats().creates, 1);
  assert.deepStrictEqual(env.stats().createdCadences, ['DAILY']);
})();

(function testDisabledHourlyJobDoesNotUpgradeDispatcher() {
  const env = makeContext([hourJob('manual_hourly', 1, false), dayJob('job_day', 1)], 1, 'DAILY');
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.mode, 'DAILY');
  assert.strictEqual(result.changed, false);
})();

(function testNoDueHourlyWakeDoesNotRefreshSummary() {
  const env = makeContext([hourJob('job_hour', 6)], 1, 'HOURLY');
  env.setRunDueResult({ status: 'No jobs due' });
  const result = env.Scheduler.runDue();
  assert.strictEqual(result.status, 'No jobs due');
  assert.strictEqual(env.stats().summaryRefreshes, 0);
  assert.strictEqual(env.stats().updateChecks, 1);
})();

(function testCompletedDueRunRefreshesSummary() {
  const env = makeContext([hourJob('job_hour', 1)], 1, 'HOURLY');
  env.setRunDueResult({ status: 'Success' });
  env.Scheduler.runDue();
  assert.strictEqual(env.stats().summaryRefreshes, 1);
})();

(function testOneAdaptiveSchedulerArchitectureRemains() {
  assert(schedulerSource.includes('.everyDays(1)'));
  assert(schedulerSource.includes('.everyHours(1)'));
  assert(schedulerSource.includes("var HANDLER = 'spotiSyncScheduler'"));
  assert(schedulerSource.includes("HOURLY: 'HOURLY'"));
  assert(!schedulerSource.includes('newTrigger(job'), 'Scheduler must not create per-job triggers.');
  assert(entrypoints.includes('SpotiSync.Scheduler.runDue();'), 'Clock trigger must route through Scheduler telemetry.');
})();

(function testSchedulerIsNotAUserFacingMenuConcept() {
  assert(entrypoints.includes(".addItem('Open Spoti Sync', 'spotiSyncOpenApp')"));
  assert(!entrypoints.includes(".addItem('Enable Daily Scheduler"));
  assert(!entrypoints.includes(".addItem('Disable Scheduler"));
  assert(!entrypoints.includes(".addItem('Setup'"));
})();

(function testVisibleSheetModelIsSummaryAndActivity() {
  assert(core.includes("SUMMARY: 'Spoti Sync'"));
  assert(core.includes("ACTIVITY: 'Activity'"));
  assert(sheetViews.includes('jobs.hideSheet();'));
  assert(sheetViews.includes('schedule.hideSheet();'));
  assert(!sheetViews.includes("'Automation Schedule'"));
  assert(!sheetViews.includes('refreshSchedule'));
  ['Job', 'Source', 'Target', 'Behavior', 'Automation', 'Last sync', 'Status'].forEach((label) => assert(sheetViews.includes(`'${label}'`)));
})();

console.log('v1.5 adaptive scheduler reconciliation and visible-sheet model checks passed.');
