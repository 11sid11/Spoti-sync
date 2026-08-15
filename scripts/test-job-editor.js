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
context.SpotiSync.Storage = {
  documentProperties() {
    return { getProperty() { return ''; }, setProperty() {} };
  },
  getClientId() { return ''; },
  getDocumentStatus() { return {}; }
};
context.SpotiSync.Auth = {
  isConnected() { return true; },
  getRedirectUri() { return 'https://script.google.com/macros/d/test/usercallback'; }
};
context.SpotiSync.Scheduler = {
  getStatus() { return { enabled: false, triggerCount: 0, automatedJobs: 0 }; }
};
context.SpotiSync.UpdateChecker = {
  getCachedStatus() { return {}; },
  statusLabel() { return 'Not checked'; }
};
load('92_JobEditor.gs');

const { JobEditor, SheetStore } = context.SpotiSync;
const editorSource = fs.readFileSync(path.join(root, 'src', '92_JobEditor.gs'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'src', '90_Ui.gs'), 'utf8');
const entrypoints = fs.readFileSync(path.join(root, 'src', '99_Entrypoints.gs'), 'utf8');
const sheetViews = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');

(function testPlaylistNormalization() {
  const playlist = JobEditor._normalizePlaylist({
    id: '1234567890AB',
    name: 'Road Trip',
    public: true,
    owner: { id: 'sid', display_name: 'Sid' },
    items: { total: 42 },
    external_urls: { spotify: 'https://open.spotify.com/playlist/1234567890AB' }
  });
  assert.strictEqual(playlist.id, '1234567890AB');
  assert.strictEqual(playlist.name, 'Road Trip');
  assert.strictEqual(playlist.owner, 'Sid');
  assert.strictEqual(playlist.itemCount, 42);
})();

(function testDuplicatePlaylistNamesStayIdBased() {
  const catalog = [
    { id: 'AAAAAAAAAAAA', name: 'Road Trip' },
    { id: 'BBBBBBBBBBBB', name: 'Road Trip' }
  ];
  assert.strictEqual(JobEditor._findPlaylistById(catalog, 'BBBBBBBBBBBB').id, 'BBBBBBBBBBBB');
})();

(function testOldPresentationLabelsAreCleanedForV14Cards() {
  assert.strictEqual(JobEditor._cleanStoredLabel('Playlist · Road Trip ↗'), 'Road Trip');
  assert.strictEqual(JobEditor._cleanStoredLabel('Shareable Likes ↗'), 'Shareable Likes');
  assert.strictEqual(JobEditor._cleanStoredLabel('Open playlist ↗'), '');
})();

(function testAutomationModelIsOnlyOffDailyOrInterval() {
  assert.strictEqual(JobEditor._automationForJob({ enabled: false, intervalDays: 10 }), 'OFF');
  assert.strictEqual(JobEditor._automationForJob({ enabled: true, intervalDays: 1 }), 'DAILY');
  assert.strictEqual(JobEditor._automationForJob({ enabled: true, intervalDays: 21 }), 'INTERVAL');

  assert.strictEqual(JobEditor._intervalForPayload({ automation: 'OFF', intervalDays: 21 }), 21);
  assert.strictEqual(JobEditor._intervalForPayload({ automation: 'DAILY', intervalDays: 99 }), 1);
  assert.strictEqual(JobEditor._intervalForPayload({ automation: 'INTERVAL', intervalDays: 21 }), 21);
  assert.throws(() => JobEditor._intervalForPayload({ automation: 'INTERVAL', intervalDays: 0 }), /1 to 3650/);
  assert.throws(() => JobEditor._intervalForPayload({ automation: 'INTERVAL', intervalDays: 3651 }), /1 to 3650/);
})();

