var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var CATALOG_CACHE_KEY = 'SPOTI_SYNC_PLAYLIST_CATALOG_V1';
  var CATALOG_TTL_SECONDS = 300;
  var NAME_PROPERTY_PREFIX = 'PLAYLIST_NAME_';
  var AUTOMATION = Object.freeze({
    OFF: 'OFF',
    DAILY: 'DAILY',
    INTERVAL: 'INTERVAL'
  });

  function normalizePlaylist(playlist) {
    var owner = playlist && playlist.owner ? playlist.owner : {};
    var items = playlist && playlist.items ? playlist.items : {};
    var tracks = playlist && playlist.tracks ? playlist.tracks : {};
    var externalUrls = playlist && playlist.external_urls ? playlist.external_urls : {};
    return {
      id: ns.Core.trim(playlist && playlist.id),
      name: ns.Core.trim(playlist && playlist.name) || 'Untitled playlist',
      url: externalUrls.spotify || '',
      owner: ns.Core.trim(owner.display_name || owner.id),
      isPublic: playlist && playlist.public === true,
      collaborative: playlist && playlist.collaborative === true,
      itemCount: Number(items.total !== undefined ? items.total : (tracks.total || 0))
    };
  }

  function getAllPlaylistPages() {
    var next = '/me/playlists?limit=' + ns.Constants.PAGE_SIZE + '&offset=0';
    var playlists = [];
    while (next) {
      var page = ns.SpotifyApi.request('get', next);
      if (!page || !Array.isArray(page.items)) {
        throw new Error('Spotify returned an unexpected playlist response.');
      }
      playlists = playlists.concat(page.items.map(normalizePlaylist));
      next = page.next || null;
    }
    return playlists.sort(function (a, b) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  function getCatalog(force) {
    var cache = CacheService.getUserCache();
    var cached;
    var playlists;
    var serialized;

    if (!force) {
      cached = cache.get(CATALOG_CACHE_KEY);
      if (cached) {
        try {
          playlists = JSON.parse(cached);
          if (Array.isArray(playlists)) { return playlists; }
        } catch (ignored) {
          // Ignore a corrupt cache entry and refresh from Spotify.
        }
      }
    }

    playlists = getAllPlaylistPages();
    serialized = JSON.stringify(playlists);
    if (serialized.length < 90000) {
      cache.put(CATALOG_CACHE_KEY, serialized, CATALOG_TTL_SECONDS);
    }
    return playlists;
  }

  function getPlaylistDetails(playlistId) {
    var id = ns.Core.parsePlaylistId(playlistId);
    var playlist = ns.SpotifyApi.request(
      'get',
      '/playlists/' + encodeURIComponent(id) +
        '?fields=id,name,public,collaborative,owner(id,display_name),items(total),external_urls'
    );
    var normalized = normalizePlaylist(playlist || {});
    ns.Core.assert(normalized.id, 'Spotify did not return playlist details.');
    return normalized;
  }

  function createTargetPlaylist(name, isPublic) {
    var title = ns.Core.trim(name);
    ns.Core.assert(title, 'New target playlist name is required.');
    return normalizePlaylist(ns.SpotifyApi.request('post', '/me/playlists', {
      body: { name: title, public: isPublic === true }
    }));
  }

  function findPlaylistById(catalog, playlistId) {
    var id = ns.Core.trim(playlistId);
    var found = null;
    (catalog || []).some(function (playlist) {
      if (playlist.id === id) {
        found = playlist;
        return true;
      }
      return false;
    });
    return found;
  }

  function namePropertyKey(playlistId) {
    return NAME_PROPERTY_PREFIX + ns.Core.trim(playlistId);
  }

  function rememberPlaylist(playlist) {
    if (!playlist || !playlist.id || !playlist.name) { return; }
    ns.Storage.documentProperties().setProperty(namePropertyKey(playlist.id), playlist.name);
  }

  function rememberedName(playlistId) {
    if (!playlistId) { return ''; }
    return ns.Core.trim(ns.Storage.documentProperties().getProperty(namePropertyKey(playlistId)));
  }

  function cleanStoredLabel(value) {
    var label = ns.Core.trim(value);
    if (label.indexOf('Playlist · ') === 0) {
      label = label.slice('Playlist · '.length);
    }
    if (label.slice(-2) === ' ↗') {
      label = label.slice(0, -2);
    }
    if (label === 'Playlist' || label === 'Open playlist' || label === 'Spotify playlist') {
      return '';
    }
    return ns.Core.trim(label);
  }

  function rememberCatalog(catalog) {
    (catalog || []).forEach(rememberPlaylist);
  }

  function resolvePlaylistReference(selectedId, manualValue, catalog) {
    var raw = ns.Core.trim(manualValue) || ns.Core.trim(selectedId);
    var id = ns.Core.parsePlaylistId(raw);
    return findPlaylistById(catalog, id) || getPlaylistDetails(id);
  }

  function automationForJob(job) {
    if (!job.enabled) {
      return AUTOMATION.OFF;
    }
    return job.intervalDays === 1 ? AUTOMATION.DAILY : AUTOMATION.INTERVAL;
  }

  function automationLabel(job) {
    return ns.SheetStore.getAutomationLabel(job);
  }

  function sourceName(job) {
    if (job.sourceType === ns.Constants.SOURCE_TYPES.LIKED_SONGS) {
      return 'Liked Songs';
    }
    return rememberedName(job.sourcePlaylist) || cleanStoredLabel(job.sourceLabel) || 'Spotify playlist';
  }

  function targetName(job) {
    return rememberedName(job.targetPlaylist) || cleanStoredLabel(job.targetLabel) || 'Spotify playlist';
  }

  function jobCard(job) {
    return {
      jobId: job.jobId,
      name: job.name,
      source: sourceName(job),
      target: targetName(job),
      behavior: ns.SheetStore._behaviorLabel(job.strategy),
      automation: automationLabel(job),
      automated: job.enabled,
      intervalDays: job.intervalDays,
      heartbeatEnabled: job.heartbeatEnabled !== false,
      lastSuccess: job.lastSuccess ? ns.SheetStore._formatTimestamp(job.lastSuccess) : 'Never',
      lastStatus: job.lastStatus || '',
      status: ns.SheetStore._healthLabel(job),
      lastAdded: job.lastAdded,
      lastRemoved: job.lastRemoved,
      lastError: job.lastError || ''
    };
  }

  function homeModel() {
    var read = ns.SheetStore.getJobReadResult();
    var scheduler = ns.Scheduler.getStatus();
    var update = ns.UpdateChecker.getCachedStatus();
    var clientId = ns.Storage.getClientId();
    var automatedJobs = read.jobs.filter(function (job) { return job.enabled; }).length;
    return {
      version: ns.VERSION,
      connected: ns.Auth.isConnected(),
      redirectUri: ns.Auth.getRedirectUri(),
      spotifyDashboardUrl: ns.Constants.SPOTIFY_DASHBOARD_URL,
      projectUrl: ns.Constants.PROJECT_URL,
      clientIdHint: clientId ? ('Configured: …' + clientId.slice(-6)) : '',
      automation: {
        enabled: scheduler.enabled,
        triggerCount: scheduler.triggerCount,
        automatedJobs: automatedJobs,
        lastCheckAt: scheduler.lastCheckAt || '',
        lastCheckStatus: scheduler.lastCheckStatus || ''
      },
      update: {
        available: Boolean(update.updateAvailable),
        label: ns.UpdateChecker.statusLabel(update),
        latestVersion: update.latestVersion || ''
      },
      jobs: read.jobs.map(jobCard),
      configurationErrors: read.errors.map(function (error) {
        return {
          jobId: error.jobId || '',
          name: error.name,
          enabled: error.enabled,
          error: error.error
        };
      })
    };
  }

  function ensureCurrentPlaylist(catalog, id, name) {
    if (!id || findPlaylistById(catalog, id)) { return; }
    catalog.unshift({
      id: id,
      name: name || 'Current playlist',
      url: 'https://open.spotify.com/playlist/' + encodeURIComponent(id),
      owner: 'Current configuration',
      isPublic: false,
      collaborative: false,
      itemCount: 0
    });
  }

  function editorConfig(job) {
    if (!job) {
      return {
        jobId: '',
        name: '',
        sourceType: ns.Constants.SOURCE_TYPES.LIKED_SONGS,
        sourcePlaylistId: '',
        sourceName: '',
        targetPlaylistId: '',
        targetName: '',
        behavior: ns.SheetStore._behaviorLabel(ns.Constants.STRATEGIES.MIRROR),
        automation: AUTOMATION.DAILY,
        intervalDays: 1,
        heartbeatEnabled: true
      };
    }

    return {
      jobId: job.jobId,
      name: job.name,
      sourceType: job.sourceType,
      sourcePlaylistId: job.sourcePlaylist,
      sourceName: sourceName(job),
      targetPlaylistId: job.targetPlaylist,
      targetName: targetName(job),
      behavior: ns.SheetStore._behaviorLabel(job.strategy),
      automation: automationForJob(job),
      intervalDays: job.intervalDays,
      heartbeatEnabled: job.heartbeatEnabled !== false
    };
  }

  function editorModel(jobId) {
    ns.Core.assert(ns.Auth.isConnected(), 'Connect Spotify before configuring jobs.');
    var catalog = [];
    var catalogWarning = '';
    try {
      catalog = getCatalog(false);
    } catch (error) {
      catalogWarning = 'Playlist list could not be loaded. You can still paste a Spotify playlist link or ID.';
    }
    var job = ns.Core.trim(jobId) ? ns.SheetStore.getJobById(jobId) : null;
    var config = editorConfig(job);
    var editorCatalog = catalog.slice();

    rememberCatalog(catalog);
    ensureCurrentPlaylist(editorCatalog, config.sourcePlaylistId, config.sourceName);
    ensureCurrentPlaylist(editorCatalog, config.targetPlaylistId, config.targetName);

    return {
      mode: job ? 'edit' : 'add',
      config: config,
      catalog: editorCatalog,
      catalogWarning: catalogWarning,
      behaviorOptions: ns.SheetStore.behaviorOptions(),
      frequencyLimits: ns.SheetStore.frequencyLimits(),
      automationOptions: [
        { value: AUTOMATION.OFF, label: 'Off' },
        { value: AUTOMATION.DAILY, label: 'Daily' },
        { value: AUTOMATION.INTERVAL, label: 'Every N days' }
      ]
    };
  }

  function intervalForPayload(data) {
    var mode = ns.Core.trim(data.automation).toUpperCase();
    var requested;

    if (mode === AUTOMATION.OFF) {
      requested = Number(data.intervalDays || 1);
      if (!Number.isInteger(requested) || requested < 1) {
        requested = 1;
      }
      return ns.SheetStore._parseFrequency(ns.SheetStore._frequencyLabel(requested));
    }
    if (mode === AUTOMATION.DAILY) {
      return 1;
    }
    if (mode === AUTOMATION.INTERVAL) {
      return ns.SheetStore._parseFrequency(ns.SheetStore._frequencyLabel(Number(data.intervalDays)));
    }
    throw new Error('Choose Off, Daily, or Every N days for Automation.');
  }

  function save(payload) {
    var data = payload || {};
    var sourceType = ns.Core.trim(data.sourceType).toUpperCase();
    var automation = ns.Core.trim(data.automation).toUpperCase();
    var catalog;
    var sourcePlaylist = null;
    var targetPlaylist;
    var strategy;
    var intervalDays;
    var enabled;
    var sourceLabel;
    var targetLabel;
    var name;
    var saved;
    var schedulerWarning = '';

    ns.Core.assert(
      [ns.Constants.SOURCE_TYPES.LIKED_SONGS, ns.Constants.SOURCE_TYPES.PLAYLIST].indexOf(sourceType) !== -1,
      'Choose Liked Songs or a Spotify playlist as the source.'
    );
    strategy = ns.SheetStore._parseBehaviorLabel(data.behavior);
    intervalDays = intervalForPayload(data);
    enabled = automation !== AUTOMATION.OFF;
    try {
      catalog = getCatalog(false);
    } catch (ignored) {
      catalog = [];
    }

    if (sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
      sourcePlaylist = resolvePlaylistReference(data.sourcePlaylistId, data.sourceManual, catalog);
    }

    if (ns.Core.trim(data.targetMode) === 'create') {
      targetPlaylist = createTargetPlaylist(data.newTargetName, data.targetPublic === true);
      rememberPlaylist(targetPlaylist);
      CacheService.getUserCache().remove(CATALOG_CACHE_KEY);
    } else {
      targetPlaylist = resolvePlaylistReference(data.targetPlaylistId, data.targetManual, catalog);
    }

    if (sourcePlaylist && sourcePlaylist.id === targetPlaylist.id) {
      throw new Error('Source and target must be different playlists.');
    }

    if (sourcePlaylist) { rememberPlaylist(sourcePlaylist); }
    rememberPlaylist(targetPlaylist);

    sourceLabel = sourcePlaylist ? sourcePlaylist.name : 'Liked Songs';
    targetLabel = targetPlaylist.name;
    name = ns.Core.trim(data.name) || (sourceLabel + ' → ' + targetLabel);

    saved = ns.SheetStore.upsertJob({
      jobId: ns.Core.trim(data.jobId),
      name: name,
      enabled: enabled,
      sourceType: sourceType,
      sourcePlaylistId: sourcePlaylist ? sourcePlaylist.id : '',
      sourceLabel: sourceLabel,
      targetPlaylistId: targetPlaylist.id,
      targetLabel: targetLabel,
      strategy: strategy,
      intervalDays: intervalDays,
      heartbeatEnabled: data.heartbeatEnabled !== false
    });

    try {
      ns.Scheduler.reconcile({ refresh: false });
    } catch (error) {
      schedulerWarning = 'Job saved. Automation needs attention: ' + ns.Core.safeErrorMessage(error);
    }

    ns.SheetStore.refreshSummary();
    return {
      ok: true,
      jobId: saved.jobId,
      warning: schedulerWarning,
      message: schedulerWarning || 'Job saved.',
      home: homeModel()
    };
  }

  function deleteJob(jobId) {
    ns.SheetStore.deleteJob(jobId);
    var schedulerWarning = '';
    try {
      ns.Scheduler.reconcile({ refresh: false });
    } catch (error) {
      schedulerWarning = 'Job deleted. Automation needs attention: ' + ns.Core.safeErrorMessage(error);
    }
    ns.SheetStore.refreshSummary();
    return {
      ok: true,
      warning: schedulerWarning,
      message: schedulerWarning || 'Job deleted. Spotify playlists were not deleted.',
      home: homeModel()
    };
  }

  function runJob(jobId) {
    var result = ns.SyncEngine.runJob(jobId);
    return {
      ok: !result.errors.length,
      result: result,
      home: homeModel()
    };
  }

  function repair() {
    ns.SheetStore.initialize({ render: false });
    var warning = '';
    try {
      ns.Scheduler.reconcile({ refresh: false });
    } catch (error) {
      warning = 'Data repaired. Automation needs attention: ' + ns.Core.safeErrorMessage(error);
    }
    if (ns.SheetViews && ns.SheetViews.initializeWorkbook) {
      ns.SheetViews.initializeWorkbook();
    } else {
      ns.SheetStore.refreshSummary();
    }
    return {
      ok: true,
      warning: warning,
      message: warning || 'Spoti Sync data is ready.',
      home: homeModel()
    };
  }

  ns.JobEditor = {
    automationModes: AUTOMATION,
    getHomeModel: homeModel,
    getEditorModel: editorModel,
    save: save,
    deleteJob: deleteJob,
    runJob: runJob,
    repair: repair,
    refreshCatalog: function () {
      var catalog = getCatalog(true);
      rememberCatalog(catalog);
      return catalog;
    },
    getCachedPlaylistName: rememberedName,

    _normalizePlaylist: normalizePlaylist,
    _cleanStoredLabel: cleanStoredLabel,
    _findPlaylistById: findPlaylistById,
    _automationForJob: automationForJob,
    _intervalForPayload: intervalForPayload,
    _editorConfig: editorConfig
  };
})(SpotiSync);
