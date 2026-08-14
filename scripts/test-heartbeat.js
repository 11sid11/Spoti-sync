#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const properties = new Map();
const calls = [];
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
  Utilities: {
    formatDate(date, timezone, pattern) {
      assert.strictEqual(timezone, 'Asia/Kolkata');
      assert.strictEqual(pattern, "EEEE 'at' h:mm a");
      return 'Saturday at 2:22 AM';
    }
  },
  LockService: {
    getScriptLock() {
      return { tryLock: () => true, releaseLock() {} };
    }
  }
});

function load(name) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', name), 'utf8'), context, { filename: name });
}

load('00_Core.gs');
context.SpotiSync.Storage = {
  documentProperties() {
    return {
      getProperty(key) { return properties.has(key) ? properties.get(key) : null; },
      setProperty(key, value) { properties.set(key, value); }
    };
  }
};
context.SpotiSync.SheetStore = {
  getSpreadsheetTimezone() { return 'Asia/Kolkata'; }
};
context.SpotiSync.SpotifyApi = {
  updatePlaylistDescription(playlistId, description) {
    calls.push(['description', playlistId, description]);
  }
};
load('75_PlaylistHeartbeat.gs');

const job = { jobId: 'job_abc', targetPlaylist: '1234567890AB' };
const H = context.SpotiSync.PlaylistHeartbeat;

(function testDescriptionTemplate() {
  const text = H._buildDescription(job, new Date('2026-08-15T00:00:00Z'), 'Asia/Kolkata', 0);
  assert.strictEqual(text, 'Kept fresh with Spoti Sync ✨ · sid.is-a.dev · Synced Saturday at 2:22 AM');
})();

(function testPhraseRotationOnlyAfterSuccessfulUpdate() {
  const first = H.update(job, new Date('2026-08-15T00:00:00Z'));
  const second = H.update(job, new Date('2026-08-15T00:00:00Z'));
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.phraseIndex, 0);
  assert.strictEqual(second.phraseIndex, 1);
  assert(second.description.startsWith('Kept in sync with Spoti Sync 🔄'));
})();

(function testFailureIsReturnedWithoutAdvancingRotation() {
  const currentIndex = H._readIndex(job);
  context.SpotiSync.SpotifyApi.updatePlaylistDescription = function () {
    throw new Error('temporary description failure');
  };
  const result = H.update(job, new Date('2026-08-15T00:00:00Z'));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /temporary description failure/);
  assert.strictEqual(H._readIndex(job), currentIndex);
})();

// Verify sync ordering and warning semantics with minimal engine mocks.
context.SpotiSync.Sources = {
  getForJob() { return { tracks: [{ writeUri: 'spotify:track:A' }], ignoredCount: 0 }; },
  getTargetPlaylist() { return { tracks: [], ignoredCount: 0 }; },
  invalidatePlaylist() { calls.push(['invalidate']); }
};
context.SpotiSync.Strategies = {
  plan() {
    return {
      add: [{ writeUri: 'spotify:track:A' }],
      remove: [],
      removeCount: 0,
      ignored: 0,
      addMode: 'END'
    };
  }
};
context.SpotiSync.SpotifyApi.addPlaylistItems = function () { calls.push(['items']); };
context.SpotiSync.SpotifyApi.removePlaylistItems = function () { calls.push(['remove']); };
context.SpotiSync.PlaylistHeartbeat.update = function () {
  calls.push(['heartbeat']);
  return { ok: true, description: 'ok' };
};
load('70_SyncEngine.gs');

(function testHeartbeatRunsInSameJobAfterPlaylistWrites() {
  calls.length = 0;
  const summary = context.SpotiSync.SyncEngine._executeJob({
    name: 'Mirror',
    jobId: 'job_order',
    targetPlaylist: '1234567890AB',
    strategy: 'MIRROR'
  }, { sourceCache: Object.create(null) }, true);
  assert.strictEqual(summary.status, 'Success');
  const itemIndex = calls.findIndex((entry) => entry[0] === 'items');
  const heartbeatIndex = calls.findIndex((entry) => entry[0] === 'heartbeat');
  assert(itemIndex !== -1 && heartbeatIndex !== -1 && itemIndex < heartbeatIndex);
})();

(function testHeartbeatFailureDoesNotFailPlaylistSync() {
  context.SpotiSync.PlaylistHeartbeat.update = function () {
    return { ok: false, error: 'description API unavailable' };
  };
  const summary = context.SpotiSync.SyncEngine._executeJob({
    name: 'Mirror',
    jobId: 'job_warn',
    targetPlaylist: '1234567890AB',
    strategy: 'MIRROR'
  }, { sourceCache: Object.create(null) }, true);
  assert.strictEqual(summary.status, 'Success with warning');
  assert.match(summary.warning, /description API unavailable/);
})();

console.log('Playlist heartbeat tests passed.');
