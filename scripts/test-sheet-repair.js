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

(function testCheckboxAndPresentationOnlyFutureRowsAreNotJobs() {
  const realJob = [
    true, 'Shareable Likes', 'Liked Songs', 'Open playlist ↗', 'Exact Mirror', 'Daily',
    '✓ Healthy', '2026-08-16', 'job_keep', '', '1234567890AB', '', '', 'Success', 0, 0, ''
  ];
  const checkboxOnly = [false, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const pollutedPresentationOnly = [false, '', 'Liked Songs', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const rows = [realJob]
    .concat(Array.from({ length: 24 }, () => checkboxOnly.slice()))
    .concat(Array.from({ length: 25 }, () => pollutedPresentationOnly.slice()));

  assert.strictEqual(SheetStore.isConfiguredJobRow(realJob), true);
  rows.slice(1).forEach((row) => assert.strictEqual(SheetStore.isConfiguredJobRow(row), false));

  const repaired = SheetStore._repairCurrentJobRows(rows);
  assert.strictEqual(repaired.changed, false);
  assert.strictEqual(repaired.rows.length, 1);
  assert.strictEqual(repaired.rows[0][8], 'job_keep');
  assert.strictEqual(repaired.rows[0][10], '1234567890AB');

  const parsed = SheetStore._parseJobRows(rows, 2);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.jobs[0].name, 'Shareable Likes');
  assert.strictEqual(parsed.jobs[0].targetPlaylist, '1234567890AB');
})();

(function testCanonicalFrequencyAndBehaviorConfiguration() {
  const expectedPresets = [
    'Daily', 'Every 2 days', 'Every 3 days', 'Every 7 days', 'Every 10 days',
    'Every 14 days', 'Every 30 days', 'Every 60 days', 'Every 90 days'
  ];
  const limits = SheetStore.frequencyLimits();

  assert.deepStrictEqual(Array.from(SheetStore.frequencyPresets()), expectedPresets);
  assert.strictEqual(limits.min, 1);
  assert.strictEqual(limits.max, 3650);
  assert.deepStrictEqual(Array.from(SheetStore.behaviorOptions()), ['Exact Mirror', 'Append Only']);

  assert.strictEqual(SheetStore._parseFrequency('Daily'), 1);
  assert.strictEqual(SheetStore._parseFrequency('Every 10 days'), 10);
  assert.strictEqual(SheetStore._parseFrequency('Every 21 days'), 21);
  assert.throws(() => SheetStore._parseFrequency('Every 0 days'), /1 to 3650/);
  assert.throws(() => SheetStore._parseFrequency('Every 3651 days'), /1 to 3650/);

  assert.strictEqual(SheetStore._parseBehaviorLabel('Exact Mirror'), 'MIRROR');
  assert.strictEqual(SheetStore._parseBehaviorLabel('Append Only'), 'APPEND');
})();

(function testSheetViewsConsumesCanonicalConfiguration() {
  assert(
    sheetViews.includes('var behaviorOptions = ns.SheetStore.behaviorOptions();'),
    'SheetViews must consume canonical Behavior options.'
  );
  assert(
    sheetViews.includes('var frequencyPresets = ns.SheetStore.frequencyPresets();'),
    'SheetViews must consume canonical Frequency presets.'
  );
  assert(
    sheetViews.includes('var frequencyLimits = ns.SheetStore.frequencyLimits();'),
    'SheetViews must consume canonical Frequency limits.'
  );
  assert(
    !sheetViews.includes("var frequencyPresets = ["),
    'SheetViews must not define a second Frequency preset list.'
  );
  assert(
    !sheetViews.includes("requireValueInList(['Exact Mirror', 'Append Only']"),
    'SheetViews must not define a second Behavior option list.'
  );
  assert(
    sheetViews.includes('.requireValueInList(frequencyPresets, true)'),
    'Frequency validation must expose canonical presets.'
  );
  assert(
    sheetViews.includes('.setAllowInvalid(true)'),
    'Frequency validation must continue allowing custom Every N days schedules.'
  );
})();

(function testSourceColumnIsPresentationOnly() {
  assert(
    sheetViews.includes('sheet.getRange(2, 1, validationRows, 1).setDataValidation(checkbox);'),
    'Enabled must retain checkbox validation.'
  );
  assert(
    sheetViews.includes('sheet.getRange(2, columns.BEHAVIOR, validationRows, 1).setDataValidation(behavior);'),
    'Behavior must retain its dropdown validation.'
  );
  assert(
    sheetViews.includes('sheet.getRange(2, columns.FREQUENCY, validationRows, 1).setDataValidation(frequency);'),
    'Frequency must retain its dropdown validation.'
  );
  assert(
    !sheetViews.includes("requireValueInList(['Liked Songs', 'Playlist ↗']"),
    'SheetViews must not create the obsolete Source dropdown.'
  );
  assert(
    !sheetViews.includes('columns.SOURCE, validationRows, 1).setDataValidation'),
    'Source must remain presentation-only and receive no SheetViews validation.'
  );
  assert(
    !sheetViews.includes('function applyPlaylistLinks(sheet)'),
    'Friendly Source/Target presentation must remain owned by JobEditor.'
  );
})();

(function testRuntimeSourceIdentityUsesHiddenPlaylistId() {
  const playlistRow = [
    true, 'Playlist mirror', 'Completely arbitrary presentation', 'Target presentation',
    'Exact Mirror', 'Daily', '', '', 'job_playlist', '1234567890AB', 'ABCDEFGHIJKL', '', '', '', 0, 0, ''
  ];
  const likedRow = [
    true, 'Liked mirror', 'Also arbitrary presentation', 'Target presentation',
    'Exact Mirror', 'Daily', '', '', 'job_liked', '', 'ABCDEFGHIJKL', '', '', '', 0, 0, ''
  ];
  const parsed = SheetStore._parseJobRows([playlistRow, likedRow], 2);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.jobs.length, 2);
  assert.strictEqual(parsed.jobs[0].sourceType, 'PLAYLIST');
  assert.strictEqual(parsed.jobs[0].sourcePlaylist, '1234567890AB');
  assert.strictEqual(parsed.jobs[1].sourceType, 'LIKED_SONGS');
  assert.strictEqual(parsed.jobs[1].sourcePlaylist, '');
})();

