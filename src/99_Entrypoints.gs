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
    .addItem('Check for Updates', 'spotiSyncCheckForUpdates')
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
  SpreadsheetApp.getUi().alert(
    'Spoti Sync',
    'Dashboard, Jobs, Schedule, and Activity are ready. Existing Spotify credentials and job playlist IDs were kept.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function spotiSyncGetSetupStatus() {
  'use strict';
  var clientId = SpotiSync.Storage.getClientId();
  var scheduler = SpotiSync.Scheduler.getStatus();
  var update = SpotiSync.UpdateChecker.getCachedStatus();
  return {
    connected: SpotiSync.Auth.isConnected(),
    schedulerEnabled: scheduler.enabled,
    schedulerTriggerCount: scheduler.triggerCount,
    schedulerSchedule: scheduler.schedule,
    schedulerLastCheckAt: scheduler.lastCheckAt,
    schedulerLastCheckStatus: scheduler.lastCheckStatus,
    updateAvailable: update.updateAvailable,
    updateLabel: SpotiSync.UpdateChecker.statusLabel(update),
    updateLatestVersion: update.latestVersion,
    updateLastCheckAt: update.checkedAt,
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
  SpotiSync.SheetStore.refreshAllViews();
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
  SpotiSync.Scheduler.runDue();
}

function spotiSyncEnableScheduler() {
  'use strict';
  return SpotiSync.Scheduler.enable();
}

function spotiSyncEnableSchedulerFromMenu() {
  'use strict';
  SpotiSync.Scheduler.enable();
  SpreadsheetApp.getUi().alert(
    'Spoti Sync',
    'Daily scheduler enabled. Spoti Sync keeps exactly one scheduler trigger, even if you enable it again. See the Schedule sheet for status and upcoming jobs.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function spotiSyncDisableScheduler() {
  'use strict';
  return SpotiSync.Scheduler.disable();
}

function spotiSyncDisableSchedulerFromMenu() {
  'use strict';
  SpotiSync.Scheduler.disable();
  SpreadsheetApp.getUi().alert('Spoti Sync', 'Scheduler disabled. The Schedule sheet has been updated.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function spotiSyncCheckForUpdatesStatus() {
  'use strict';
  var status = SpotiSync.UpdateChecker.check({ force: true });
  SpotiSync.SheetStore.refreshAllViews();
  return status;
}

function spotiSyncCheckForUpdates() {
  'use strict';
  SpotiSync.Ui.showUpdateCheck();
}

function spotiSyncAbout() {
  'use strict';
  SpotiSync.Ui.showAbout();
}
