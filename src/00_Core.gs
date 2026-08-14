/** @OnlyCurrentDoc */

var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  ns.VERSION = '1.1.0';

  ns.Constants = Object.freeze({
    APP_NAME: 'Spoti Sync',
    SPOTIFY_API_BASE: 'https://api.spotify.com/v1',
    SPOTIFY_ACCOUNTS_BASE: 'https://accounts.spotify.com',
    SPOTIFY_DASHBOARD_URL: 'https://developer.spotify.com/dashboard',
    SPOTIFY_SCOPES: [
      'user-library-read',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private'
    ],
    PAGE_SIZE: 50,
    WRITE_BATCH_SIZE: 100,
    MAX_HISTORY_ROWS: 1000,
    MAX_RETRY_AFTER_SECONDS: 30,
    TOKEN_EXPIRY_SKEW_MS: 60 * 1000,
    DEFAULT_SCHEDULER_HOUR: 3,
    SHEETS: Object.freeze({
      DASHBOARD: 'Dashboard',
      JOBS: 'Jobs',
      HISTORY: 'History'
    }),
    SOURCE_TYPES: Object.freeze({
      LIKED_SONGS: 'LIKED_SONGS',
      PLAYLIST: 'PLAYLIST'
    }),
    ORDERING: Object.freeze({
      NEWEST_FIRST: 'NEWEST_FIRST',
      PRESERVE: 'PRESERVE'
    }),
    STRATEGIES: Object.freeze({
      MIRROR: 'MIRROR',
      APPEND: 'APPEND'
    })
  });

  ns.Core = {
    assert: function (condition, message) {
      if (!condition) {
        throw new Error(message || 'Assertion failed.');
      }
    },

    trim: function (value) {
      return value === null || value === undefined ? '' : String(value).trim();
    },

    escapeHtml: function (value) {
      return ns.Core.trim(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    formEncode: function (values) {
      return Object.keys(values)
        .filter(function (key) {
          return values[key] !== undefined && values[key] !== null;
        })
        .map(function (key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(String(values[key]));
        })
        .join('&');
    },

    parsePlaylistId: function (value) {
      var input = ns.Core.trim(value);
      var match;

      if (!input) {
        throw new Error('Playlist ID or URL is required.');
      }

      match = input.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
      if (match) {
        return match[1];
      }

      match = input.match(/^https?:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(?:[/?#].*)?$/i);
      if (match) {
        return match[1];
      }

      if (/^[A-Za-z0-9]{10,64}$/.test(input)) {
        return input;
      }

      throw new Error('Invalid Spotify playlist URL, URI, or ID.');
    },

    isManagedTrackUri: function (uri) {
      return /^spotify:track:[A-Za-z0-9]+$/.test(ns.Core.trim(uri));
    },

    normalizeTrackRecord: function (container) {
      var track = container && (container.item || container.track);
      var writeUri;
      var keyUri;
      var artists;

      if (!track || track.type !== 'track') {
        return null;
      }

      if (container.is_local || track.is_local) {
        return null;
      }

      writeUri = ns.Core.trim(track.uri);
      if (!ns.Core.isManagedTrackUri(writeUri)) {
        return null;
      }

      keyUri = track.linked_from && ns.Core.isManagedTrackUri(track.linked_from.uri)
        ? track.linked_from.uri
        : writeUri;

      artists = Array.isArray(track.artists)
        ? track.artists.map(function (artist) {
            return artist && artist.name ? artist.name : '';
          }).filter(Boolean).join(', ')
        : '';

      return {
        keyUri: keyUri,
        writeUri: writeUri,
        name: track.name || writeUri,
        artists: artists,
        addedAt: container.added_at || null
      };
    },

    uniqueBy: function (items, keyFn) {
      var seen = Object.create(null);
      var output = [];
      items.forEach(function (item) {
        var key = keyFn(item);
        if (!seen[key]) {
          seen[key] = true;
          output.push(item);
        }
      });
      return output;
    },

    uniqueStrings: function (items) {
      return ns.Core.uniqueBy(items, function (item) {
        return item;
      });
    },

    chunk: function (items, size) {
      var chunks = [];
      var index;
      for (index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
      }
      return chunks;
    },

    frontInsertionBatches: function (items, size) {
      var chunks = ns.Core.chunk(items, size);
      return chunks.reverse();
    },

    dateKeyToOrdinal: function (dateKey) {
      var match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        throw new Error('Invalid date key: ' + dateKey);
      }
      return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
    },

    calendarDayOrdinal: function (date, timezone) {
      return ns.Core.dateKeyToOrdinal(Utilities.formatDate(date, timezone, 'yyyy-MM-dd'));
    },

    isDueByCalendarDay: function (lastSuccess, intervalDays, now, timezone) {
      var lastDate;
      var elapsed;

      if (!lastSuccess) {
        return true;
      }

      lastDate = lastSuccess instanceof Date ? lastSuccess : new Date(lastSuccess);
      if (isNaN(lastDate.getTime())) {
        return true;
      }

      elapsed = ns.Core.calendarDayOrdinal(now, timezone) -
        ns.Core.calendarDayOrdinal(lastDate, timezone);
      return elapsed >= intervalDays;
    },

    safeErrorMessage: function (error) {
      var message = error && error.message ? String(error.message) : String(error || 'Unknown error');
      return message
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
        .replace(/(access_token|refresh_token|code_verifier)=([^&\s]+)/gi, '$1=[REDACTED]')
        .slice(0, 1000);
    },

    nowIso: function () {
      return new Date().toISOString();
    }
  };
})(SpotiSync);
