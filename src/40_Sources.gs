var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function normalizeRows(rows, ordering) {
    var ignoredCount = 0;
    var tracks = [];

    rows.forEach(function (row, index) {
      var track = ns.Core.normalizeTrackRecord(row);
      if (!track) {
        ignoredCount += 1;
        return;
      }
      track._sourceIndex = index;
      tracks.push(track);
    });

    if (ordering === ns.Constants.ORDERING.NEWEST_FIRST) {
      tracks.sort(function (a, b) {
        var aTime = a.addedAt ? Date.parse(a.addedAt) : NaN;
        var bTime = b.addedAt ? Date.parse(b.addedAt) : NaN;
        if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
          return bTime - aTime;
        }
        return a._sourceIndex - b._sourceIndex;
      });
    }

    tracks.forEach(function (track) {
      delete track._sourceIndex;
    });

    return {
      tracks: tracks,
      ignoredCount: ignoredCount,
      ordering: ordering
    };
  }

  function loadLikedSongs() {
    var normalized = normalizeRows(
      ns.SpotifyApi.getLikedTrackRows(),
      ns.Constants.ORDERING.NEWEST_FIRST
    );
    normalized.key = 'LIKED_SONGS';
    return normalized;
  }

  function loadPlaylist(playlistId) {
    var id = ns.Core.parsePlaylistId(playlistId);
    var normalized = normalizeRows(
      ns.SpotifyApi.getPlaylistItemRows(id),
      ns.Constants.ORDERING.PRESERVE
    );
    normalized.key = 'PLAYLIST:' + id;
    normalized.playlistId = id;
    return normalized;
  }

  ns.Sources = {
    cacheKeyForJobSource: function (job) {
      if (job.sourceType === ns.Constants.SOURCE_TYPES.LIKED_SONGS) {
        return 'LIKED_SONGS';
      }
      if (job.sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
        return 'PLAYLIST:' + ns.Core.parsePlaylistId(job.sourcePlaylist);
      }
      throw new Error('Unsupported source type: ' + job.sourceType);
    },

    getForJob: function (job, runtime) {
      var cacheKey = ns.Sources.cacheKeyForJobSource(job);
      runtime.sourceCache = runtime.sourceCache || Object.create(null);
      if (!runtime.sourceCache[cacheKey]) {
        if (job.sourceType === ns.Constants.SOURCE_TYPES.LIKED_SONGS) {
          runtime.sourceCache[cacheKey] = loadLikedSongs();
        } else if (job.sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
          runtime.sourceCache[cacheKey] = loadPlaylist(job.sourcePlaylist);
        } else {
          throw new Error('Unsupported source type: ' + job.sourceType);
        }
      }
      return runtime.sourceCache[cacheKey];
    },

    getTargetPlaylist: function (playlistId, runtime) {
      var id = ns.Core.parsePlaylistId(playlistId);
      var cacheKey = 'PLAYLIST:' + id;
      runtime.sourceCache = runtime.sourceCache || Object.create(null);
      if (!runtime.sourceCache[cacheKey]) {
        runtime.sourceCache[cacheKey] = loadPlaylist(id);
      }
      return runtime.sourceCache[cacheKey];
    },

    invalidatePlaylist: function (playlistId, runtime) {
      var id = ns.Core.parsePlaylistId(playlistId);
      if (runtime.sourceCache) {
        delete runtime.sourceCache['PLAYLIST:' + id];
      }
    }
  };
})(SpotiSync);
