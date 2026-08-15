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

const { SheetStore } = context.SpotiSync;
const sheetStoreSource = fs.readFileSync(path.join(root, 'src', '60_SheetStore.gs'), 'utf8');
const sheetViews = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');

(function testV138RowMigratesWithoutChangingIdsAndEnablesHeartbeat() {
  const v138 = [
    true, 'Shareable Likes', 'Liked Songs', 'Shareable Likes ↗', 'Exact Mirror', 'Daily',
    '✓ Healthy', '2026-08-16', 'job_keep', '', '1234567890AB',
    '', '', 'Success', 3, 1, ''
  ];
  const repaired = SheetStore._repairCurrentJobRows([v138]);
  assert.strictEqual(repaired.rows.length, 1);
  assert.strictEqual(repaired.rows[0][8], 'job_keep');
  assert.strictEqual(repaired.rows[0][10], '1234567890AB');
  assert.strictEqual(repaired.rows[0][17], true);
})();

(function testLegacyJobMigrationKeepsStableConfigurationAndDefaultsHeartbeatOn() {
  const migrated = SheetStore._legacyJobToStoredRow([
    true, 'Legacy', 'LIKED_SONGS', '', 'https://open.spotify.com/playlist/1234567890AB',
    'MIRROR', 1, '', '', 'Success', 2, 1, ''
  ]);
  assert.strictEqual(migrated[2], 'Liked Songs');
  assert.strictEqual(migrated[4], 'Exact Mirror');
  assert.strictEqual(migrated[5], 'Daily');
  assert.strictEqual(migrated[10], '1234567890AB');
  assert.strictEqual(migrated[17], true);
})();

(function testCheckboxAndPresentationOnlyRowsStillDoNotBecomeJobs() {
  const realJob = [
    true, 'Shareable Likes', 'Liked Songs', 'Shareable Likes', 'Exact Mirror', 'Daily',
    '', '', 'job_keep', '', '1234567890AB', '', '', '', 0, 0, '', true
  ];
  const checkboxOnly = [false, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const polluted = [false, '', 'Liked Songs', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const rows = [realJob]
    .concat(Array.from({ length: 24 }, () => checkboxOnly.slice()))
    .concat(Array.from({ length: 25 }, () => polluted.slice()));

  assert.strictEqual(SheetStore.isConfiguredJobRow(realJob), true);
  rows.slice(1).forEach((row) => assert.strictEqual(SheetStore.isConfiguredJobRow(row), false));

  const repaired = SheetStore._repairCurrentJobRows(rows);
  assert.strictEqual(repaired.rows.length, 1);
  assert.strictEqual(repaired.rows[0][8], 'job_keep');

  const parsed = SheetStore._parseJobRows(rows, 2);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.errors.length, 0);
})();

(function testDisabledValidJobKeepsFullConfigurationForManualSync() {
  const row = [
    false, 'Manual only', 'Liked Songs', 'Target', 'Append Only', 'Every 21 days',
    '', '', 'job_manual', '', '1234567890AB', '', '', '', 0, 0, '', false
  ];
  const parsed = SheetStore._parseJobRows([row], 2);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.jobs[0].enabled, false);
  assert.strictEqual(parsed.jobs[0].strategy, 'APPEND');
  assert.strictEqual(parsed.jobs[0].intervalDays, 21);
  assert.strictEqual(parsed.jobs[0].heartbeatEnabled, false);
  assert.strictEqual(SheetStore.getAutomationLabel(parsed.jobs[0]), 'Off');
})();

(function testCanonicalFrequencyAndBehaviorConfigurationRemainsServerOwned() {
  assert.deepStrictEqual(
    Array.from(SheetStore.frequencyPresets()),
    ['Daily', 'Every 2 days', 'Every 3 days', 'Every 7 days', 'Every 10 days',
      'Every 14 days', 'Every 30 days', 'Every 60 days', 'Every 90 days']
  );
  assert.deepStrictEqual(Array.from(SheetStore.behaviorOptions()), ['Exact Mirror', 'Append Only']);
  assert.strictEqual(SheetStore._parseFrequency('Daily'), 1);
  assert.strictEqual(SheetStore._parseFrequency('Every 21 days'), 21);
  assert.throws(() => SheetStore._parseFrequency('Every 0 days'), /1 to 3650/);
  assert.throws(() => SheetStore._parseFrequency('Every 3651 days'), /1 to 3650/);
})();

(function testJobsAreStorageOnlyInV14() {
  assert(!sheetViews.includes('requireCheckbox()'), 'SheetViews must not build Jobs configuration checkboxes.');
  assert(!sheetViews.includes('requireValueInList('), 'SheetViews must not build Jobs configuration dropdowns.');
  assert(!sheetViews.includes('refreshJobsStatus'), 'Jobs presentation refresh must be removed.');
  assert(!sheetViews.includes('applyFriendlyPlaylistLinks'), 'Hidden Jobs storage must not receive friendly-link rendering.');
  assert(sheetViews.includes('jobs.hideSheet();'), 'Jobs must be hidden/internal.');
  assert(sheetViews.includes('schedule.hideSheet();'), 'Legacy Schedule must be hidden.');
  assert(sheetViews.includes('This sheet is status-only.'), 'Summary must clearly communicate read-only ownership.');
})();

(function testMigrationRemainsExplicitBoundedAndNeverClearsFormats() {
  assert(sheetStoreSource.includes('ensureJobsSheet({ repair: true });'));
  assert(!sheetStoreSource.includes('sheet.clearFormats();'));
  assert(!sheetStoreSource.includes('sheet.getMaxRows()'));
  assert(!sheetStoreSource.includes('sheet.getMaxColumns()'));
  assert(sheetStoreSource.includes('clearDataValidations();'));
  const replacement = sheetStoreSource.slice(
    sheetStoreSource.indexOf('function replaceSheetData('),
    sheetStoreSource.indexOf('function ensureJobsSheet(')
  );
  assert(replacement.indexOf('.setValues(values);') < replacement.lastIndexOf('.clearContent();'));
})();

console.log('v1.4 storage migration and status-only Sheet ownership checks passed.');
