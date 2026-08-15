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
    getUuid() { return '12345678-1234-1234-1234-123456789abc'; },
    formatDate(date, timezone, pattern) {
      if (pattern === 'yyyy-MM-dd') { return date.toISOString().slice(0, 10); }
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
context.SpotiSync.Storage = {
  documentProperties() {
    return {
      getProperty() { return ''; },
      setProperty() {}
    };
  }
};
context.SpotiSync.SheetViews = {
  refreshJobsStatus() {},
  refreshSchedule() {},
  refreshDashboard() {},
  refreshAll() {}
};
context.SpotiSync.Ui = {};
load('92_JobEditor.gs');

const { JobEditor, SheetStore } = context.SpotiSync;
const editorSource = fs.readFileSync(path.join(root, 'src', '92_JobEditor.gs'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'src', '90_Ui.gs'), 'utf8');
const entrypoints = fs.readFileSync(path.join(root, 'src', '99_Entrypoints.gs'), 'utf8');
const sheetStoreSource = fs.readFileSync(path.join(root, 'src', '60_SheetStore.gs'), 'utf8');
const sheetViews = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');

(function testPlaylistNormalization() {
  const playlist = JobEditor._normalizePlaylist({
    id: '1234567890AB',
    name: 'Road Trip',
    public: true,
    collaborative: false,
    owner: { id: 'sid', display_name: 'Sid' },
    items: { total: 42 },
    external_urls: { spotify: 'https://open.spotify.com/playlist/1234567890AB' }
  });
  assert.strictEqual(playlist.id, '1234567890AB');
  assert.strictEqual(playlist.name, 'Road Trip');
  assert.strictEqual(playlist.owner, 'Sid');
  assert.strictEqual(playlist.itemCount, 42);
})();

(function testDuplicateNamesAreResolvedById() {
  const catalog = [
    { id: 'AAAAAAAAAAAA', name: 'Road Trip' },
    { id: 'BBBBBBBBBBBB', name: 'Road Trip' }
  ];
  assert.strictEqual(JobEditor._findPlaylistById(catalog, 'BBBBBBBBBBBB').id, 'BBBBBBBBBBBB');
})();

(function testFriendlyLabels() {
  assert.strictEqual(JobEditor._sourceDisplay('Road Trip'), 'Playlist · Road Trip ↗');
  assert.strictEqual(JobEditor._targetDisplay('Shareable Likes'), 'Shareable Likes ↗');
  assert.strictEqual(JobEditor._stripFriendlyLabel('Playlist · Road Trip ↗'), 'Road Trip');
  assert.strictEqual(JobEditor._stripFriendlyLabel('Open playlist ↗'), '');
})();

(function testFriendlyPlaylistSourceStillParsesFromHiddenId() {
  const parsed = SheetStore._parseJobRows([[
    true,
    'Playlist mirror',
    'Playlist · Road Trip ↗',
    'Road Trip Copy ↗',
    'Exact Mirror',
    'Daily',
    '', '',
    'job_123',
    '1234567890AB',
    'ABCDEFGHIJKL',
    '', '', '', 0, 0, ''
  ]], 2);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.jobs[0].sourceType, 'PLAYLIST');
  assert.strictEqual(parsed.jobs[0].sourcePlaylist, '1234567890AB');
  assert.strictEqual(parsed.jobs[0].targetPlaylist, 'ABCDEFGHIJKL');
})();

(function testFriendlyRenderingKeepsFutureRowsEmpty() {
  const columns = SheetStore._jobColumns;
  const likedJob = [
    true, 'Shareable Likes', 'Liked Songs', 'Shareable Likes ↗', 'Exact Mirror', 'Daily', '', '',
    'job_liked', '', 'ABCDEFGHIJKL', '', '', '', 0, 0, ''
  ];
  const playlistJob = [
    true, 'Road Trip Mirror', 'Playlist · Road Trip ↗', 'Road Trip Copy ↗', 'Exact Mirror', 'Every 7 days', '', '',
    'job_playlist', '1234567890AB', 'ZYXWVUTSRQPO', '', '', '', 0, 0, ''
  ];
  const pollutedEmptyRows = Array.from({ length: 49 }, () => [
    false, '', 'Liked Songs', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
  ]);

  assert.strictEqual(SheetStore.isConfiguredJobRow(likedJob), true);
  assert.strictEqual(SheetStore.isConfiguredJobRow(playlistJob), true);
  pollutedEmptyRows.forEach((row) => {
    assert.strictEqual(SheetStore.isConfiguredJobRow(row), false);
  });

  const likedPresentation = JobEditor._presentationForRow(likedJob, columns);
  assert.strictEqual(likedPresentation.sourceText, 'Liked Songs');
  assert.strictEqual(likedPresentation.targetText, 'Shareable Likes ↗');

  const playlistPresentation = JobEditor._presentationForRow(playlistJob, columns);
  assert.strictEqual(playlistPresentation.sourceText, 'Playlist · Road Trip ↗');
  assert.strictEqual(playlistPresentation.targetText, 'Road Trip Copy ↗');
  assert.strictEqual(playlistPresentation.sourceUrl, 'https://open.spotify.com/playlist/1234567890AB');
  assert.strictEqual(playlistPresentation.targetUrl, 'https://open.spotify.com/playlist/ZYXWVUTSRQPO');

  pollutedEmptyRows.forEach((row) => {
    const presentation = JobEditor._presentationForRow(row, columns);
    assert.strictEqual(presentation.sourceText, '');
    assert.strictEqual(presentation.targetText, '');

    const cleaned = row.slice();
    cleaned[columns.SOURCE - 1] = presentation.sourceText;
    cleaned[columns.TARGET - 1] = presentation.targetText;
    const parsed = SheetStore._parseJobRows([cleaned], 2);
    assert.strictEqual(parsed.jobs.length, 0);
    assert.strictEqual(parsed.errors.length, 0);
  });
})();

