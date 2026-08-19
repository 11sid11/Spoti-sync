#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const activity = [];
let updatedSuccess = 0;
let summaryRefreshes = 0;
let heartbeatCalls = 0;
let runSummaries = 0;
let sourceReads = 0;

const disabledJob = {
  rowNumber: 2,
  enabled: false,
  name: 'Manual only',
  jobId: 'job_manual',
  sourceType: 'LIKED_SONGS',
  sourcePlaylist: '',
  targetPlaylist: '1234567890AB',
  strategy: 'MIRROR',
  frequencyUnit: 'DAY',
  frequencyInterval: 10,
  intervalDays: 10,
  heartbeatEnabled: true
};

const context = vm.createContext({
  console, Date, Object, Array, String, Number, Boolean, Math, JSON, RegExp, Error,
  LockService: {
    getScriptLock() {
      return { tryLock() { return true; }, releaseLock() {} };
    }
  }
});

function load(name) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', name), 'utf8'), context, { filename: name });
}

load('00_Core.gs');
context.SpotiSync.SheetStore = {
  getJobReadResult() { return { jobs: [disabledJob], errors: [] }; },
  isJobDue() { return true; },
  updateJobSuccess() { updatedSuccess += 1; },
  updateJobError() {},
  updateConfigurationError() {},
  appendActivity(entry) { activity.push(entry); },
  setRunSummary() { runSummaries += 1; },
  refreshSummary() { summaryRefreshes += 1; }
};
context.SpotiSync.Sources = {
  getForJob() { sourceReads += 1; return { tracks: [{ writeUri: 'spotify:track:A' }] }; },
  getTargetPlaylist() { return { tracks: [] }; },
  invalidatePlaylist() {}
};
context.SpotiSync.Strategies = {
  plan() {
    return { add: [], remove: [], removeCount: 0, ignored: 0, addMode: 'END' };
  }
};
context.SpotiSync.SpotifyApi = {
  removePlaylistItems() {},
  addPlaylistItems() {}
};
context.SpotiSync.PlaylistHeartbeat = {
  update() { heartbeatCalls += 1; return { ok: true }; }
};
load('70_SyncEngine.gs');

(function testAutomationOffJobCanStillRunByStableId() {
  const result = context.SpotiSync.SyncEngine.runJob('job_manual');
  assert.strictEqual(result.jobs.length, 1);
  assert.strictEqual(result.jobs[0].jobId, 'job_manual');
  assert.strictEqual(result.jobs[0].status, 'Success');
  assert.strictEqual(updatedSuccess, 1);
  assert.strictEqual(activity.length, 1);
  assert.strictEqual(summaryRefreshes, 1);
  assert.strictEqual(heartbeatCalls, 1);
  assert.strictEqual(sourceReads, 1);
  assert.strictEqual(runSummaries, 1);
})();

(function testDueSchedulerPathDoesNotRunAutomationOffJobOrWriteNoOpRunSummary() {
  const result = context.SpotiSync.SyncEngine.runDue();
  assert.strictEqual(result.jobs.length, 0);
  assert.strictEqual(result.status, 'No jobs due');
  assert.strictEqual(sourceReads, 1, 'No-due scheduler tick must not read Spotify sources.');
  assert.strictEqual(activity.length, 1, 'No-due scheduler tick must not add Activity noise.');
  assert.strictEqual(runSummaries, 1, 'No-due scheduler tick must not replace the last real run summary.');
})();

(function testTargetedManualRunDoesNotTemporarilyEnableJob() {
  assert.strictEqual(disabledJob.enabled, false);
})();

const sheetStoreSource = fs.readFileSync(path.join(root, 'src', '60_SheetStore.gs'), 'utf8');
const jobService = fs.readFileSync(path.join(root, 'src', '92_JobEditor.gs'), 'utf8');
const views = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');

(function testJobOwnedHeartbeatSchemaAndImmediateSummaryRefresh() {
  assert(sheetStoreSource.includes("'Heartbeat Enabled'"));
  assert(jobService.includes('heartbeatEnabled: data.heartbeatEnabled !== false'));
  assert(jobService.includes('ns.SheetStore.refreshSummary();'));
  assert(views.includes('refreshSummary: refreshSummary'));
})();

(function testNormalActionsDoNotRenderHiddenJobsOrSchedule() {
  assert(!jobService.includes('refreshJobsStatus'));
  assert(!jobService.includes('refreshSchedule'));
  assert(!views.includes('refreshJobsStatus'));
  assert(!views.includes('refreshSchedule'));
})();

console.log('v1.5 manual-run, heartbeat, no-op scheduler, and one-summary-refresh tests passed.');
