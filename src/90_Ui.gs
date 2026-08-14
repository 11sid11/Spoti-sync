var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function setupHtml() {
    var redirectUri = ns.Auth.getRedirectUri();
    var dashboardUrl = ns.Constants.SPOTIFY_DASHBOARD_URL;

    return '<!doctype html>' +
      '<html><head><base target="_blank"><style>' +
      'body{font-family:Arial,sans-serif;color:#202124;margin:0;padding:16px;line-height:1.45}' +
      'h2{margin:0 0 6px}h3{font-size:14px;margin:18px 0 8px}.muted{color:#5f6368;font-size:12px}' +
      '.card{border:1px solid #dadce0;border-radius:8px;padding:12px;margin:10px 0}' +
      '.status{font-weight:600}.ok{color:#137333}.bad{color:#b3261e}' +
      'input{box-sizing:border-box;width:100%;padding:9px;border:1px solid #bdc1c6;border-radius:4px;margin:6px 0}' +
      'button,.button{display:inline-block;border:0;border-radius:4px;padding:9px 12px;margin:4px 4px 4px 0;background:#202124;color:#fff;text-decoration:none;cursor:pointer;font-size:13px}' +
      '.secondary{background:#f1f3f4;color:#202124}.danger{background:#b3261e}.code{font-family:monospace;font-size:11px;word-break:break-all;background:#f8f9fa;padding:8px;border-radius:4px}' +
      '#message{margin-top:10px;font-size:12px;white-space:pre-wrap}' +
      '</style></head><body>' +
      '<h2>Spoti Sync Setup</h2><div class="muted">Runs in your Google account. No Spoti Sync server is involved.</div>' +
      '<div class="card"><div>Spotify: <span id="spotifyStatus" class="status">Checking…</span></div>' +
      '<div>Scheduler: <span id="schedulerStatus" class="status">Checking…</span></div>' +
      '<div>Updates: <span id="updateStatus" class="status">Checking…</span></div></div>' +
      '<h3>1. Create a Spotify Developer app</h3>' +
      '<p class="muted">Open Spotify Developer Dashboard, create an app, and add this exact Redirect URI.</p>' +
      '<div id="redirectUri" class="code">' + ns.Core.escapeHtml(redirectUri) + '</div>' +
      '<button class="secondary" onclick="copyRedirect()">Copy Redirect URI</button>' +
      '<a class="button secondary" href="' + ns.Core.escapeHtml(dashboardUrl) + '">Open Spotify Dashboard</a>' +
      '<h3>2. Connect Spotify</h3>' +
      '<label class="muted" for="clientId">Spotify Client ID</label>' +
      '<input id="clientId" autocomplete="off" placeholder="Paste Client ID">' +
      '<button onclick="connectSpotify()">Save & Authorize Spotify</button>' +
      '<button class="secondary" onclick="refreshStatus()">Refresh status</button>' +
      '<h3>3. Scheduler</h3>' +
      '<p class="muted">Spoti Sync uses one daily Google trigger. Individual jobs decide whether they are due.</p>' +
      '<button onclick="enableScheduler()">Enable daily scheduler</button>' +
      '<button class="secondary" onclick="disableScheduler()">Disable scheduler</button>' +
      '<h3>Maintenance</h3>' +
      '<button class="secondary" onclick="checkUpdates()">Check for updates</button>' +
      '<button class="secondary" onclick="repairSheets()">Initialize / repair sheets</button>' +
      '<button class="danger" onclick="disconnectSpotify()">Disconnect Spotify</button>' +
      '<div id="message"></div>' +
      '<script>' +
      'function setMessage(text,isError){var el=document.getElementById("message");el.textContent=text||"";el.style.color=isError?"#b3261e":"#137333";}' +
      'function serverFailure(error){setMessage(error&&error.message?error.message:String(error),true);}' +
      'function refreshStatus(){google.script.run.withSuccessHandler(function(s){' +
      'var spotify=document.getElementById("spotifyStatus");spotify.textContent=s.connected?"Connected":"Not connected";spotify.className="status "+(s.connected?"ok":"bad");' +
      'var scheduler=document.getElementById("schedulerStatus");scheduler.textContent=s.schedulerEnabled?"Enabled":"Disabled";scheduler.className="status "+(s.schedulerEnabled?"ok":"bad");' +
      'var updates=document.getElementById("updateStatus");updates.textContent=s.updateLabel||"Not checked";updates.className="status "+(s.updateAvailable?"bad":"ok");' +
      'if(s.clientId&&!document.getElementById("clientId").value){document.getElementById("clientId").placeholder=s.clientId;}' +
      '}).withFailureHandler(serverFailure).spotiSyncGetSetupStatus();}' +
      'function copyRedirect(){navigator.clipboard.writeText(document.getElementById("redirectUri").textContent).then(function(){setMessage("Redirect URI copied.",false);},function(){setMessage("Copy failed. Select the URI manually.",true);});}' +
      'function connectSpotify(){var id=document.getElementById("clientId").value.trim();if(!id){setMessage("Paste your Spotify Client ID first.",true);return;}var authWindow=window.open("about:blank","_blank");' +
      'google.script.run.withSuccessHandler(function(url){setMessage("Authorization opened in a new tab. Return here after Spotify confirms the connection.",false);if(authWindow){authWindow.opener=null;authWindow.location.replace(url);}else{setMessage("Your browser blocked the Spotify authorization tab. Allow pop-ups for Google Sheets and try again.",true);}}).withFailureHandler(function(error){if(authWindow){authWindow.close();}serverFailure(error);}).spotiSyncStartAuthorization(id);}' +
      'function enableScheduler(){google.script.run.withSuccessHandler(function(){setMessage("Daily scheduler enabled.",false);refreshStatus();}).withFailureHandler(serverFailure).spotiSyncEnableScheduler();}' +
      'function disableScheduler(){google.script.run.withSuccessHandler(function(){setMessage("Scheduler disabled.",false);refreshStatus();}).withFailureHandler(serverFailure).spotiSyncDisableScheduler();}' +
      'function checkUpdates(){setMessage("Checking GitHub for updates…",false);google.script.run.withSuccessHandler(function(s){setMessage(s.updateAvailable?("Update "+s.latestVersion+" is available. Use Spoti Sync → Check for Updates to open the guided updater."):s.checkStatus,false);refreshStatus();}).withFailureHandler(serverFailure).spotiSyncCheckForUpdatesStatus();}' +
      'function repairSheets(){google.script.run.withSuccessHandler(function(){setMessage("Sheets initialized.",false);refreshStatus();}).withFailureHandler(serverFailure).spotiSyncInitializeSheets();}' +
      'function disconnectSpotify(){if(!confirm("Disconnect Spotify from this Spoti Sync installation?")){return;}google.script.run.withSuccessHandler(function(){setMessage("Spotify disconnected. Your Client ID was kept for easy reconnection.",false);refreshStatus();}).withFailureHandler(serverFailure).spotiSyncDisconnect();}' +
      'refreshStatus();' +
      '</script></body></html>';
  }

  function resultHtml(result) {
    var title = result.ok ? 'Spotify connected' : 'Connection failed';
    var color = result.ok ? '#137333' : '#b3261e';
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="font-family:Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 20px;color:#202124">' +
      '<h2 style="color:' + color + '">' + ns.Core.escapeHtml(title) + '</h2>' +
      '<p>' + ns.Core.escapeHtml(result.message) + '</p>' +
      '<button onclick="window.close()" style="padding:10px 14px;border:0;border-radius:4px;background:#202124;color:white">Close this tab</button>' +
      '</body></html>';
  }

  function updateHtml(status) {
    var title;
    var body;
    var notes = (status.notes || []).map(function (note) {
      return '<li>' + ns.Core.escapeHtml(note) + '</li>';
    }).join('');
    var actions = '';

    if (status.updateAvailable) {
      title = 'Spoti Sync ' + status.latestVersion + ' is available';
      body = '<p>You are running <strong>' + ns.Core.escapeHtml(status.currentVersion) + '</strong>. ' +
        'Updating replaces only the Apps Script code; your Sheet jobs and Spotify tokens stay in this installation.</p>' +
        (notes ? '<ul>' + notes + '</ul>' : '') +
        '<p><strong>Update steps:</strong> open the update page, copy the latest bundle, replace <code>Code.gs</code>, save, reload the Sheet, then run Initialize / Repair Sheets once.</p>';
      actions = '<a class="button" href="' + ns.Core.escapeHtml(status.installerUrl) + '" target="_blank">Open update page</a>' +
        (status.changelogUrl ? '<a class="button secondary" href="' + ns.Core.escapeHtml(status.changelogUrl) + '" target="_blank">View changelog</a>' : '');
    } else if (status.checkStatus === 'Check failed') {
      title = 'Could not check for updates';
      body = '<p>Spoti Sync is still running version <strong>' + ns.Core.escapeHtml(status.currentVersion) + '</strong>.</p>' +
        '<p class="muted">' + ns.Core.escapeHtml(status.error || 'The GitHub version check failed. Try again later.') + '</p>';
    } else {
      title = 'Spoti Sync is up to date';
      body = '<p>You are running the latest stable version: <strong>' + ns.Core.escapeHtml(status.currentVersion) + '</strong>.</p>';
      if (status.changelogUrl) {
        actions = '<a class="button secondary" href="' + ns.Core.escapeHtml(status.changelogUrl) + '" target="_blank">View changelog</a>';
      }
    }

    return '<!doctype html><html><head><base target="_blank"><style>' +
      'body{font-family:Arial,sans-serif;color:#202124;margin:0;padding:20px;line-height:1.5}' +
      'h2{margin-top:0}.muted{color:#5f6368}.button{display:inline-block;border-radius:4px;padding:9px 12px;margin:6px 6px 0 0;background:#202124;color:#fff;text-decoration:none}.secondary{background:#f1f3f4;color:#202124}' +
      'code{background:#f1f3f4;padding:2px 4px;border-radius:3px}</style></head><body>' +
      '<h2>' + ns.Core.escapeHtml(title) + '</h2>' + body + actions +
      '<p class="muted">Last checked: ' + ns.Core.escapeHtml(status.checkedAt || 'just now') + '</p>' +
      '</body></html>';
  }

  function summarizeRun(result, preview) {
    var lines = [];
    if (!result.jobs.length) {
      return preview ? 'No enabled jobs found.' : 'No enabled jobs found.';
    }

    lines.push(preview ? 'Preview — no Spotify changes were made.' : 'Sync complete.');
    lines.push('');
    result.jobs.slice(0, 20).forEach(function (job) {
      if (job.status === 'Error') {
        lines.push('✗ ' + job.job + ': ' + job.error);
      } else {
        lines.push('• ' + job.job + ': +' + job.added + ' / -' + job.removed +
          (job.ignored ? ' (' + job.ignored + ' unsupported items ignored)' : ''));
      }
    });
    if (result.jobs.length > 20) {
      lines.push('…and ' + (result.jobs.length - 20) + ' more jobs.');
    }
    if (result.errors && result.errors.length) {
      lines.push('');
      lines.push('Some jobs failed. Check the History sheet for details.');
    }
    return lines.join('\n');
  }

  ns.Ui = {
    showSetup: function () {
      ns.SheetStore.initialize();
      ns.UpdateChecker.check({ force: false });
      ns.SheetStore.refreshDashboard();
      ns.Scheduler.refreshPanel();
      var html = HtmlService.createHtmlOutput(setupHtml()).setTitle('Spoti Sync Setup');
      SpreadsheetApp.getUi().showSidebar(html);
    },

    showOAuthResult: function (result) {
      return HtmlService.createHtmlOutput(resultHtml(result));
    },

    showUpdateCheck: function () {
      var status = ns.UpdateChecker.check({ force: true });
      ns.SheetStore.refreshDashboard();
      ns.Scheduler.refreshPanel();
      var html = HtmlService.createHtmlOutput(updateHtml(status)).setWidth(520).setHeight(390);
      SpreadsheetApp.getUi().showModalDialog(html, 'Spoti Sync Updates');
    },

    promptAddJob: function () {
      var ui = SpreadsheetApp.getUi();
      var response;
      var name;
      var sourceType;
      var sourcePlaylist = '';
      var targetPlaylist;
      var strategy;
      var intervalDays;

      response = ui.prompt('Add Spoti Sync job', 'Job name (for example: Shareable Likes)', ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() !== ui.Button.OK) { return; }
      name = response.getResponseText();

      response = ui.prompt('Source', 'Enter LIKED_SONGS or PLAYLIST', ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() !== ui.Button.OK) { return; }
      sourceType = ns.Core.trim(response.getResponseText()).toUpperCase();
      if ([ns.Constants.SOURCE_TYPES.LIKED_SONGS, ns.Constants.SOURCE_TYPES.PLAYLIST].indexOf(sourceType) === -1) {
        throw new Error('Source must be LIKED_SONGS or PLAYLIST.');
      }

      if (sourceType === ns.Constants.SOURCE_TYPES.PLAYLIST) {
        response = ui.prompt('Source playlist', 'Paste the Spotify playlist URL, URI, or ID.', ui.ButtonSet.OK_CANCEL);
        if (response.getSelectedButton() !== ui.Button.OK) { return; }
        sourcePlaylist = response.getResponseText();
      }

      response = ui.prompt('Target playlist', 'Paste the Spotify playlist URL, URI, or ID that Spoti Sync may modify.', ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() !== ui.Button.OK) { return; }
      targetPlaylist = response.getResponseText();

      response = ui.prompt('Strategy', 'Enter MIRROR or APPEND', ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() !== ui.Button.OK) { return; }
      strategy = ns.Core.trim(response.getResponseText()).toUpperCase();

      response = ui.prompt('Interval', 'Run every how many days? Enter a whole number such as 1 or 10.', ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() !== ui.Button.OK) { return; }
      intervalDays = Number(response.getResponseText());

      ns.SheetStore.addJob({
        enabled: true,
        name: name,
        sourceType: sourceType,
        sourcePlaylist: sourcePlaylist,
        targetPlaylist: targetPlaylist,
        strategy: strategy,
        intervalDays: intervalDays
      });
      ui.alert('Job added', 'The job is enabled. Use Spoti Sync → Preview Enabled Jobs before your first write.', ui.ButtonSet.OK);
    },

    showPreview: function () {
      var result = ns.SyncEngine.previewEnabled();
      SpreadsheetApp.getUi().alert('Spoti Sync preview', summarizeRun(result, true), SpreadsheetApp.getUi().ButtonSet.OK);
    },

    showRunNow: function () {
      var result = ns.SyncEngine.runNow();
      SpreadsheetApp.getUi().alert('Spoti Sync', summarizeRun(result, false), SpreadsheetApp.getUi().ButtonSet.OK);
    },

    showAbout: function () {
      var updateStatus = ns.UpdateChecker.getCachedStatus();
      SpreadsheetApp.getUi().alert(
        'Spoti Sync ' + ns.VERSION,
        'Self-deployed Spotify playlist automation.\n\n' +
        'Updates: ' + ns.UpdateChecker.statusLabel(updateStatus) + '\n\n' +
        'Your OAuth tokens and scheduler stay in your Google account. Liked Songs is read-only to Spoti Sync.\n\n' +
        'Project: https://github.com/11sid11/Spoti-sync',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }
  };
})(SpotiSync);
