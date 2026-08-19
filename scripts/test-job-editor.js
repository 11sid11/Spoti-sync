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
  getStatus() { return { enabled: false, mode: 'NONE', triggerCount: 0, automatedJobs: 0 }; }
};
context.SpotiSync.UpdateChecker = {
  getCachedStatus() { return {}; },
  statusLabel() { return 'Not checked'; }
};
load('92_JobEditor.gs');
load('90_Ui.gs');

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

(function testAutomationModelSupportsHoursAndPreservesDays() {
  assert.strictEqual(JobEditor._automationForJob({ enabled: false, frequencyUnit: 'DAY', frequencyInterval: 10 }), 'OFF');
  assert.strictEqual(JobEditor._automationForJob({ enabled: true, frequencyUnit: 'HOUR', frequencyInterval: 1 }), 'HOURLY');
  assert.strictEqual(JobEditor._automationForJob({ enabled: true, frequencyUnit: 'HOUR', frequencyInterval: 6 }), 'HOURS');
  assert.strictEqual(JobEditor._automationForJob({ enabled: true, frequencyUnit: 'DAY', frequencyInterval: 1 }), 'DAILY');
  assert.strictEqual(JobEditor._automationForJob({ enabled: true, frequencyUnit: 'DAY', frequencyInterval: 21 }), 'DAYS');

  let frequency = JobEditor._frequencyForPayload({ automation: 'OFF', existingFrequency: 'Every 21 days' });
  assert.strictEqual(frequency.unit, 'DAY');
  assert.strictEqual(frequency.interval, 21);
  assert.strictEqual(frequency.label, 'Every 21 days');

  frequency = JobEditor._frequencyForPayload({ automation: 'HOURLY' });
  assert.strictEqual(frequency.unit, 'HOUR');
  assert.strictEqual(frequency.interval, 1);
  assert.strictEqual(frequency.label, 'Hourly');

  frequency = JobEditor._frequencyForPayload({ automation: 'HOURS', intervalHours: 6 });
  assert.strictEqual(frequency.unit, 'HOUR');
  assert.strictEqual(frequency.interval, 6);
  assert.strictEqual(frequency.label, 'Every 6 hours');

  frequency = JobEditor._frequencyForPayload({ automation: 'DAILY' });
  assert.strictEqual(frequency.unit, 'DAY');
  assert.strictEqual(frequency.interval, 1);
  assert.strictEqual(frequency.label, 'Daily');

  frequency = JobEditor._frequencyForPayload({ automation: 'DAYS', intervalDays: 21 });
  assert.strictEqual(frequency.unit, 'DAY');
  assert.strictEqual(frequency.interval, 21);
  assert.strictEqual(frequency.label, 'Every 21 days');

  // A stale v1.4 sidebar that remained open during an update is still safe.
  frequency = JobEditor._frequencyForPayload({ automation: 'INTERVAL', intervalDays: 10 });
  assert.strictEqual(frequency.unit, 'DAY');
  assert.strictEqual(frequency.interval, 10);

  assert.throws(() => JobEditor._frequencyForPayload({ automation: 'HOURS', intervalHours: 0 }), /1 to 23/);
  assert.throws(() => JobEditor._frequencyForPayload({ automation: 'HOURS', intervalHours: 24 }), /1 to 23/);
  assert.throws(() => JobEditor._frequencyForPayload({ automation: 'DAYS', intervalDays: 0 }), /1 to 3650/);
  assert.throws(() => JobEditor._frequencyForPayload({ automation: 'DAYS', intervalDays: 3651 }), /1 to 3650/);
})();

(function testExistingDayJobEditorConfigPreservesIdsAndFrequency() {
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
    frequencyUnit: 'DAY',
    frequencyInterval: 21,
    frequencyLabel: 'Every 21 days',
    intervalDays: 21,
    intervalHours: null,
    heartbeatEnabled: false
  };
  const config = JobEditor._editorConfig(job);
  assert.strictEqual(config.jobId, 'job_keep');
  assert.strictEqual(config.sourcePlaylistId, '1234567890AB');
  assert.strictEqual(config.targetPlaylistId, 'ABCDEFGHIJKL');
  assert.strictEqual(config.automation, 'OFF');
  assert.strictEqual(config.frequency, 'Every 21 days');
  assert.strictEqual(config.intervalDays, 21);
  assert.strictEqual(config.heartbeatEnabled, false);
})();

