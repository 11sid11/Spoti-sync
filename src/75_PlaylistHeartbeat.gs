var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var KEY_PREFIX = 'HEARTBEAT_INDEX_';
  var PHRASES = Object.freeze([
    'Kept fresh with Spoti Sync ✨',
    'Kept in sync with Spoti Sync 🔄',
    'Refreshed with Spoti Sync 🎧',
    'Kept current with Spoti Sync 🟢',
    'Tuned with Spoti Sync 🎵',
    'Staying fresh with Spoti Sync 💿'
  ]);

  function stateKey(job) {
    return KEY_PREFIX + (ns.Core.trim(job.jobId) || ns.Core.parsePlaylistId(job.targetPlaylist));
  }

  function readIndex(job) {
    var props = ns.Storage.documentProperties();
    var value = props ? Number(props.getProperty(stateKey(job)) || 0) : 0;
    if (!Number.isInteger(value) || value < 0) {
      return 0;
    }
    return value % PHRASES.length;
  }

  function storeNextIndex(job, index) {
    var props = ns.Storage.documentProperties();
    if (props) {
      props.setProperty(stateKey(job), String((index + 1) % PHRASES.length));
    }
  }

  function buildDescription(job, date, timezone, phraseIndex) {
    var when = date instanceof Date ? date : new Date(date || Date.now());
    var index = Number.isInteger(phraseIndex) ? phraseIndex % PHRASES.length : readIndex(job);
    var timestamp;

    if (isNaN(when.getTime())) {
      throw new Error('Cannot build playlist heartbeat with an invalid timestamp.');
    }

    timestamp = Utilities.formatDate(when, timezone, 'EEE, MMM d · h:mm a');
    return PHRASES[index] + ' · ' + ns.Constants.HEARTBEAT_SIGNATURE + ' · 🔄 ' + timestamp;
  }

  ns.PlaylistHeartbeat = {
    phrases: PHRASES.slice(),

    update: function (job, date) {
      var index = readIndex(job);
      var timezone = ns.SheetStore.getSpreadsheetTimezone();
      var description = buildDescription(job, date || new Date(), timezone, index);

      try {
        ns.SpotifyApi.updatePlaylistDescription(job.targetPlaylist, description);
        storeNextIndex(job, index);
        return {
          ok: true,
          description: description,
          phraseIndex: index
        };
      } catch (error) {
        return {
          ok: false,
          description: description,
          phraseIndex: index,
          error: ns.Core.safeErrorMessage(error)
        };
      }
    },

    _buildDescription: buildDescription,
    _readIndex: readIndex,
    _stateKey: stateKey
  };
})(SpotiSync);
