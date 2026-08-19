#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console, Date, Object, Array, String, Number, Boolean, Math, JSON, RegExp, Error,
  encodeURIComponent, decodeURIComponent,
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      return { getSpreadsheetTimeZone() { return 'UTC'; } };
    }
  },
  Utilities: {
    getUuid() { return '12345678-1234-1234-1234-123456789abc'; },
    formatDate(date, timezone, pattern) {
      if (pattern === 'yyyy-MM-dd') { return date.toISOString().slice(0, 10); }
      return date.toISOString();
    }
  }
});

function load(filename) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', filename), 'utf8'), context, { filename });
}

load('00_Core.gs');
load('60_SheetStore.gs');

const { Core, SheetStore } = context.SpotiSync;

function jobRow(frequency, lastSuccess = '') {
  return [
    true, 'Schedule test', 'Liked Songs', 'Target', 'Exact Mirror', frequency, '', '',
    'job_schedule', '', '1234567890AB', '', lastSuccess, '', 0, 0, '', true
  ];
}

(function testDaySchedulesKeepExistingRepresentation() {
  let result = SheetStore._parseJobRows([jobRow('Daily')], 2);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.jobs[0].frequencyUnit, 'DAY');
  assert.strictEqual(result.jobs[0].frequencyInterval, 1);
  assert.strictEqual(result.jobs[0].intervalDays, 1);
  assert.strictEqual(result.jobs[0].intervalHours, null);

  result = SheetStore._parseJobRows([jobRow('Every 7 days')], 2);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.jobs[0].frequencyUnit, 'DAY');
  assert.strictEqual(result.jobs[0].frequencyInterval, 7);
  assert.strictEqual(result.jobs[0].intervalDays, 7);
})();

(function testHourlySchedulesUseSameFrequencyColumn() {
  let result = SheetStore._parseJobRows([jobRow('Hourly')], 2);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.jobs[0].frequencyUnit, 'HOUR');
  assert.strictEqual(result.jobs[0].frequencyInterval, 1);
  assert.strictEqual(result.jobs[0].intervalHours, 1);
  assert.strictEqual(result.jobs[0].intervalDays, null);
  assert.strictEqual(SheetStore.getAutomationLabel(result.jobs[0]), 'Hourly');

  result = SheetStore._parseJobRows([jobRow('Every 6 hours')], 2);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.jobs[0].frequencyUnit, 'HOUR');
  assert.strictEqual(result.jobs[0].frequencyInterval, 6);
  assert.strictEqual(result.jobs[0].intervalHours, 6);
  assert.strictEqual(SheetStore.getAutomationLabel(result.jobs[0]), 'Every 6 hours');
})();

(function testHourlyDueMathUsesElapsedHours() {
  const last = new Date('2026-08-20T00:00:00Z');
  assert.strictEqual(Core.isDueByElapsedHours(last, 6, new Date('2026-08-20T05:59:59Z')), false);
  assert.strictEqual(Core.isDueByElapsedHours(last, 6, new Date('2026-08-20T06:00:00Z')), true);

  const job = SheetStore._parseJobRows([jobRow('Every 6 hours', last)], 2).jobs[0];
  assert.strictEqual(SheetStore.isJobDue(job, new Date('2026-08-20T05:59:59Z')), false);
  assert.strictEqual(SheetStore.isJobDue(job, new Date('2026-08-20T06:00:00Z')), true);
})();

(function testDayDueMathStillUsesCalendarDays() {
  const job = SheetStore._parseJobRows([
    jobRow('Every 7 days', new Date('2026-08-13T23:59:00Z'))
  ], 2).jobs[0];
  assert.strictEqual(SheetStore.isJobDue(job, new Date('2026-08-20T00:01:00Z')), true);
})();

(function testFrequencyBoundsAndCanonicalLabels() {
  assert.strictEqual(SheetStore.parseFrequency('Every 23 hours').label, 'Every 23 hours');
  assert.strictEqual(SheetStore.parseFrequency('Every 3650 days').label, 'Every 3650 days');
  assert.throws(() => SheetStore.parseFrequency('Every 0 hours'), /1 to 23/);
  assert.throws(() => SheetStore.parseFrequency('Every 24 hours'), /Use Daily for 24 hours/);
  assert.throws(() => SheetStore.parseFrequency('Every 0 days'), /1 to 3650/);
  assert.throws(() => SheetStore.parseFrequency('Every 3651 days'), /1 to 3650/);
})();

(function testHotPathSafetyGuards() {
  const scheduler = fs.readFileSync(path.join(root, 'src', '80_Scheduler.gs'), 'utf8');
  const syncEngine = fs.readFileSync(path.join(root, 'src', '70_SyncEngine.gs'), 'utf8');
  const sheetStore = fs.readFileSync(path.join(root, 'src', '60_SheetStore.gs'), 'utf8');

  assert(scheduler.includes('.everyHours(1)'), 'Sub-daily jobs must use one hourly dispatcher.');
  assert(!scheduler.includes('newTrigger(job'), 'No per-job triggers may be created.');
  assert(!scheduler.includes('clearFormats()'));
  assert(!syncEngine.includes('clearFormats()'));
  assert(!sheetStore.includes('clearFormats()'));
  assert(!syncEngine.includes('SheetStore.initialize('), 'Normal sync must not invoke migration/repair.');
})();

console.log('v1.5 frequency, due-time, and hot-path safety checks passed.');
