var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var CATALOG_CACHE_KEY = 'SPOTI_SYNC_PLAYLIST_CATALOG_V1';
  var CATALOG_TTL_SECONDS = 300;
  var NAME_PROPERTY_PREFIX = 'PLAYLIST_NAME_';
  var FRIENDLY_SOURCE_PREFIX = 'Playlist · ';
  var PLAYLIST_LINK_SUFFIX = ' ↗';
  var FREQUENCY_PRESETS = [
    'Daily', 'Every 2 days', 'Every 3 days', 'Every 7 days', 'Every 10 days',
    'Every 14 days', 'Every 30 days', 'Every 60 days', 'Every 90 days'
  ];

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
    var next = '/me/playlists?limit=50&offset=0';
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

  function stripFriendlyLabel(value) {
    var label = ns.Core.trim(value);
    if (!label) { return ''; }
    if (label.indexOf(FRIENDLY_SOURCE_PREFIX) === 0) {
      label = label.slice(FRIENDLY_SOURCE_PREFIX.length);
    }
    if (label.slice(-PLAYLIST_LINK_SUFFIX.length) === PLAYLIST_LINK_SUFFIX) {
      label = label.slice(0, -PLAYLIST_LINK_SUFFIX.length);
    }
    if (label === 'Playlist' || label === 'Open playlist' || label === 'Spotify Playlist') {
      return '';
    }
    return ns.Core.trim(label);
  }

  function sourceDisplay(name) {
    var title = ns.Core.trim(name);
    return title ? FRIENDLY_SOURCE_PREFIX + title + PLAYLIST_LINK_SUFFIX : 'Playlist ↗';
  }

  function targetDisplay(name) {
    var title = ns.Core.trim(name);
    return title ? title + PLAYLIST_LINK_SUFFIX : 'Open playlist ↗';
  }

  function playlistUrl(playlistId) {
    return 'https://open.spotify.com/playlist/' + encodeURIComponent(playlistId);
  }

  function resolveKnownName(playlistId, visibleValue) {
    return rememberedName(playlistId) || stripFriendlyLabel(visibleValue);
  }

  function richText(text, url) {
    var builder = SpreadsheetApp.newRichTextValue().setText(text || '');
    if (url) { builder.setLinkUrl(url); }
    return builder.build();
  }

  function applyFriendlyPlaylistLinks() {
    var sheet = ns.SheetStore._ensureJobsSheet();
    var columns = ns.SheetStore._jobColumns;
    var lastRow = sheet.getLastRow();
    var maxDataRows = Math.max(sheet.getMaxRows() - 1, 1);
    var rows;
    var sourceValues = [];
    var targetValues = [];

    // Source is presentation-only in v1.3.5. Playlist selection lives in the
    // Add/Edit Job sidebar, while the hidden playlist ID remains authoritative.
    sheet.getRange(2, columns.SOURCE, maxDataRows, 1).clearDataValidations();
    sheet.getRange(1, columns.SOURCE).setNote(
      'Use Spoti Sync → Add Job or Edit Selected Job to choose Liked Songs or a Spotify playlist.'
    );
    sheet.setColumnWidth(columns.SOURCE, 205);
    sheet.setColumnWidth(columns.TARGET, 205);

    if (lastRow < 2) { return; }
    rows = sheet.getRange(2, 1, lastRow - 1, ns.SheetStore.jobHeaders.length).getValues();
    rows.forEach(function (row) {
      var sourceId = ns.Core.trim(row[columns.SOURCE_PLAYLIST_ID - 1]);
      var targetId = ns.Core.trim(row[columns.TARGET_PLAYLIST_ID - 1]);
      var sourceName = resolveKnownName(sourceId, row[columns.SOURCE - 1]);
      var targetName = resolveKnownName(targetId, row[columns.TARGET - 1]);

      if (sourceId && /^[A-Za-z0-9]{10,64}$/.test(sourceId)) {
        sourceValues.push([richText(sourceDisplay(sourceName), playlistUrl(sourceId))]);
      } else {
        sourceValues.push([richText('Liked Songs', '')]);
      }

      if (targetId && /^[A-Za-z0-9]{10,64}$/.test(targetId)) {
        targetValues.push([richText(targetDisplay(targetName), playlistUrl(targetId))]);
      } else {
        targetValues.push([richText(ns.Core.trim(row[columns.TARGET - 1]), '')]);
      }
    });

    sheet.getRange(2, columns.SOURCE, sourceValues.length, 1).setRichTextValues(sourceValues);
    sheet.getRange(2, columns.TARGET, targetValues.length, 1).setRichTextValues(targetValues);
  }

  function rememberConfiguredNames(catalog) {
    var sheet = ns.SheetStore._ensureJobsSheet();
    var columns = ns.SheetStore._jobColumns;
    var lastRow = sheet.getLastRow();
    var rows;
    var unresolved = Object.create(null);

    if (lastRow < 2) {
      applyFriendlyPlaylistLinks();
      return;
    }

    rows = sheet.getRange(2, 1, lastRow - 1, ns.SheetStore.jobHeaders.length).getValues();
    rows.forEach(function (row) {
      [row[columns.SOURCE_PLAYLIST_ID - 1], row[columns.TARGET_PLAYLIST_ID - 1]].forEach(function (value) {
        var id = ns.Core.trim(value);
        var playlist;
        if (!id || rememberedName(id)) { return; }
        playlist = findPlaylistById(catalog, id);
        if (playlist) {
          rememberPlaylist(playlist);
        } else {
          unresolved[id] = true;
        }
      });
    });

    Object.keys(unresolved).forEach(function (id) {
      try {
        rememberPlaylist(getPlaylistDetails(id));
      } catch (ignored) {
        // Preserve the existing ID and label when Spotify cannot resolve it.
      }
    });
    applyFriendlyPlaylistLinks();
  }

  function currentConfigForRow(rowNumber) {
    var sheet = ns.SheetStore._ensureJobsSheet();
    var columns = ns.SheetStore._jobColumns;
    var row = sheet.getRange(rowNumber, 1, 1, ns.SheetStore.jobHeaders.length).getValues()[0];
    var sourceId = ns.Core.trim(row[columns.SOURCE_PLAYLIST_ID - 1]);
    var targetId = ns.Core.trim(row[columns.TARGET_PLAYLIST_ID - 1]);
    var intervalDays;
    var strategy;

    ns.Core.assert(rowNumber >= 2 && ns.Core.trim(row[columns.NAME - 1]), 'Select a configured job row first.');
    try { intervalDays = ns.SheetStore._parseFrequency(row[columns.FREQUENCY - 1]); } catch (ignored) { intervalDays = 1; }
    try { strategy = ns.SheetStore._parseBehaviorLabel(row[columns.BEHAVIOR - 1]); } catch (ignored2) { strategy = ns.Constants.STRATEGIES.MIRROR; }

    return {
      rowNumber: rowNumber,
      jobId: ns.Core.trim(row[columns.ID - 1]),
      enabled: ns.SheetStore._normalizeBoolean(row[columns.ENABLED - 1]),
      name: ns.Core.trim(row[columns.NAME - 1]),
      sourceType: sourceId ? ns.Constants.SOURCE_TYPES.PLAYLIST : ns.Constants.SOURCE_TYPES.LIKED_SONGS,
      sourcePlaylistId: sourceId,
      sourceName: resolveKnownName(sourceId, row[columns.SOURCE - 1]),
      targetPlaylistId: targetId,
      targetName: resolveKnownName(targetId, row[columns.TARGET - 1]),
      behavior: ns.SheetStore._behaviorLabel(strategy),
      frequency: ns.SheetStore._frequencyLabel(intervalDays)
    };
  }

  function selectedJobConfig() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss && ss.getActiveSheet();
    var range = sheet && sheet.getActiveRange();
    ns.Core.assert(sheet && sheet.getName() === ns.Constants.SHEETS.JOBS,
      'Open the Jobs sheet and select the job row you want to edit.');
    ns.Core.assert(range && range.getRow() >= 2,
      'Select a configured job row before choosing Edit Selected Job.');
    return currentConfigForRow(range.getRow());
  }

  function defaultConfig() {
    return {
      rowNumber: 0,
      jobId: '',
      enabled: true,
      name: '',
      sourceType: ns.Constants.SOURCE_TYPES.LIKED_SONGS,
      sourcePlaylistId: '',
      sourceName: '',
      targetPlaylistId: '',
      targetName: '',
      behavior: 'Exact Mirror',
      frequency: 'Daily'
    };
  }

  function jsonForHtml(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  function editorHtml(model) {
    var data = jsonForHtml(model);
    return '<!doctype html><html><head><base target="_blank"><style>' +
      'body{font-family:Arial,sans-serif;color:#202124;margin:0;padding:16px;line-height:1.4}' +
      'h2{margin:0 0 4px}.muted{font-size:12px;color:#5f6368}.section{margin-top:18px}' +
      'label{display:block;font-size:12px;font-weight:600;margin:9px 0 4px}' +
      'input,select{box-sizing:border-box;width:100%;padding:8px;border:1px solid #bdc1c6;border-radius:4px;background:#fff}' +
      'select[size]{padding:2px}.row{display:flex;gap:8px}.row>*{flex:1}.hidden{display:none}' +
      '.check{display:flex;align-items:center;gap:8px;margin-top:10px}.check input{width:auto}' +
      'button{border:0;border-radius:4px;padding:9px 12px;background:#202124;color:#fff;cursor:pointer}' +
      'button.secondary{background:#f1f3f4;color:#202124}.actions{display:flex;gap:8px;margin-top:20px}' +
      '#message{font-size:12px;margin-top:10px;white-space:pre-wrap}.ok{color:#137333}.bad{color:#b3261e}' +
      '</style></head><body>' +
      '<h2>' + (model.mode === 'edit' ? 'Edit Job' : 'Add Job') + '</h2>' +
      '<div class="muted">Choose playlists by name. Spoti Sync keeps their Spotify IDs internally.</div>' +
      '<div class="section"><label for="jobName">Job name</label><input id="jobName" maxlength="120">' +
      '<label class="check"><input type="checkbox" id="enabled"> Enabled</label></div>' +
      '<div class="section"><label for="sourceType">Source</label><select id="sourceType">' +
      '<option value="LIKED_SONGS">Liked Songs</option><option value="PLAYLIST">Spotify playlist</option></select>' +
      '<div id="sourcePlaylistSection" class="hidden"><label for="sourceSearch">Find source playlist</label>' +
      '<input id="sourceSearch" placeholder="Search your playlists"><select id="sourcePlaylist" size="6"></select>' +
      '<label for="sourceManual">Not listed? Paste Spotify playlist link or ID</label><input id="sourceManual" placeholder="https://open.spotify.com/playlist/…"></div></div>' +
      '<div class="section"><label for="targetMode">Target</label><select id="targetMode">' +
      '<option value="existing">Existing Spotify playlist</option><option value="create">Create new playlist</option></select>' +
      '<div id="targetExisting"><label for="targetSearch">Find target playlist</label>' +
      '<input id="targetSearch" placeholder="Search your playlists"><select id="targetPlaylist" size="6"></select>' +
      '<label for="targetManual">Not listed? Paste Spotify playlist link or ID</label><input id="targetManual" placeholder="https://open.spotify.com/playlist/…"></div>' +
      '<div id="targetCreate" class="hidden"><label for="newTargetName">New playlist name</label><input id="newTargetName" maxlength="120">' +
      '<label class="check"><input type="checkbox" id="targetPublic"> Public playlist</label></div></div>' +
      '<div class="section row"><div><label for="behavior">Behavior</label><select id="behavior"><option>Exact Mirror</option><option>Append Only</option></select></div>' +
      '<div><label for="frequency">Frequency</label><input id="frequency" list="frequencyPresets"><datalist id="frequencyPresets">' +
      FREQUENCY_PRESETS.map(function (item) { return '<option value="' + ns.Core.escapeHtml(item) + '"></option>'; }).join('') +
      '</datalist></div></div>' +
      '<div class="actions"><button id="saveButton" onclick="saveJob()">Save Job</button>' +
      '<button class="secondary" onclick="refreshCatalog()">Refresh playlists</button></div><div id="message"></div>' +
      '<script>var MODEL=' + data + ';var catalog=MODEL.catalog||[];var sourceSelected=MODEL.config.sourcePlaylistId||"";var targetSelected=MODEL.config.targetPlaylistId||"";' +
      'function el(id){return document.getElementById(id);}function msg(text,bad){var m=el("message");m.textContent=text||"";m.className=bad?"bad":"ok";}' +
      'function label(p){var bits=[p.name];if(p.itemCount){bits.push(p.itemCount+" tracks");}if(p.owner){bits.push(p.owner);}return bits.join(" · ");}' +
      'function render(which){var search=el(which+"Search").value.toLowerCase();var select=el(which+"Playlist");var selected=which==="source"?sourceSelected:targetSelected;select.innerHTML="";' +
      'var shown=catalog.filter(function(p){return !search||p.name.toLowerCase().indexOf(search)!==-1||p.owner.toLowerCase().indexOf(search)!==-1;});' +
      'if(selected&&!shown.some(function(p){return p.id===selected;})){var current=catalog.find(function(p){return p.id===selected;});if(current){shown.unshift(current);}}' +
      'shown.forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=label(p);if(p.id===selected){o.selected=true;}select.appendChild(o);});}' +
      'function toggle(){var playlist=el("sourceType").value==="PLAYLIST";el("sourcePlaylistSection").className=playlist?"":"hidden";var create=el("targetMode").value==="create";el("targetExisting").className=create?"hidden":"";el("targetCreate").className=create?"":"hidden";}' +
      'function init(){var c=MODEL.config;el("jobName").value=c.name||"";el("enabled").checked=c.enabled!==false;el("sourceType").value=c.sourceType||"LIKED_SONGS";el("behavior").value=c.behavior||"Exact Mirror";el("frequency").value=c.frequency||"Daily";render("source");render("target");toggle();}' +
      'el("sourceSearch").addEventListener("input",function(){render("source");});el("targetSearch").addEventListener("input",function(){render("target");});' +
      'el("sourcePlaylist").addEventListener("change",function(){sourceSelected=this.value;});el("targetPlaylist").addEventListener("change",function(){targetSelected=this.value;});el("sourceType").addEventListener("change",toggle);el("targetMode").addEventListener("change",toggle);' +
      'function saveJob(){var button=el("saveButton");button.disabled=true;msg("Saving…",false);var payload={mode:MODEL.mode,jobId:MODEL.config.jobId||"",name:el("jobName").value,enabled:el("enabled").checked,sourceType:el("sourceType").value,sourcePlaylistId:sourceSelected,sourceManual:el("sourceManual").value,targetMode:el("targetMode").value,targetPlaylistId:targetSelected,targetManual:el("targetManual").value,newTargetName:el("newTargetName").value,targetPublic:el("targetPublic").checked,behavior:el("behavior").value,frequency:el("frequency").value};' +
      'google.script.run.withSuccessHandler(function(r){msg((r&&r.message)||"Job saved.",false);setTimeout(function(){google.script.host.close();},500);}).withFailureHandler(function(e){button.disabled=false;msg(e&&e.message?e.message:String(e),true);}).spotiSyncSaveJobEditor(payload);}' +
      'function refreshCatalog(){msg("Refreshing playlists…",false);google.script.run.withSuccessHandler(function(list){catalog=list||[];render("source");render("target");msg("Playlist list refreshed.",false);}).withFailureHandler(function(e){msg(e&&e.message?e.message:String(e),true);}).spotiSyncRefreshJobEditorCatalog();}' +
      'init();</script></body></html>';
  }

  function openEditor(mode) {
    ns.Core.assert(ns.Auth.isConnected(), 'Connect Spotify from Spoti Sync → Setup before configuring jobs.');
    ns.SheetStore._ensureJobsSheet();
    var catalog = getCatalog(false);
    rememberConfiguredNames(catalog);
    var config = mode === 'edit' ? selectedJobConfig() : defaultConfig();
    var editorCatalog = catalog.slice();

    [
      { id: config.sourcePlaylistId, name: config.sourceName },
      { id: config.targetPlaylistId, name: config.targetName }
    ].forEach(function (current) {
      if (current.id && !findPlaylistById(editorCatalog, current.id)) {
        editorCatalog.unshift({
          id: current.id,
          name: current.name || 'Current playlist',
          url: playlistUrl(current.id),
          owner: 'Current configuration',
          isPublic: false,
          collaborative: false,
          itemCount: 0
        });
      }
    });

    var html = HtmlService.createHtmlOutput(editorHtml({ mode: mode, config: config, catalog: editorCatalog }))
      .setTitle(mode === 'edit' ? 'Edit Spoti Sync Job' : 'Add Spoti Sync Job');
    SpreadsheetApp.getUi().showSidebar(html);
  }

  function resolvePlaylistReference(selectedId, manualValue, catalog) {
    var raw = ns.Core.trim(manualValue) || ns.Core.trim(selectedId);
    var id = ns.Core.parsePlaylistId(raw);
    return findPlaylistById(catalog, id) || getPlaylistDetails(id);
  }

  function findRowByJobId(jobId) {
    var sheet = ns.SheetStore._ensureJobsSheet();
    var columns = ns.SheetStore._jobColumns;
    var lastRow = sheet.getLastRow();
    var values;
    var index;
    if (!jobId || lastRow < 2) { return 0; }
    values = sheet.getRange(2, columns.ID, lastRow - 1, 1).getValues();
    for (index = 0; index < values.length; index += 1) {
      if (ns.Core.trim(values[index][0]) === jobId) { return index + 2; }
    }
    return 0;
  }

  function newJobId() {
    return 'job_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  }

  function writeConfiguration(payload, sourcePlaylist, targetPlaylist, strategy, intervalDays) {
    var sheet = ns.SheetStore._ensureJobsSheet();
    var columns = ns.SheetStore._jobColumns;
    var rowNumber = payload.mode === 'edit' ? findRowByJobId(ns.Core.trim(payload.jobId)) : 0;
    var jobId = ns.Core.trim(payload.jobId) || newJobId();
    var sourceId = sourcePlaylist ? sourcePlaylist.id : '';
    var sourceText = sourcePlaylist ? sourceDisplay(sourcePlaylist.name) : 'Liked Songs';
    var targetText = targetDisplay(targetPlaylist.name);
    var visible = [
      payload.enabled === true,
      ns.Core.trim(payload.name) || 'Spotify Sync',
      sourceText,
      targetText,
      ns.SheetStore._behaviorLabel(strategy),
      ns.SheetStore._frequencyLabel(intervalDays)
    ];

    if (payload.mode === 'edit') {
      ns.Core.assert(rowNumber, 'This job moved or was removed. Reopen Edit Selected Job and try again.');
      sheet.getRange(rowNumber, 1, 1, visible.length).setValues([visible]);
      sheet.getRange(rowNumber, columns.SOURCE_PLAYLIST_ID, 1, 2).setValues([[sourceId, targetPlaylist.id]]);
      if (!ns.Core.trim(sheet.getRange(rowNumber, columns.ID).getValue())) {
        sheet.getRange(rowNumber, columns.ID).setValue(jobId);
      }
    } else {
      rowNumber = Math.max(sheet.getLastRow() + 1, 2);
      var row = new Array(ns.SheetStore.jobHeaders.length).fill('');
      visible.forEach(function (value, index) { row[index] = value; });
      row[columns.ID - 1] = jobId;
      row[columns.SOURCE_PLAYLIST_ID - 1] = sourceId;
      row[columns.TARGET_PLAYLIST_ID - 1] = targetPlaylist.id;
      row[columns.LAST_ADDED - 1] = 0;
      row[columns.LAST_REMOVED - 1] = 0;
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    }

    if (sourcePlaylist) { rememberPlaylist(sourcePlaylist); }
    rememberPlaylist(targetPlaylist);
    return { rowNumber: rowNumber, jobId: jobId };
  }

  function save(payload) {
    var data = payload || {};
    var sourceType = ns.Core.trim(data.sourceType).toUpperCase();
    var catalog;
    var sourcePlaylist = null;
    var targetPlaylist;
    var strategy;
    var intervalDays;
    var written;

    ns.Core.assert(data.mode === 'add' || data.mode === 'edit', 'Invalid job editor mode.');
    ns.Core.assert([ns.Constants.SOURCE_TYPES.LIKED_SONGS, ns.Constants.SOURCE_TYPES.PLAYLIST].indexOf(sourceType) !== -1,
      'Choose Liked Songs or a Spotify playlist as the source.');
    strategy = ns.SheetStore._parseBehaviorLabel(data.behavior);
    intervalDays = ns.SheetStore._parseFrequency(data.frequency);
    catalog = getCatalog(false);

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

    written = writeConfiguration(data, sourcePlaylist, targetPlaylist, strategy, intervalDays);
    if (ns.SheetViews) {
      ns.SheetViews.refreshJobsStatus();
      ns.SheetViews.refreshSchedule();
      ns.SheetViews.refreshDashboard();
    } else {
      applyFriendlyPlaylistLinks();
    }
    return {
      ok: true,
      jobId: written.jobId,
      rowNumber: written.rowNumber,
      message: data.mode === 'edit' ? 'Job updated.' : 'Job added.'
    };
  }

  ns.JobEditor = {
    showAdd: function () { openEditor('add'); },
    showEdit: function () { openEditor('edit'); },
    save: save,
    refreshCatalog: function () {
      var catalog = getCatalog(true);
      rememberConfiguredNames(catalog);
      return catalog;
    },
    refreshPlaylistNames: function () {
      if (!ns.Auth.isConnected()) { return false; }
      rememberConfiguredNames(getCatalog(false));
      return true;
    },
    applyFriendlyPlaylistLinks: applyFriendlyPlaylistLinks,
    _normalizePlaylist: normalizePlaylist,
    _findPlaylistById: findPlaylistById,
    _sourceDisplay: sourceDisplay,
    _targetDisplay: targetDisplay,
    _stripFriendlyLabel: stripFriendlyLabel,
    _writeConfiguration: writeConfiguration
  };

  // Keep the stable v1.3.3/v1.3.4 SheetViews implementation, then add the
  // presentation-only friendly playlist labels without extra Spotify calls.
  if (ns.SheetViews) {
    (function () {
      var originalRefreshJobsStatus = ns.SheetViews.refreshJobsStatus;
      var originalRefreshAll = ns.SheetViews.refreshAll;
      ns.SheetViews.refreshJobsStatus = function () {
        originalRefreshJobsStatus();
        applyFriendlyPlaylistLinks();
      };
      ns.SheetViews.refreshAll = function () {
        originalRefreshAll();
        applyFriendlyPlaylistLinks();
      };
    })();
  }

  // Preserve any callers of the old prompt entry while routing them to the
  // new editor. The multi-prompt implementation remains inert and can be
  // deleted in a later source-only cleanup without changing behavior.
  if (ns.Ui) {
    ns.Ui.promptAddJob = function () { ns.JobEditor.showAdd(); };
  }
})(SpotiSync);
