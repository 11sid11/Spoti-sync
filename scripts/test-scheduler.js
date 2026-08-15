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

function makeContext(enabledJobs, initialTriggerCount) {
  let triggerId = 0;
  let triggers = Array.from({ length: initialTriggerCount }, () => ({
    id: ++triggerId,
    getHandlerFunction() { return 'spotiSyncScheduler'; }
  }));
  let creates = 0;
  let deletes = 0;
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
        return {
          timeBased() { return this; },
          everyDays(days) { assert.strictEqual(days, 1); return this; },
          atHour() { return this; },
          create() {
            creates += 1;
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
    Constants: { DEFAULT_SCHEDULER_HOUR: 3 },
    Core: {
      nowIso() { return new Date().toISOString(); },
      safeErrorMessage(error) { return String(error && error.message || error); }
    },
    Storage: {
      getDocumentStatus() { return {}; },
      setDocumentStatus() {}
    },
    SheetStore: {
      getJobs() {
        return Array.from({ length: enabledJobs }, (_, index) => ({ jobId: `job_${index}`, enabled: true }));
      },
      refreshSummary() {}
    },
    UpdateChecker: { check() {} },
    SyncEngine: { runDue() { return { status: 'Success' }; } }
  };
  vm.runInContext(schedulerSource, context, { filename: '80_Scheduler.gs' });
  return {
    Scheduler: context.SpotiSync.Scheduler,
    stats() { return { creates, deletes, triggerCount: triggers.length }; }
  };
}

(function testZeroAutomatedJobsRemovesTriggers() {
  const env = makeContext(0, 2);
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.enabled, false);
  assert.strictEqual(env.stats().triggerCount, 0);
  assert.strictEqual(env.stats().creates, 0);
  assert.strictEqual(env.stats().deletes, 2);
})();

(function testOneCorrectTriggerIsNotRecreated() {
  const env = makeContext(2, 1);
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.changed, false);
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.strictEqual(env.stats().creates, 0);
  assert.strictEqual(env.stats().deletes, 0);
})();

(function testMissingTriggerIsCreatedOnce() {
  const env = makeContext(1, 0);
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.strictEqual(env.stats().creates, 1);
})();

(function testDuplicateTriggersNormalizeToOne() {
  const env = makeContext(3, 3);
  const result = env.Scheduler.reconcile({ refresh: false });
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(env.stats().triggerCount, 1);
  assert.strictEqual(env.stats().deletes, 3);
  assert.strictEqual(env.stats().creates, 1);
})();

(function testOneDailySchedulerArchitectureRemains() {
  assert(schedulerSource.includes('.everyDays(1)'));
  assert(schedulerSource.includes("var HANDLER = 'spotiSyncScheduler'"));
  assert(!schedulerSource.includes('job.jobId') && !schedulerSource.includes('newTrigger(job'), 'Scheduler must not create per-job triggers.');
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

console.log('v1.4 scheduler reconciliation and visible-sheet model checks passed.');
