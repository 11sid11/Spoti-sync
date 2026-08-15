var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function jsonForHtml(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  function appHtml(model) {
    var data = jsonForHtml(model);

    return '<!doctype html><html><head><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' +
      ':root{font-family:Arial,sans-serif;color:#202124}body{margin:0;padding:14px;line-height:1.4;background:#fff}' +
      'h2{margin:0;font-size:20px}h3{font-size:13px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:#5f6368}' +
      '.top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}.version{font-size:11px;color:#5f6368}' +
      '.card{border:1px solid #dadce0;border-radius:10px;padding:12px;margin:10px 0;background:#fff}.job-title{font-weight:700;font-size:14px}' +
      '.muted{color:#5f6368;font-size:12px}.status{font-size:12px;margin-top:6px}.ok{color:#137333}.warn{color:#b06000}.bad{color:#b3261e}' +
      '.row{display:flex;gap:8px}.row>*{flex:1}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}' +
      'button,.button{border:0;border-radius:5px;padding:8px 10px;background:#202124;color:#fff;cursor:pointer;font-size:12px;text-decoration:none;display:inline-block}' +
      'button.secondary,.button.secondary{background:#f1f3f4;color:#202124}button.danger{background:#b3261e}button:disabled{opacity:.55;cursor:default}' +
      'input,select{box-sizing:border-box;width:100%;padding:8px;border:1px solid #bdc1c6;border-radius:5px;background:#fff}' +
      'label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}.choice{display:flex;align-items:center;gap:7px;margin:7px 0;font-size:13px}.choice input{width:auto}' +
      '.hidden{display:none}.playlist-list{height:132px;margin-top:5px}.section{margin-top:15px}.divider{height:1px;background:#e8eaed;margin:14px 0}' +
      '.banner{border-radius:7px;padding:9px 10px;margin:8px 0;font-size:12px;background:#f1f3f4}.banner.ok{background:#e6f4ea}.banner.warn{background:#fef7e0}.banner.bad{background:#fce8e6}' +
      '.automation-row{display:flex;align-items:center;gap:6px}.automation-row input{width:82px}.small{font-size:11px;color:#5f6368}' +
      'details{border-top:1px solid #e8eaed;margin-top:14px;padding-top:10px}summary{cursor:pointer;font-size:12px;font-weight:600}' +
      '.code{font-family:monospace;font-size:10px;word-break:break-all;background:#f8f9fa;padding:7px;border-radius:4px}' +
      '#toast{position:sticky;bottom:0;margin-top:12px}.empty{text-align:center;padding:20px 10px;color:#5f6368}' +
      '</style></head><body><div id="root"></div><div id="toast"></div>' +
      '<script>' +
      'var STATE=' + data + ';var EDITOR=null;var SOURCE_SELECTED="";var TARGET_SELECTED="";' +
      'function el(id){return document.getElementById(id);}function esc(s){return String(s==null?"":s).replace(/[&<>"\']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\'":"&#39;"}[c];});}' +
      'function toast(text,type){var t=el("toast");if(!t)return;t.innerHTML=text?("<div class=\\"banner "+(type||"")+"\\">"+esc(text)+"</div>"):"";}' +
      'function fail(e){toast(e&&e.message?e.message:String(e),"bad");}' +
      'function rpc(name,args,ok){var runner=google.script.run.withSuccessHandler(ok).withFailureHandler(fail);runner[name].apply(runner,args||[]);}' +
      'function top(){return "<div class=\\"top\\"><div><h2>Spoti Sync</h2><div class=\\"muted\\">Spotify automation, kept simple.</div></div><div class=\\"version\\">v"+esc(STATE.version)+"</div></div>";}' +
      'function renderHome(model){STATE=model||STATE;EDITOR=null;SOURCE_SELECTED="";TARGET_SELECTED="";var r=el("root");var html=top();' +
      'if(!STATE.connected){html+=renderConnect();r.innerHTML=html;bindConnect();return;}' +
      'html+="<div class=\\"card\\"><div><strong>Spotify</strong> <span class=\\"ok\\">Connected ✓</span></div><div class=\\"muted\\">Automation: "+esc(automationStatus())+"</div></div>";' +
      'html+="<h3>Your jobs</h3><div id=\\"jobs\\"></div><button id=\\"addJob\\">+ Add job</button>"+renderSettings();r.innerHTML=html;renderJobCards();' +
      'el("addJob").onclick=function(){openEditor("");};bindSettings();}' +
      'function automationStatus(){var a=STATE.automation||{};if(!a.automatedJobs)return "Off · no automated jobs";if(a.enabled)return "Running · "+a.automatedJobs+" job"+(a.automatedJobs===1?"":"s");return "Needs attention";}' +
      'function renderJobCards(){var box=el("jobs");box.innerHTML="";if(!STATE.jobs||!STATE.jobs.length){box.innerHTML="<div class=\\"empty\\">No jobs yet.<br>Add one source → target automation.</div>";return;}' +
      'STATE.jobs.forEach(function(j){var c=document.createElement("div");c.className="card";var title=document.createElement("div");title.className="job-title";title.textContent=j.name;c.appendChild(title);' +
      'var route=document.createElement("div");route.className="muted";route.textContent=j.source+" → "+j.target;c.appendChild(route);' +
      'var meta=document.createElement("div");meta.className="muted";meta.textContent=j.behavior+" · "+j.automation;c.appendChild(meta);' +
      'var status=document.createElement("div");status.className="status "+(String(j.status).indexOf("✕")===0?"bad":String(j.status).indexOf("⚠")===0?"warn":"ok");status.textContent=j.status+" · Last sync: "+j.lastSuccess;c.appendChild(status);' +
      'if(j.lastError){var err=document.createElement("div");err.className="small";err.textContent=j.lastError;c.appendChild(err);}' +
      'var a=document.createElement("div");a.className="actions";var run=document.createElement("button");run.textContent="Sync now";run.onclick=function(){runJob(j);};a.appendChild(run);' +
      'var edit=document.createElement("button");edit.className="secondary";edit.textContent="Edit";edit.onclick=function(){openEditor(j.jobId);};a.appendChild(edit);c.appendChild(a);box.appendChild(c);});}' +
      'function renderConnect(){return "<div class=\\"card\\"><div class=\\"job-title\\">Connect Spotify</div><div class=\\"muted\\">Spoti Sync runs in your Google account. No Spoti Sync server stores your tokens.</div>"+' +
      '"<label>Spotify Client ID</label><input id=\\"clientId\\" autocomplete=\\"off\\" placeholder=\\""+esc(STATE.clientIdHint||"Paste Client ID")+"\\">"+' +
      '"<label>Redirect URI</label><div id=\\"redirectUri\\" class=\\"code\\">"+esc(STATE.redirectUri)+"</div><div class=\\"actions\\"><button id=\\"connect\\">Save & authorize</button><button class=\\"secondary\\" id=\\"copyRedirect\\">Copy URI</button><a class=\\"button secondary\\" href=\\""+esc(STATE.spotifyDashboardUrl)+"\\">Spotify Dashboard</a><button class=\\"secondary\\" id=\\"refreshHome\\">Refresh</button></div></div>";}' +
      'function bindConnect(){el("copyRedirect").onclick=function(){navigator.clipboard.writeText(el("redirectUri").textContent).then(function(){toast("Redirect URI copied.","ok");},function(){toast("Copy failed. Select it manually.","bad");});};' +
      'el("refreshHome").onclick=refreshHome;el("connect").onclick=function(){var id=el("clientId").value.trim();if(!id&&!STATE.clientIdHint){toast("Paste your Spotify Client ID first.","bad");return;}var w=window.open("about:blank","_blank");rpc("spotiSyncStartAuthorization",[id],function(url){toast("Spotify authorization opened. Return here after it finishes.","ok");if(w){w.opener=null;w.location.replace(url);}else{toast("Allow pop-ups for Google Sheets and try again.","bad");}});};}' +
      'function renderSettings(){return "<details><summary>Settings</summary><div class=\\"actions\\"><button class=\\"secondary\\" id=\\"checkUpdates\\">Check updates</button><button class=\\"secondary\\" id=\\"repair\\">Repair data</button><button class=\\"secondary\\" id=\\"disconnect\\">Disconnect Spotify</button></div><div class=\\"small\\">Project: "+esc(STATE.projectUrl)+"</div></details>";}' +
      'function bindSettings(){el("checkUpdates").onclick=function(){toast("Checking for updates…","");rpc("spotiSyncCheckForUpdatesStatus",[],function(s){toast(s.updateAvailable?("Spoti Sync "+s.latestVersion+" is available. Open "+s.installerUrl):s.checkStatus,s.updateAvailable?"warn":"ok");});};' +
      'el("repair").onclick=function(){if(!confirm("Repair Spoti Sync data and reconcile automation? Your Spotify credentials and playlist IDs are preserved."))return;rpc("spotiSyncRepairApp",[],function(r){renderHome(r.home);toast(r.message,r.warning?"warn":"ok");});};' +
      'el("disconnect").onclick=function(){if(!confirm("Disconnect Spotify? Your Client ID and jobs will be kept."))return;rpc("spotiSyncDisconnect",[],function(home){renderHome(home);toast("Spotify disconnected. Jobs were kept.","ok");});};}' +
      'function openEditor(jobId){toast("Loading playlists…","");rpc("spotiSyncGetJobEditorModel",[jobId||""],function(m){EDITOR=m;SOURCE_SELECTED=m.config.sourcePlaylistId||"";TARGET_SELECTED=m.config.targetPlaylistId||"";renderEditor();toast("","");});}' +
      'function renderEditor(){var c=EDITOR.config;var html=top()+"<button class=\\"secondary\\" id=\\"back\\">← Back</button><h3>"+(EDITOR.mode==="edit"?"Edit job":"Add job")+"</h3>";if(EDITOR.catalogWarning){html+="<div class=\\"banner warn\\">"+esc(EDITOR.catalogWarning)+"</div>";}' +
      'html+="<div class=\\"section\\"><label>Source</label><select id=\\"sourceType\\"><option value=\\"LIKED_SONGS\\">Liked Songs</option><option value=\\"PLAYLIST\\">Spotify playlist</option></select><div id=\\"sourcePlaylistBox\\"><label>Find source playlist</label><input id=\\"sourceSearch\\" placeholder=\\"Search playlists\\"><select id=\\"sourcePlaylist\\" class=\\"playlist-list\\" size=\\"6\\"></select><label>Or paste playlist link / ID</label><input id=\\"sourceManual\\" placeholder=\\"https://open.spotify.com/playlist/…\\"></div></div>";' +
      'html+="<div class=\\"section\\"><label>Target</label><select id=\\"targetMode\\"><option value=\\"existing\\">Existing playlist</option><option value=\\"create\\">Create new playlist</option></select><div id=\\"targetExisting\\"><label>Find target playlist</label><input id=\\"targetSearch\\" placeholder=\\"Search playlists\\"><select id=\\"targetPlaylist\\" class=\\"playlist-list\\" size=\\"6\\"></select><label>Or paste playlist link / ID</label><input id=\\"targetManual\\" placeholder=\\"https://open.spotify.com/playlist/…\\"></div><div id=\\"targetCreate\\"><label>Playlist name</label><input id=\\"newTargetName\\" maxlength=\\"120\\"><label class=\\"choice\\"><input type=\\"checkbox\\" id=\\"targetPublic\\"> Public playlist</label></div></div>";' +
      'html+="<div class=\\"section\\"><label>Behavior</label><select id=\\"behavior\\"></select></div>";' +
      'html+="<div class=\\"section\\"><label>Automation</label><label class=\\"choice\\"><input type=\\"radio\\" name=\\"automation\\" value=\\"OFF\\"> Off</label><label class=\\"choice\\"><input type=\\"radio\\" name=\\"automation\\" value=\\"DAILY\\"> Daily</label><label class=\\"choice\\"><input type=\\"radio\\" name=\\"automation\\" value=\\"INTERVAL\\"> Every <input id=\\"intervalDays\\" type=\\"number\\" min=\\""+EDITOR.frequencyLimits.min+"\\" max=\\""+EDITOR.frequencyLimits.max+"\\" step=\\"1\\" style=\\"width:72px\\"> days</label></div>";' +
      'html+="<div class=\\"section\\"><label class=\\"choice\\"><input type=\\"checkbox\\" id=\\"heartbeat\\"> Show Spoti Sync status in playlist description</label><div class=\\"small\\">Adds the latest successful sync time and sid.is-a.dev to the target playlist description.</div></div>";' +
      'html+="<details><summary>Advanced</summary><label>Custom job name</label><input id=\\"jobName\\" maxlength=\\"120\\" placeholder=\\"Automatically uses Source → Target\\"></details>";' +
      'html+="<div class=\\"actions\\"><button id=\\"save\\">"+(EDITOR.mode==="edit"?"Save changes":"Add job")+"</button><button class=\\"secondary\\" id=\\"refreshCatalog\\">Refresh playlists</button>"+(EDITOR.mode==="edit"?"<button class=\\"danger\\" id=\\"delete\\">Delete job</button>":"")+"</div>";' +
      'el("root").innerHTML=html;el("back").onclick=function(){renderHome(STATE);};' +
      'el("sourceType").value=c.sourceType;el("behavior").innerHTML=EDITOR.behaviorOptions.map(function(x){return "<option>"+esc(x)+"</option>";}).join("");el("behavior").value=c.behavior;' +
      'el("jobName").value=c.name||"";el("heartbeat").checked=c.heartbeatEnabled!==false;el("intervalDays").value=c.intervalDays||1;' +
      'Array.from(document.querySelectorAll("input[name=automation]")).forEach(function(x){x.checked=x.value===c.automation;x.onchange=toggleAutomation;});' +
      'el("sourceType").onchange=toggleEditor;el("targetMode").onchange=toggleEditor;el("sourceSearch").oninput=function(){renderPlaylist("source");};el("targetSearch").oninput=function(){renderPlaylist("target");};' +
      'el("sourcePlaylist").onchange=function(){SOURCE_SELECTED=this.value;};el("targetPlaylist").onchange=function(){TARGET_SELECTED=this.value;};' +
      'el("save").onclick=saveJob;el("refreshCatalog").onclick=refreshCatalog;if(el("delete"))el("delete").onclick=deleteJob;renderPlaylist("source");renderPlaylist("target");toggleEditor();toggleAutomation();}' +
      'function toggleEditor(){el("sourcePlaylistBox").className=el("sourceType").value==="PLAYLIST"?"":"hidden";var create=el("targetMode").value==="create";el("targetExisting").className=create?"hidden":"";el("targetCreate").className=create?"":"hidden";}' +
      'function currentAutomation(){var x=document.querySelector("input[name=automation]:checked");return x?x.value:"DAILY";}function toggleAutomation(){el("intervalDays").disabled=currentAutomation()!=="INTERVAL";}' +
      'function playlistLabel(p){var bits=[p.name];if(p.itemCount)bits.push(p.itemCount+" tracks");if(p.owner)bits.push(p.owner);return bits.join(" · ");}' +
      'function renderPlaylist(which){var search=el(which+"Search").value.toLowerCase();var select=el(which+"Playlist");var selected=which==="source"?SOURCE_SELECTED:TARGET_SELECTED;select.innerHTML="";(EDITOR.catalog||[]).filter(function(p){return !search||p.name.toLowerCase().indexOf(search)!==-1||String(p.owner||"").toLowerCase().indexOf(search)!==-1;}).forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=playlistLabel(p);if(p.id===selected)o.selected=true;select.appendChild(o);});}' +
      'function saveJob(){var button=el("save");button.disabled=true;var payload={jobId:EDITOR.config.jobId||"",name:el("jobName").value,sourceType:el("sourceType").value,sourcePlaylistId:SOURCE_SELECTED,sourceManual:el("sourceManual").value,targetMode:el("targetMode").value,targetPlaylistId:TARGET_SELECTED,targetManual:el("targetManual").value,newTargetName:el("newTargetName").value,targetPublic:el("targetPublic").checked,behavior:el("behavior").value,automation:currentAutomation(),intervalDays:el("intervalDays").value,heartbeatEnabled:el("heartbeat").checked};toast("Saving…","");rpc("spotiSyncSaveJob",[payload],function(r){renderHome(r.home);toast(r.message,r.warning?"warn":"ok");});}' +
      'function refreshCatalog(){toast("Refreshing playlists…","");rpc("spotiSyncRefreshJobCatalog",[],function(list){EDITOR.catalog=list||[];renderPlaylist("source");renderPlaylist("target");toast("Playlist list refreshed.","ok");});}' +
      'function deleteJob(){if(!confirm("Delete this Spoti Sync job? This does not delete either Spotify playlist."))return;rpc("spotiSyncDeleteJob",[EDITOR.config.jobId],function(r){renderHome(r.home);toast(r.message,r.warning?"warn":"ok");});}' +
      'function runJob(job){if(job.behavior==="Exact Mirror"&&!confirm("Run "+job.name+" now? Exact Mirror may remove tracks from the target so it matches the source."))return;toast("Syncing "+job.name+"…","");rpc("spotiSyncRunJob",[job.jobId],function(r){renderHome(r.home);var j=r.result&&r.result.jobs&&r.result.jobs[0];if(j&&j.status==="Error"){toast(j.error||"Sync failed.","bad");}else if(j){toast("Synced: +"+j.added+" / -"+j.removed+(j.warning?" · "+j.warning:""),j.warning?"warn":"ok");}else{toast("Sync complete.","ok");}});}' +
      'function refreshHome(){rpc("spotiSyncGetAppHome",[],function(m){renderHome(m);toast("Status refreshed.","ok");});}' +
      'renderHome(STATE);' +
      '</script></body></html>';
  }

  function resultHtml(result) {
    var title = result.ok ? 'Spotify connected' : 'Connection failed';
    var color = result.ok ? '#137333' : '#b3261e';
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="font-family:Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 20px;color:#202124">' +
      '<h2 style="color:' + color + '">' + ns.Core.escapeHtml(title) + '</h2>' +
      '<p>' + ns.Core.escapeHtml(result.message) + '</p>' +
      '<p>Return to the Spoti Sync sidebar and choose Refresh.</p>' +
      '<button onclick="window.close()" style="padding:10px 14px;border:0;border-radius:4px;background:#202124;color:white">Close this tab</button>' +
      '</body></html>';
  }

  ns.Ui = {
    showApp: function () {
      ns.SheetStore.initialize({ render: false });
      try {
        ns.Scheduler.reconcile({ refresh: false });
      } catch (ignored) {
        // The app home exposes automation health without blocking access.
      }
      if (ns.SheetViews && ns.SheetViews.initializeWorkbook) {
        ns.SheetViews.initializeWorkbook();
      }
      var html = HtmlService.createHtmlOutput(appHtml(ns.JobEditor.getHomeModel()))
        .setTitle('Spoti Sync');
      SpreadsheetApp.getUi().showSidebar(html);
    },

    showOAuthResult: function (result) {
      return HtmlService.createHtmlOutput(resultHtml(result));
    },

    _appHtml: appHtml
  };
})(SpotiSync);
