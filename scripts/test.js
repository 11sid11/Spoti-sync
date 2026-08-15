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
load('50_Strategies.gs');
load('60_SheetStore.gs');
load('85_UpdateChecker.gs');

const { Core, Strategies, Constants, SheetStore, UpdateChecker, VERSION } = context.SpotiSync;

function track(id) {
  return {
    keyUri: `spotify:track:${id}`,
    writeUri: `spotify:track:${id}`,
    name: id,
    artists: '',
    addedAt: null
  };
}

function snapshot(ids, ordering = Constants.ORDERING.PRESERVE, ignoredCount = 0) {
  return {
    tracks: ids.map(track),
    ordering,
    ignoredCount
  };
}

function jobRow(overrides = {}) {
  return [
    overrides.enabled !== undefined ? overrides.enabled : true,
    overrides.name || 'Valid',
    overrides.source || 'Liked Songs',
    overrides.targetLabel || 'Open playlist ↗',
    overrides.behavior || 'Exact Mirror',
    overrides.frequency || 'Daily',
    '',
    '',
    overrides.jobId || 'job_123',
    overrides.sourcePlaylistId || '',
    overrides.targetPlaylistId || '1234567890AB',
    overrides.lastAttempt || '',
    overrides.lastSuccess || '',
    overrides.lastStatus || '',
    overrides.lastAdded || 0,
    overrides.lastRemoved || 0,
    overrides.lastError || ''
  ];
}

(function testPlaylistParsing() {
  assert.strictEqual(Core.parsePlaylistId('spotify:playlist:1234567890AB'), '1234567890AB');
  assert.strictEqual(
    Core.parsePlaylistId('https://open.spotify.com/playlist/1234567890AB?si=abc'),
    '1234567890AB'
  );
  assert.strictEqual(Core.parsePlaylistId('1234567890AB'), '1234567890AB');
  assert.throws(() => Core.parsePlaylistId('not a playlist'), /Invalid Spotify playlist/);
})();

(function testTrackNormalizationUsesCanonicalRelinkedId() {
  const normalized = Core.normalizeTrackRecord({
    added_at: '2026-08-14T00:00:00Z',
    track: {
      type: 'track',
      uri: 'spotify:track:PLAYABLE123',
      linked_from: { uri: 'spotify:track:ORIGINAL123' },
      artists: [{ name: 'Artist' }],
      name: 'Track'
    }
  });
  assert.strictEqual(normalized.keyUri, 'spotify:track:ORIGINAL123');
  assert.strictEqual(normalized.writeUri, 'spotify:track:PLAYABLE123');
  assert.strictEqual(normalized.artists, 'Artist');
})();

(function testTrackNormalizationRejectsUnsupportedItems() {
  assert.strictEqual(
    Core.normalizeTrackRecord({ is_local: true, track: { type: 'track', uri: 'spotify:track:LOCAL123' } }),
    null
  );
  assert.strictEqual(
    Core.normalizeTrackRecord({ item: { type: 'episode', uri: 'spotify:episode:EPISODE123' } }),
    null
  );
})();

(function testFrontInsertionBatchesPreserveOrder() {
  const items = Array.from({ length: 250 }, (_, index) => index + 1);
  const batches = Core.frontInsertionBatches(items, 100);
  let playlist = [];
  batches.forEach((batch) => {
    playlist = batch.concat(playlist);
  });
  assert.deepStrictEqual(playlist, items);
})();

(function testMirrorAddsAndRemoves() {
  const source = snapshot(['A', 'B', 'C'], Constants.ORDERING.NEWEST_FIRST);
  const target = snapshot(['A', 'D']);
  const plan = Strategies._planMirror(source, target);
  assert.deepStrictEqual(Array.from(plan.add, (item) => item.keyUri), [
    'spotify:track:B',
    'spotify:track:C'
  ]);
  assert.deepStrictEqual(Array.from(plan.remove), ['spotify:track:D']);
  assert.strictEqual(plan.removeCount, 1);
  assert.strictEqual(plan.addMode, 'FRONT');
})();

(function testMirrorRepairsDuplicates() {
  const source = snapshot(['A', 'B']);
  const target = snapshot(['A', 'B', 'B']);
  const plan = Strategies._planMirror(source, target);
  assert.deepStrictEqual(Array.from(plan.remove), ['spotify:track:B']);
  assert.deepStrictEqual(Array.from(plan.add, (item) => item.keyUri), ['spotify:track:B']);
  assert.strictEqual(plan.removeCount, 2);
})();

