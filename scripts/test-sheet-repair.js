#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Math,
  JSON,
  RegExp,
  Error,
  encodeURIComponent,
  decodeURIComponent,
  Utilities: {
    getUuid() {
      return '12345678-1234-1234-1234-123456789abc';
    },
    formatDate(date, timezone, pattern) {
      if (pattern === 'yyyy-MM-dd') {
        return date.toISOString().slice(0, 10);
      }
      return date.toISOString();
    }
  }
});

function load(filename) {
  const code = fs.readFileSync(path.join(root, 'src', filename), 'utf8');
  vm.runInContext(code, context, { filename });
}

load('00_Core.gs');
load('60_SheetStore.gs');

const { SheetStore } = context.SpotiSync;
const sheetViews = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');
const scheduler = fs.readFileSync(path.join(root, 'src', '80_Scheduler.gs'), 'utf8');
const sheetStoreSource = fs.readFileSync(path.join(root, 'src', '60_SheetStore.gs'), 'utf8');

(function testPartialV13RepairRecoversLegacyJobAndDropsSchedulerArtifacts() {
  const partialLegacyRow = [
    true,
    'Spotify Sync',
    'LIKED_SONGS',
    '',
    'https://open.spotify.com/playlist/1234567890AB?si=test',
    'MIRROR',
    1,
    new Date('2026-08-14T03:00:00Z'),
    new Date('2026-08-14T03:00:00Z'),
    'Success',
    3,
    1,
    '',
    '',
    'Scheduler enabled',
    'Daily',
    ''
  ];

  const schedulerArtifactRow = [
    false, '', '', '', '', '', '○ Disabled', '—', '', '', '', '', '', '',
    'Last scheduler check', 'Success', ''
  ];

  const repaired = SheetStore._repairCurrentJobRows([partialLegacyRow, schedulerArtifactRow]);
  assert.strictEqual(repaired.changed, true);
  assert.strictEqual(repaired.rows.length, 1);
  assert.strictEqual(repaired.rows[0][1], 'Spotify Sync');
  assert.strictEqual(repaired.rows[0][2], 'Liked Songs');
  assert.strictEqual(repaired.rows[0][4], 'Exact Mirror');
  assert.strictEqual(repaired.rows[0][5], 'Daily');
  assert.strictEqual(repaired.rows[0][8], 'job_1234567812341234');
  assert.strictEqual(repaired.rows[0][10], '1234567890AB');
})();

(function testCurrentJobWithoutStableIdGetsOneWithoutChangingConfiguration() {
  const currentRow = [
    true, 'Archive', 'Liked Songs', 'Open playlist ↗', 'Append Only', 'Every 10 days',
    '✓ Healthy', '2026-08-20', '', '', '1234567890AB', '', '', 'Success', 5, 0, ''
  ];
  const repaired = SheetStore._repairCurrentJobRows([currentRow]);
  assert.strictEqual(repaired.changed, true);
  assert.strictEqual(repaired.rows.length, 1);
  assert.strictEqual(repaired.rows[0][4], 'Append Only');
  assert.strictEqual(repaired.rows[0][5], 'Every 10 days');
  assert.strictEqual(repaired.rows[0][8], 'job_1234567812341234');
  assert.strictEqual(repaired.rows[0][10], '1234567890AB');
})();

(function testFrequencyCanNeverInheritLegacyStrategyDropdown() {
  assert(
    sheetViews.includes('sheet.getRange(2, 1, maxDataRows, columns.FREQUENCY).clearDataValidations();'),
    'Jobs styling must clear all legacy validation through the Frequency column.'
  );
  assert(
    sheetViews.includes('sheet.getRange(2, columns.BEHAVIOR, validationRows, 1).setDataValidation(behavior);'),
    'Behavior validation must be applied only to the Behavior column.'
  );
  assert(
    !/getRange\(2,\s*columns\.FREQUENCY[^\n]*\)\.setDataValidation/.test(sheetViews),
    'Frequency must remain free text so it cannot receive the MIRROR / APPEND dropdown.'
  );
})();

(function testSchedulerRefreshIsTargeted() {
  assert(scheduler.includes('ns.SheetStore.refreshSchedule();'));
  assert(scheduler.includes('ns.SheetStore.refreshDashboard();'));
  assert(!scheduler.includes('ns.SheetStore.refreshAllViews();'));
})();

(function testJobWritesDoNotRenderAfterEveryResult() {
  const successBlock = sheetStoreSource.slice(
    sheetStoreSource.indexOf('updateJobSuccess: function'),
    sheetStoreSource.indexOf('updateJobError: function')
  );
  const errorBlock = sheetStoreSource.slice(
    sheetStoreSource.indexOf('updateJobError: function'),
    sheetStoreSource.indexOf('updateConfigurationError: function')
  );
  assert(!successBlock.includes('refreshJobsStatus'));
  assert(!errorBlock.includes('refreshJobsStatus'));
  assert(sheetStoreSource.includes('refreshRunViews();'));
})();

console.log('Sheet repair and scheduler performance checks passed.');