(function testLegacySourceLabelsRemainMigrationOnlyCompatibility() {
  const migrated = SheetStore._legacyJobToStoredRow([
    true, 'Legacy', 'LIKED_SONGS', '', '1234567890AB', 'MIRROR', 1,
    '', '', '', 0, 0, ''
  ]);
  assert.strictEqual(migrated[2], 'Liked Songs');
  assert.strictEqual(migrated[4], 'Exact Mirror');
  assert.strictEqual(migrated[5], 'Daily');
  assert.strictEqual(migrated[10], '1234567890AB');
})();

(function testJobsMigrationIsExplicitBoundedAndNonDestructiveToFormatting() {
  assert(
    sheetStoreSource.includes('ensureJobsSheet({ repair: true });'),
    'Initialize / Repair Sheets must be the explicit current-layout repair entry point.'
  );
  assert(
    sheetStoreSource.includes('if (settings.repair && lastRow > 1)'),
    'Normal ensureJobsSheet calls must not repair/rewrite the current Jobs layout.'
  );
  assert(
    !sheetStoreSource.includes('sheet.clearFormats();'),
    'Jobs/Activity migration must not clear whole-sheet formatting.'
  );
  assert(
    !sheetStoreSource.includes('sheet.getMaxRows()') && !sheetStoreSource.includes('sheet.getMaxColumns()'),
    'Migration must be bounded to the used Spoti Sync range rather than the entire sheet.'
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

console.log('Sheet repair, configuration ownership, Frequency UX, and scheduler performance checks passed.');
