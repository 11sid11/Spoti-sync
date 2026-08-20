#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const documentStatus = {};
let fetchCount = 0;
let responseStatus = 200;
let responseBody = {
  schema: 1,
  version: '1.5.2',
  channel: 'stable',
  released_at: '2026-09-01',
  installer_url: 'https://example.com/update',
  changelog_url: 'https://example.com/changelog',
  notes: ['Test release']
};

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
  UrlFetchApp: {
    fetch() {
      fetchCount += 1;
      return {
        getResponseCode() {
          return responseStatus;
        },
        getContentText() {
          return JSON.stringify(responseBody);
        }
      };
    }
  }
});

function load(filename) {
  const code = fs.readFileSync(path.join(root, 'src', filename), 'utf8');
  vm.runInContext(code, context, { filename });
}

load('00_Core.gs');
context.SpotiSync.Storage = {
  getDocumentStatus() {
    return { ...documentStatus };
  },
  setDocumentStatus(values) {
    Object.assign(documentStatus, values);
  }
};
load('85_UpdateChecker.gs');

const { UpdateChecker, VERSION } = context.SpotiSync;

(function testForcedCheckStoresAvailableRelease() {
  const status = UpdateChecker.check({ force: true });
  assert.strictEqual(fetchCount, 1);
  assert.strictEqual(status.currentVersion, VERSION);
  assert.strictEqual(status.latestVersion, '1.5.2');
  assert.strictEqual(status.updateAvailable, true);
  assert.strictEqual(status.checkStatus, 'Update available');
  assert.strictEqual(status.installerUrl, 'https://example.com/update');
})();

(function testNormalCheckUsesDailyCache() {
  const status = UpdateChecker.check({ force: false });
  assert.strictEqual(fetchCount, 1, 'Fresh cached status must avoid another GitHub request.');
  assert.strictEqual(status.latestVersion, '1.5.2');
})();

(function testCachedAvailabilityRecomputesAfterCodeUpgrade() {
  const installedVersion = context.SpotiSync.VERSION;
  context.SpotiSync.VERSION = '1.5.2';
  const status = UpdateChecker.getCachedStatus();
  assert.strictEqual(status.currentVersion, '1.5.2');
  assert.strictEqual(status.latestVersion, '1.5.2');
  assert.strictEqual(status.updateAvailable, false);
  assert.strictEqual(status.checkStatus, 'Up to date');
  context.SpotiSync.VERSION = installedVersion;
})();

(function testForcedCheckCanMarkCurrent() {
  responseBody = {
    ...responseBody,
    version: VERSION,
    notes: ['Current release']
  };
  const status = UpdateChecker.check({ force: true });
  assert.strictEqual(fetchCount, 2);
  assert.strictEqual(status.updateAvailable, false);
  assert.strictEqual(status.checkStatus, 'Up to date');
})();

(function testFetchFailureIsNonFatalByDefault() {
  responseStatus = 503;
  const status = UpdateChecker.check({ force: true });
  assert.strictEqual(fetchCount, 3);
  assert.strictEqual(status.checkStatus, 'Check failed');
  assert.match(status.error, /HTTP 503/);
})();

(function testFetchFailureCanBeRaisedForDiagnostics() {
  assert.throws(
    () => UpdateChecker.check({ force: true, throwOnError: true }),
    /HTTP 503/
  );
  assert.strictEqual(fetchCount, 4);
})();

(function testFailedCheckRetriesAfterShorterWindow() {
  responseStatus = 200;
  responseBody = {
    ...responseBody,
    version: '1.5.2'
  };
  documentStatus.UPDATE_LAST_CHECK_AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const status = UpdateChecker.check({ force: false });
  assert.strictEqual(fetchCount, 5, 'A failed check older than the retry window must fetch again.');
  assert.strictEqual(status.updateAvailable, true);
  assert.strictEqual(status.checkStatus, 'Update available');
})();

console.log('Update checker behavior tests passed.');
