var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function uniqueSourceTracks(source) {
    return ns.Core.uniqueBy(source.tracks, function (track) {
      return track.keyUri;
    });
  }

  function indexTargetByKey(target) {
    var map = Object.create(null);
    target.tracks.forEach(function (track) {
      if (!map[track.keyUri]) {
        map[track.keyUri] = [];
      }
      map[track.keyUri].push(track);
    });
    return map;
  }

  function planMirror(source, target) {
    var sourceTracks = uniqueSourceTracks(source);
    var sourceKeys = Object.create(null);
    var targetByKey = indexTargetByKey(target);
    var repairKeys = Object.create(null);
    var removeUris = [];
    var removeCount = 0;

    sourceTracks.forEach(function (track) {
      sourceKeys[track.keyUri] = true;
    });

    Object.keys(targetByKey).forEach(function (key) {
      var targetTracks = targetByKey[key];
      if (!sourceKeys[key]) {
        targetTracks.forEach(function (track) {
          removeUris.push(track.writeUri);
          removeCount += 1;
        });
        return;
      }

      if (targetTracks.length > 1) {
        repairKeys[key] = true;
        targetTracks.forEach(function (track) {
          removeUris.push(track.writeUri);
          removeCount += 1;
        });
      }
    });

    var addTracks = sourceTracks.filter(function (track) {
      return !targetByKey[track.keyUri] || repairKeys[track.keyUri];
    });

    return {
      add: addTracks,
      remove: ns.Core.uniqueStrings(removeUris),
      removeCount: removeCount,
      addMode: source.ordering === ns.Constants.ORDERING.NEWEST_FIRST ? 'FRONT' : 'END',
      ignored: Number(source.ignoredCount || 0) + Number(target.ignoredCount || 0)
    };
  }

  function planAppend(source, target) {
    var sourceTracks = uniqueSourceTracks(source);
    var targetByKey = indexTargetByKey(target);
    var addTracks = sourceTracks.filter(function (track) {
      return !targetByKey[track.keyUri];
    });

    if (source.ordering === ns.Constants.ORDERING.NEWEST_FIRST) {
      addTracks = addTracks.slice().reverse();
    }

    return {
      add: addTracks,
      remove: [],
      removeCount: 0,
      addMode: 'END',
      ignored: Number(source.ignoredCount || 0) + Number(target.ignoredCount || 0)
    };
  }

  ns.Strategies = {
    plan: function (strategy, source, target) {
      if (strategy === ns.Constants.STRATEGIES.MIRROR) {
        return planMirror(source, target);
      }
      if (strategy === ns.Constants.STRATEGIES.APPEND) {
        return planAppend(source, target);
      }
      throw new Error('Unsupported strategy: ' + strategy);
    },

    _planMirror: planMirror,
    _planAppend: planAppend
  };
})(SpotiSync);
