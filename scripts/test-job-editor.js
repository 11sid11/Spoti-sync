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
const entrypoints = fs.readFileSync(path.join(root, 'src', '99_Entrypoints.gs'), 'utf8');

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

(function testFriendlyPlaylistSourceStillParses() {
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

(function testExecutionBudgetAndSafetyGuards() {
  assert(editorSource.includes('CacheService.getUserCache()'));
  assert(editorSource.includes("'/me/playlists?limit=50&offset=0'"));
  assert(editorSource.includes("'/me/playlists'"));
  assert(editorSource.includes('clearDataValidations()'));
  assert(!editorSource.includes('clearFormats()'));
  assert(!editorSource.includes('SpotiSync.Scheduler'));
  assert(!editorSource.includes('ns.Scheduler'));
  assert(editorSource.includes('sourceSearch'));
  assert(editorSource.includes('targetSearch'));
})();

(function testMenuUsesJobEditor() {
  assert(entrypoints.includes(".addItem('Add Job…', 'spotiSyncAddJob')"));
  assert(entrypoints.includes(".addItem('Edit Selected Job…', 'spotiSyncEditJob')"));
  assert(entrypoints.includes('SpotiSync.JobEditor.showAdd()'));
  assert(entrypoints.includes('SpotiSync.JobEditor.showEdit()'));
  assert(entrypoints.includes('spotiSyncSaveJobEditor'));
})();

(function testOldPromptIsRuntimeRedirected() {
  assert.strictEqual(typeof context.SpotiSync.Ui.promptAddJob, 'function');
})();

console.log('Job editor tests passed.');