(function testAppendNeverRemovesAndChronologicalLikedOrder() {
  const source = snapshot(['NEWEST', 'MIDDLE', 'OLDEST'], Constants.ORDERING.NEWEST_FIRST);
  const target = snapshot(['OLDEST']);
  const plan = Strategies._planAppend(source, target);
  assert.deepStrictEqual(Array.from(plan.remove), []);
  assert.deepStrictEqual(Array.from(plan.add, (item) => item.keyUri), [
    'spotify:track:MIDDLE',
    'spotify:track:NEWEST'
  ]);
  assert.strictEqual(plan.removeCount, 0);
  assert.strictEqual(plan.addMode, 'END');
})();

(function testFriendlyJobLabelsParseToRuntimeConfiguration() {
  const parsed = SheetStore._parseJobRows([
    jobRow({ behavior: 'Append Only', frequency: 'Every 10 days' })
  ], 2);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.jobs[0].sourceType, 'LIKED_SONGS');
  assert.strictEqual(parsed.jobs[0].strategy, 'APPEND');
  assert.strictEqual(parsed.jobs[0].intervalDays, 10);
  assert.strictEqual(parsed.jobs[0].targetPlaylist, '1234567890AB');
})();

(function testDisabledBrokenJobDoesNotCreateConfigurationError() {
  const parsed = SheetStore._parseJobRows([
    jobRow({ enabled: false, source: 'broken', behavior: 'broken', frequency: 'broken', targetPlaylistId: 'broken' })
  ], 2);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.jobs[0].enabled, false);
  assert.strictEqual(parsed.errors.length, 0);
})();

(function testMalformedEnabledJobDoesNotBlockValidJobs() {
  const parsed = SheetStore._parseJobRows([
    jobRow({ name: 'Broken', targetPlaylistId: 'not-a-playlist' }),
    jobRow({ name: 'Valid', behavior: 'Append Only', frequency: 'Every 10 days' })
  ], 2);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.jobs[0].name, 'Valid');
  assert.strictEqual(parsed.errors.length, 1);
  assert.strictEqual(parsed.errors[0].rowNumber, 2);
  assert.match(parsed.errors[0].error, /Invalid Spotify playlist/);
})();

(function testLegacyJobMigrationPreservesPlaylistIdsAndTelemetry() {
  const migrated = SheetStore._legacyJobToStoredRow([
    true,
    'Shareable Likes',
    'LIKED_SONGS',
    '',
    'https://open.spotify.com/playlist/1234567890AB?si=abc',
    'MIRROR',
    1,
    new Date('2026-08-14T03:00:00Z'),
    new Date('2026-08-14T03:00:00Z'),
    'Success',
    3,
    1,
    ''
  ]);
  assert.strictEqual(migrated[1], 'Shareable Likes');
  assert.strictEqual(migrated[4], 'Exact Mirror');
  assert.strictEqual(migrated[5], 'Daily');
  assert.strictEqual(migrated[8], 'job_1234567812341234');
  assert.strictEqual(migrated[10], '1234567890AB');
  assert.strictEqual(migrated[13], 'Success');
  assert.strictEqual(migrated[14], 3);
  assert.strictEqual(migrated[15], 1);
})();

(function testCalendarDayMath() {
  assert.strictEqual(Core.dateKeyToOrdinal('2026-08-14') - Core.dateKeyToOrdinal('2026-08-13'), 1);
  assert.strictEqual(
    Core.isDueByCalendarDay(
      new Date('2026-08-04T23:59:00Z'),
      10,
      new Date('2026-08-14T00:01:00Z'),
      'UTC'
    ),
    true
  );
})();

(function testSecretRedaction() {
  const redacted = Core.safeErrorMessage(
    'Authorization: Bearer abc.DEF-123 access_token=secret&refresh_token=secret2&code_verifier=secret3'
  );
  assert(!redacted.includes('abc.DEF-123'));
  assert(!redacted.includes('secret2'));
  assert(!redacted.includes('secret3'));
})();