(function testExistingJobEditorConfigMapsEnabledToAutomationWithoutChangingIds() {
  const job = {
    jobId: 'job_keep',
    name: 'Archive',
    enabled: false,
    sourceType: 'PLAYLIST',
    sourcePlaylist: '1234567890AB',
    sourceLabel: 'Playlist · Road Trip ↗',
    targetPlaylist: 'ABCDEFGHIJKL',
    targetLabel: 'Archive ↗',
    strategy: 'APPEND',
    intervalDays: 21,
    heartbeatEnabled: false
  };
  const config = JobEditor._editorConfig(job);
  assert.strictEqual(config.jobId, 'job_keep');
  assert.strictEqual(config.sourcePlaylistId, '1234567890AB');
  assert.strictEqual(config.targetPlaylistId, 'ABCDEFGHIJKL');
  assert.strictEqual(config.automation, 'OFF');
  assert.strictEqual(config.intervalDays, 21);
  assert.strictEqual(config.heartbeatEnabled, false);
})();

(function testJobServiceOwnsCatalogButHomeDoesNotFetchIt() {
  const homeBlock = editorSource.slice(
    editorSource.indexOf('function homeModel()'),
    editorSource.indexOf('function ensureCurrentPlaylist')
  );
  const editorBlock = editorSource.slice(
    editorSource.indexOf('function editorModel('),
    editorSource.indexOf('function intervalForPayload')
  );
  assert(!homeBlock.includes('getCatalog('), 'Opening app home must not load Spotify playlist catalog.');
  assert(editorBlock.includes('getCatalog(false)'), 'Add/Edit may lazy-load the playlist catalog.');
  assert(editorSource.includes('CacheService.getUserCache()'), 'Catalog must remain short-lived cached.');
  assert(editorSource.includes("catalogWarning = 'Playlist list could not be loaded."), 'Editor must preserve manual URL fallback if catalog fails.');
})();

(function testSingleSurfaceMenuAndSidebarOwnership() {
  assert(entrypoints.includes(".addItem('Open Spoti Sync', 'spotiSyncOpenApp')"));
  assert(!entrypoints.includes(".addItem('Add Job"));
  assert(!entrypoints.includes(".addItem('Edit Selected Job"));
  assert(!entrypoints.includes(".addItem('Enable Daily Scheduler"));
  assert(!entrypoints.includes(".addItem('Disable Scheduler"));
  assert(!entrypoints.includes(".addItem('Preview Enabled Jobs"));
  assert(!entrypoints.includes(".addItem('Sync Now'"));

  assert(uiSource.includes('YOUR JOBS') || uiSource.includes('Your jobs'));
  assert(uiSource.includes('+ Add job'));
  assert(uiSource.includes('Automation'));
  assert(uiSource.includes('Show Spoti Sync status in playlist description'));
  assert(uiSource.includes('Delete job'));
  assert(uiSource.includes('Sync now'));
  assert(!uiSource.includes('Spoti Sync Setup'));
})();

(function testJobEditorNoLongerContainsSecondSidebarImplementation() {
  assert(!editorSource.includes('showSidebar('));
  assert(!editorSource.includes('function editorHtml('));
  assert(!editorSource.includes('selectedJobConfig'));
  assert(!editorSource.includes('getActiveRange()'));
  assert(!editorSource.includes('applyFriendlyPlaylistLinks'));
  assert(editorSource.includes('ns.SheetStore.upsertJob('));
  assert(editorSource.includes('ns.Scheduler.reconcile({ refresh: false })'));
})();

(function testSheetIsNotASecondConfigurationSurface() {
  assert(!sheetViews.includes('requireCheckbox()'));
  assert(!sheetViews.includes('requireValueInList('));
  assert(!sheetViews.includes('setDataValidation('));
  assert(sheetViews.includes('This sheet is status-only.'));
})();

(function testSearchStaysClientSide() {
  assert(uiSource.includes('sourceSearch'));
  assert(uiSource.includes('targetSearch'));
  assert(uiSource.includes('.oninput=function(){renderPlaylist("source");}'));
  assert(uiSource.includes('.oninput=function(){renderPlaylist("target");}'));
  assert(!uiSource.includes('spotiSyncSearchPlaylists'));
})();

console.log('v1.4 single-surface app and Job service tests passed.');
