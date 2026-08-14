var SpotiSync = SpotiSync || {};

function onOpen() {
  'use strict';
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Spoti Sync')
    .addItem('Setup', 'spotiSyncSetup')
    .addItem('Add Sync Job', 'spotiSyncAddJob')
    .addSeparator()
    .addItem('Preview Enabled Jobs', 'spotiSyncPreviewEnabledJobs')
    .addItem('Sync Now', 'spotiSyncRunNow')
    .addSeparator()
    .addItem('Enable Daily Scheduler', 'spotiSyncEnableSchedulerFromMenu')
    .addItem('Disable Scheduler', 'spotiSyncDisableSchedulerFromMenu')
    .addSeparator()
    .addItem('Initialize / Repair Sheets', 'spotiSyncInitializeSheetsFromMenu')
    .addItem('About', 'spotiSyncAbout')
    .addToUi();
}

function spotiSyncSetup() {
  'use strict';
  SpotiSync.Ui.showSetup();
}

function spotiSyncInitializeSheets() {
  'use strict';
  SpotiSync.SheetStore.initialize();
  return true;
}

function spotiSyncInitializeSheetsFromMenu() {
  'use strict';
  SpotiSync.SheetStore.initialize();
  SpreadsheetApp.getUi().alert('Spoti Sync', 'Dashboard, Jobs, and History sheets are ready.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function spotiSyncGetSetupStatus() {
  'use strict';
  var clientId = SpotiSync.Storage.getClientId();
  return {
    connected: SpotiSync.Auth.isConnected(),
    schedulerEnabled: SpotiSync.Scheduler.isEnabled(),
    redirectUri: SpotiSync.Auth.getRedirectUri(),
    clientId: clientId ? ('Configured: …' + clientId.slice(-6)) : ''
  };
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
  SpotiSync.SheetStore.refreshDashboard();
  return true;
}

function spotiSyncAddJob() {
  'use strict';
  try {
    SpotiSync.SheetStore.initialize();
    SpotiSync.Ui.promptAddJob();
  } catch (error) {
    SpreadsheetApp.getUi().alert('Could not add job', SpotiSync.Core.safeErrorMessage(error), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function spotiSyncPreviewEnabledJobs() {
  'use strict';
  try {
    SpotiSync.Ui.showPreview();
  } catch (error) {
    SpreadsheetApp.getUi().alert('Preview failed', SpotiSync.Core.safeErrorMessage(error), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function spotiSyncRunNow() {
  'use strict';
  try {
    SpotiSync.Ui.showRunNow();
  } catch (error) {
    SpreadsheetApp.getUi().alert('Sync failed', SpotiSync.Core.safeErrorMessage(error), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function spotiSyncScheduler() {
  'use strict';
  SpotiSync.SyncEngine.runDue();
}

function spotiSyncEnableScheduler() {
  'use strict';
  return SpotiSync.Scheduler.enable();
}

function spotiSyncEnableSchedulerFromMenu() {
  'use strict';
  SpotiSync.Scheduler.enable();
  SpreadsheetApp.getUi().alert('Spoti Sync', 'Daily scheduler enabled.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function spotiSyncDisableScheduler() {
  'use strict';
  return SpotiSync.Scheduler.disable();
}

function spotiSyncDisableSchedulerFromMenu() {
  'use strict';
  SpotiSync.Scheduler.disable();
  SpreadsheetApp.getUi().alert('Spoti Sync', 'Scheduler disabled.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function spotiSyncAbout() {
  'use strict';
  SpotiSync.Ui.showAbout();
}