(function testSemanticVersionComparison() {
  assert(UpdateChecker.compareVersions('1.3.0', '1.2.9') > 0);
  assert(UpdateChecker.compareVersions('2.0.0', '1.99.99') > 0);
  assert(UpdateChecker.compareVersions('1.3.0', '1.3.0') === 0);
  assert(UpdateChecker.compareVersions('1.3.0-beta.2', '1.3.0-beta.1') > 0);
  assert(UpdateChecker.compareVersions('1.3.0', '1.3.0-beta.9') > 0);
  assert.throws(() => UpdateChecker.compareVersions('not-semver', '1.0.0'), /Invalid Spoti Sync version/);
})();

(function testUpdateMetadataValidation() {
  const valid = UpdateChecker._validateMetadata({
    schema: 1,
    version: '1.3.0',
    channel: 'stable',
    released_at: '2026-08-15',
    installer_url: 'https://sid.is-a.dev/Spoti-sync/#update',
    changelog_url: 'https://github.com/11sid11/Spoti-sync/blob/main/CHANGELOG.md',
    notes: ['One', 'Two']
  });
  assert.strictEqual(valid.version, '1.3.0');
  assert.deepStrictEqual(Array.from(valid.notes), ['One', 'Two']);
})();

(function testPublishedVersionMetadataMatchesSource() {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'version.json'), 'utf8'));
  assert.strictEqual(metadata.version, VERSION);
  assert.strictEqual(metadata.schema, 1);
  assert.strictEqual(metadata.installer_url, 'https://sid.is-a.dev/Spoti-sync/#update');
  assert.strictEqual(Constants.PROJECT_URL, 'https://sid.is-a.dev/Spoti-sync/');
  assert.strictEqual(Constants.HEARTBEAT_SIGNATURE, 'sid.is-a.dev');
})();

(function testBundleSafetyAndEndpointGuards() {
  const bundle = fs.readFileSync(path.join(root, 'dist', 'SpotiSync.gs'), 'utf8');
  assert(!/\/playlists\/[^\n'"`]*\/tracks/.test(bundle));
  assert(bundle.includes("'/playlists/' + id + '/items'"));
  assert(bundle.includes("request('put', '/playlists/' + id"));
  assert(bundle.includes('description: text'));
  assert(!bundle.includes('client_secret'));
  assert(!bundle.includes('user-library-modify'));
  assert(bundle.includes('/usercallback'));
  assert(bundle.includes('getJobReadResult'));
  assert(bundle.includes('PlaylistHeartbeat'));
  assert(bundle.includes('UPDATE_METADATA_URL'));
  assert(!bundle.includes('https://www.googleapis.com/auth/script.projects'));
  assert(!bundle.includes('script.googleapis.com/v1/projects/'));
  assert(!/\beval\s*\(/.test(bundle));
})();

(function testOneCanonicalInstallerSourceManifest() {
  const manifestPath = path.join(root, 'docs', 'source-files.json');
  const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sourceModules = fs.readdirSync(path.join(root, 'src'))
    .filter((filename) => filename.endsWith('.gs'))
    .sort();
  const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build.js'), 'utf8');
  const siteScript = fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8');

  assert(sourceManifest.includes('92_JobEditor.gs'), 'Installer manifest must include the Job editor module.');
  assert.deepStrictEqual([...sourceManifest].sort(), sourceModules, 'Installer manifest must contain every src/*.gs module exactly once.');
  assert.strictEqual(new Set(sourceManifest).size, sourceManifest.length, 'Installer manifest must not contain duplicate modules.');
  assert(buildScript.includes("path.join(root, 'docs', 'source-files.json')"));
  assert(siteScript.includes("new URL('source-files.json', window.location.href)"));
  assert(!buildScript.includes('const sourceFiles = ['), 'Node build must not maintain a second module list.');
  assert(!siteScript.includes('const sourceFiles = ['), 'Browser installer must not maintain a second module list.');
})();

(function testPagesInstallerBuildsFromCommittedSource() {
  const siteScript = fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8');
  const siteHtml = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
  assert(siteScript.includes('raw.githubusercontent.com/11sid11/Spoti-sync/main/src/'));
  assert(siteHtml.includes('id="update"'));
  assert(siteHtml.includes('Schedule'));
  assert(siteHtml.includes('Activity'));
  assert(siteHtml.includes('playlist description'));
  assert(siteHtml.includes('Updates are intentionally not installed silently.'));
})();

console.log('All Spoti Sync tests passed.');
