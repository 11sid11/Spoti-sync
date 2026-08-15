var SpotiSync = SpotiSync || {};

function onOpen() {
  'use strict';
  SpreadsheetApp.getUi()
    .createMenu('Spoti Sync')
    .addItem('Open Spoti Sync', 'spotiSyncOpenApp')
    .addToUi();
}

function spotiSyncOpenApp() {
  'use strict';
  SpotiSync.Ui.showApp();
}

// Compatibility alias for older menu/install instructions. It intentionally
// opens the same single v1.4 application surface.
function spotiSyncSetup() {
  'use strict';
  return spotiSyncOpenApp();
}

function spotiSyncGetAppHome() {
  'use strict';
  return SpotiSync.JobEditor.getHomeModel();
}

function spotiSyncGetJobEditorModel(jobId) {
  'use strict';
  return SpotiSync.JobEditor.getEditorModel(jobId);
}

function spotiSyncSaveJob(payload) {
  'use strict';
  return SpotiSync.JobEditor.save(payload);
}

function spotiSyncDeleteJob(jobId) {
  'use strict';
  return SpotiSync.JobEditor.deleteJob(jobId);
}

function spotiSyncRunJob(jobId) {
  'use strict';
  return SpotiSync.JobEditor.runJob(jobId);
}

function spotiSyncRefreshJobCatalog() {
  'use strict';
  return SpotiSync.JobEditor.refreshCatalog();
}

function spotiSyncRepairApp() {
  'use strict';
  return SpotiSync.JobEditor.repair();
}

function spotiSyncStartAuthorization(clientId) {
  'use strict';
  return SpotiSync.Auth.startAuthorization(clientId);
}

function spotiSyncOAuthCallback(event) {
  'use strict';
  var result = SpotiSync.Auth.handleCallback(event);
  return SpotiSync.Ui.showOAuthResult(result);
}

function spotiSyncDisconnect() {
  'use strict';
  SpotiSync.Auth.disconnect();
  SpotiSync.SheetStore.refreshSummary();
  return SpotiSync.JobEditor.getHomeModel();
}

function spotiSyncCheckForUpdatesStatus() {
  'use strict';
  var status = SpotiSync.UpdateChecker.check({ force: true });
  SpotiSync.SheetStore.refreshSummary();
  return status;
}

function spotiSyncScheduler() {
  'use strict';
  SpotiSync.Scheduler.runDue();
}

// Compatibility RPCs retained for old installed callbacks/bookmarks. They are
// not exposed in the v1.4 menu and route to the same canonical implementation.
function spotiSyncInitializeSheets() {
  'use strict';
  return SpotiSync.JobEditor.repair();
}

function spotiSyncAddJob() {
  'use strict';
  return spotiSyncOpenApp();
}

function spotiSyncEditJob() {
  'use strict';
  return spotiSyncOpenApp();
}

function spotiSyncSaveJobEditor(payload) {
  'use strict';
  return SpotiSync.JobEditor.save(payload);
}

function spotiSyncRefreshJobEditorCatalog() {
  'use strict';
  return SpotiSync.JobEditor.refreshCatalog();
}

function spotiSyncRunNow() {
  'use strict';
  return SpotiSync.SyncEngine.runNow();
}

function spotiSyncEnableScheduler() {
  'use strict';
  return SpotiSync.Scheduler.reconcile();
}

function spotiSyncDisableScheduler() {
  'use strict';
  return SpotiSync.Scheduler.disable();
}

function spotiSyncCheckForUpdates() {
  'use strict';
  return spotiSyncCheckForUpdatesStatus();
}