(function testExistingHourlyJobEditorConfigInitializesCorrectly() {
  const job = {
    jobId: 'job_hour',
    name: 'Fast sync',
    enabled: true,
    sourceType: 'LIKED_SONGS',
    sourcePlaylist: '',
    sourceLabel: 'Liked Songs',
    targetPlaylist: 'ABCDEFGHIJKL',
    targetLabel: 'Fast target',
    strategy: 'MIRROR',
    frequencyUnit: 'HOUR',
    frequencyInterval: 6,
    frequencyLabel: 'Every 6 hours',
    intervalDays: null,
    intervalHours: 6,
    heartbeatEnabled: true
  };
  const config = JobEditor._editorConfig(job);
  assert.strictEqual(config.automation, 'HOURS');
  assert.strictEqual(config.frequency, 'Every 6 hours');
  assert.strictEqual(config.intervalHours, 6);
})();

(function testCanonicalFrequencyParserOwnsHourlyValidation() {
  let parsed = SheetStore.parseFrequency('Hourly');
  assert.strictEqual(parsed.unit, 'HOUR');
  assert.strictEqual(parsed.interval, 1);
  parsed = SheetStore.parseFrequency('Every 12 hours');
  assert.strictEqual(parsed.unit, 'HOUR');
  assert.strictEqual(parsed.interval, 12);
  parsed = SheetStore.parseFrequency('Daily');
  assert.strictEqual(parsed.unit, 'DAY');
  assert.strictEqual(parsed.interval, 1);
  parsed = SheetStore.parseFrequency('Every 7 days');
  assert.strictEqual(parsed.unit, 'DAY');
  assert.strictEqual(parsed.interval, 7);
  assert.throws(() => SheetStore.parseFrequency('Every 24 hours'), /Use Daily for 24 hours/);
})();

(function testJobServiceOwnsCatalogButHomeDoesNotFetchIt() {
  const homeBlock = editorSource.slice(
    editorSource.indexOf('function homeModel()'),
    editorSource.indexOf('function ensureCurrentPlaylist')
  );
  const editorBlock = editorSource.slice(
    editorSource.indexOf('function editorModel('),
    editorSource.indexOf('function frequencyForPayload')
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
  assert(uiSource.includes('intervalHours'));
  assert(uiSource.includes('intervalDays'));
  assert(uiSource.includes('Show Spoti Sync status in playlist description'));
  assert(uiSource.includes('Delete job'));
  assert(uiSource.includes('Sync now'));
  assert(!uiSource.includes('Spoti Sync Setup'));
})();

(function testGeneratedSidebarBootIsBrowserSafe() {
  const html = context.SpotiSync.Ui._appHtml({
    version: '1.5.0',
    connected: true,
    clientIdHint: '',
    redirectUri: '',
    spotifyDashboardUrl: '',
    projectUrl: '',
    automation: { enabled: false, automatedJobs: 0 },
    jobs: []
  });
  const match = html.match(/<script>([\s\S]*?)<\/script>/);

  assert(html.includes('Loading Spoti Sync…'), 'Static sidebar boot content must exist before JavaScript runs.');
  assert(match, 'Production appHtml must emit a client script.');

  const clientScript = match[1];
  assert.doesNotThrow(() => new vm.Script(clientScript), 'Generated sidebar JavaScript must parse successfully.');
  assert(!/\b(?:function|var|let|const|class)\s+top\b/.test(clientScript), 'Sidebar must not redeclare the browser top global.');
  assert(clientScript.includes('function renderHeader()'), 'Sidebar header helper should use an unambiguous identifier.');
  assert(clientScript.includes('window.addEventListener("error"'), 'Runtime boot errors must have a visible fallback.');
  assert(clientScript.includes('window.addEventListener("unhandledrejection"'), 'Unhandled promise rejections must have a visible fallback.');
  assert(clientScript.includes('Spoti Sync could not start.'), 'Boot failure must render a useful message.');
  assert(clientScript.includes('google.script.run.withSuccessHandler'), 'Apps Script RPC bridge must remain wired.');
  assert(clientScript.includes('spotiSyncGetAppHome'), 'Home refresh must still use the canonical app-home RPC.');
  assert(clientScript.includes('r.innerHTML=html'), 'Successful render must replace the static loading state.');
  assert(clientScript.includes('renderHome(STATE);'), 'Initial home render must still occur from the embedded model.');
})();

(function testAutomationOptionsComeFromServerModel() {
  const editorBlock = editorSource.slice(
    editorSource.indexOf('function editorModel('),
    editorSource.indexOf('function frequencyForPayload')
  );
  ['Off', 'Hourly', 'Every N hours', 'Daily', 'Every N days'].forEach((label) => {
    assert(editorBlock.includes(`label: '${label}'`), `Missing automation option: ${label}`);
  });
  assert(uiSource.includes('(EDITOR.automationOptions||[]).map'), 'Sidebar should render canonical server automation options.');
  assert(!uiSource.includes('value=\\"INTERVAL\\"'), 'Legacy INTERVAL must not be exposed as a new UI option.');
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

console.log('v1.5 single-surface app, hourly automation, sidebar boot, and Job service tests passed.');
