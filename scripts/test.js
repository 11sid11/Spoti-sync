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
    formatDate(date) {
      return date.toISOString().slice(0, 10);
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

const { Core, Strategies, Constants, SheetStore } = context.SpotiSync;

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

(function testMalformedEnabledJobDoesNotBlockValidJobs() {
  const rows = [
    [true, 'Broken', 'LIKED_SONGS', '', 'not-a-playlist', 'MIRROR', 1, '', '', '', 0, 0, ''],
    [true, 'Valid', 'LIKED_SONGS', '', '1234567890AB', 'APPEND', 10, '', '', '', 0, 0, ''],
    [false, 'Disabled broken row', 'NOPE', '', '', 'NOPE', 'bad', '', '', '', 0, 0, '']
  ];
  const parsed = SheetStore._parseJobRows(rows, 2);
  assert.strictEqual(parsed.jobs.length, 1);
  assert.strictEqual(parsed.jobs[0].name, 'Valid');
  assert.strictEqual(parsed.errors.length, 1);
  assert.strictEqual(parsed.errors[0].rowNumber, 2);
  assert.match(parsed.errors[0].error, /Invalid Spotify playlist/);
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

(function testBundleSafetyAndEndpointGuards() {
  const bundle = fs.readFileSync(path.join(root, 'dist', 'SpotiSync.gs'), 'utf8');
  assert(!/\/playlists\/[^\n'"`]*\/tracks/.test(bundle));
  assert(bundle.includes("'/playlists/' + id + '/items'"));
  assert(!bundle.includes('client_secret'));
  assert(!bundle.includes('user-library-modify'));
  assert(bundle.includes('/usercallback'));
  assert(bundle.includes('getJobReadResult'));
})();

console.log('All Spoti Sync tests passed.');