(function testFrequencyEditorInitializesPresetAndCustomSchedules() {
  const presets = SheetStore.frequencyPresets();
  const daily = JobEditor._frequencyEditorState('Daily', 1, presets);
  const tenDays = JobEditor._frequencyEditorState('Every 10 days', 10, presets);
  const custom = JobEditor._frequencyEditorState('Every 21 days', 21, presets);

  assert.strictEqual(daily.selection, 'Daily');
  assert.strictEqual(daily.customDays, 1);
  assert.strictEqual(tenDays.selection, 'Every 10 days');
  assert.strictEqual(tenDays.customDays, 10);
  assert.strictEqual(custom.selection, '__CUSTOM__');
  assert.strictEqual(custom.customDays, 21);
})();

(function testFrequencyEditorSubmitsCanonicalLabelsToServerParser() {
  assert.strictEqual(JobEditor._frequencyRequestLabel('Daily', ''), 'Daily');
  assert.strictEqual(JobEditor._frequencyRequestLabel('Every 10 days', ''), 'Every 10 days');
  assert.strictEqual(JobEditor._frequencyRequestLabel('__CUSTOM__', 21), 'Every 21 days');
  assert.strictEqual(SheetStore._parseFrequency(JobEditor._frequencyRequestLabel('__CUSTOM__', 21)), 21);
  assert.throws(
    () => SheetStore._parseFrequency(JobEditor._frequencyRequestLabel('__CUSTOM__', 0)),
    /1 to 3650/
  );
  assert.throws(
    () => SheetStore._parseFrequency(JobEditor._frequencyRequestLabel('__CUSTOM__', 3651)),
    /1 to 3650/
  );
})();

(function testJobEditorConsumesCanonicalConfiguration() {
  assert(editorSource.includes('ns.SheetStore.frequencyPresets()'));
  assert(editorSource.includes('ns.SheetStore.frequencyLimits()'));
  assert(editorSource.includes('ns.SheetStore.behaviorOptions()'));
  assert(editorSource.includes('ns.SheetStore.createJobId()'));
  assert(editorSource.includes('ns.SheetStore.isConfiguredJobRow(row)'));
  assert(!editorSource.includes('var FREQUENCY_PRESETS = ['));
  assert(!editorSource.includes('function newJobId()'));
  assert(!editorSource.includes('<datalist'));
  assert(editorSource.includes('Custom interval…'));
  assert(editorSource.includes('id="frequencyPreset"'));
  assert(editorSource.includes('id="customFrequencyDays" type="number"'));
})();

(function testExecutionBudgetAndSafetyGuards() {
  assert(editorSource.includes('CacheService.getUserCache()'));
  assert(editorSource.includes("'/me/playlists?limit=' + ns.Constants.PAGE_SIZE + '&offset=0'"));
  assert(editorSource.includes("'/me/playlists'"));
  assert(editorSource.includes('clearDataValidations()'));
  assert(!editorSource.includes('clearFormats()'));
  assert(!editorSource.includes('SpotiSync.Scheduler'));
  assert(!editorSource.includes('ns.Scheduler'));
  assert(editorSource.includes('sourceSearch'));
  assert(editorSource.includes('targetSearch'));
})();

(function testMenuUsesOnlyJobEditorImplementation() {
  assert(entrypoints.includes(".addItem('Add Job…', 'spotiSyncAddJob')"));
  assert(entrypoints.includes(".addItem('Edit Selected Job…', 'spotiSyncEditJob')"));
  assert(entrypoints.includes('SpotiSync.JobEditor.showAdd()'));
  assert(entrypoints.includes('SpotiSync.JobEditor.showEdit()'));
  assert(entrypoints.includes('spotiSyncSaveJobEditor'));
  assert(!uiSource.includes('promptAddJob: function'));
  assert(!editorSource.includes('ns.Ui.promptAddJob'));
  assert(!sheetStoreSource.includes('addJob: function'));
  assert(!sheetStoreSource.includes('function storedRowForNewJob'));
})();

(function testRepairEntrypointsShareOneImplementation() {
  assert(entrypoints.includes('function spotiSyncInitializeSheetsCore_()'));
  assert(entrypoints.includes('return spotiSyncInitializeSheetsCore_();'));
  assert(entrypoints.includes('spotiSyncInitializeSheetsCore_();'));
  assert(!entrypoints.includes('spotiSyncPrepareJobsForRepair_'));
})();

(function testViewIntegrationIsExplicitNotMonkeyPatched() {
  assert(sheetViews.includes('ns.JobEditor.applyFriendlyPlaylistLinks();'));
  assert(!editorSource.includes('originalRefreshJobsStatus'));
  assert(!editorSource.includes('originalRefreshAll'));
})();

(function testSetupDoesNotImmediatelyRenderTwice() {
  const setupBlock = uiSource.slice(
    uiSource.indexOf('showSetup: function'),
    uiSource.indexOf('showOAuthResult: function')
  );
  assert(setupBlock.includes('ns.SheetStore.initialize();'));
  assert(!setupBlock.includes('refreshAllViews'));
})();

console.log('Job editor ownership, playlist presentation, and Frequency UX tests passed.');
