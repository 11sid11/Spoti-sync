#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scheduler = fs.readFileSync(path.join(root, 'src', '80_Scheduler.gs'), 'utf8');
const sheetStore = fs.readFileSync(path.join(root, 'src', '60_SheetStore.gs'), 'utf8');
const sheetViews = fs.readFileSync(path.join(root, 'src', '65_SheetViews.gs'), 'utf8');
const entrypoints = fs.readFileSync(path.join(root, 'src', '99_Entrypoints.gs'), 'utf8');
const updateChecker = fs.readFileSync(path.join(root, 'src', '85_UpdateChecker.gs'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src', '00_Core.gs'), 'utf8');

assert(!scheduler.includes('PANEL_START_COLUMN'), 'Scheduler status must no longer live to the right of the Jobs table.');
assert(core.includes("SCHEDULE: 'Schedule'"), 'Sheet model must expose a dedicated Schedule sheet.');
assert(core.includes("ACTIVITY: 'Activity'"), 'Sheet model must expose Activity.');
assert(sheetViews.includes("'Automation Schedule'"), 'Schedule sheet must have a dedicated title.');
assert(sheetViews.includes("sheet.getRange('A1:F50').breakApart();"), 'Dashboard refresh must clear stale merged ranges before rendering.');
assert(sheetViews.includes("sheet.getRange('A1:F100').breakApart();"), 'Schedule refresh must clear stale merged ranges before rendering.');
assert(sheetViews.includes("'Upcoming job'"), 'Schedule sheet must list future/eligible jobs.');
assert(sheetViews.includes("['Runs on', 'Google Apps Script cloud']"), 'Schedule sheet must explain where the scheduler runs.');
assert(sheetViews.includes("['Trigger count', Number(scheduler.triggerCount || 0)]"), 'Schedule sheet must expose the actual trigger count.');
assert(sheetViews.includes("['Spoti Sync version', ns.VERSION]"), 'Schedule sheet must expose installed version.');
assert(sheetViews.includes("['Updates', update ? ns.UpdateChecker.statusLabel(update) : 'Not checked']"), 'Schedule sheet must expose update state.');
assert(sheetStore.includes('clearDataValidations();'), 'Sheet migration must explicitly remove legacy validation rules before writing converted values.');
assert(sheetStore.includes('function replaceSheetData(sheet, headers, rows, legacyWidth)'), 'Sheet migration must use the bounded replacement helper.');
const replacementHelper = sheetStore.slice(
  sheetStore.indexOf('function replaceSheetData('),
  sheetStore.indexOf('function ensureJobsSheet(')
);
assert(
  replacementHelper.indexOf('.setValues(values);') < replacementHelper.indexOf('.clearContent();'),
  'Migration must write the converted dataset before clearing trailing legacy cells.'
);
assert(
  !/setFrozenRows\([^)]*\)\s*\.setTabColor/.test(sheetViews),
  'Sheet styling must not chain after setFrozenRows(), which returns void in Apps Script.'
);
assert(scheduler.includes('SCHEDULER_LAST_CHECK_AT'), 'Scheduler must persist its last background check time.');
assert(scheduler.includes('SCHEDULER_LAST_CHECK_STATUS'), 'Scheduler must persist its last background result.');
assert(scheduler.includes('ns.UpdateChecker.check({ force: false });'), 'Daily scheduler must perform a rate-limited update check.');
assert(scheduler.includes('deleteSchedulerTriggers();\n      ScriptApp.newTrigger(HANDLER)'), 'Enabling must replace existing Spoti Sync triggers before creating one.');
assert(entrypoints.includes('SpotiSync.Scheduler.runDue();'), 'Clock-trigger entrypoint must go through scheduler telemetry.');
assert(!/function spotiSyncScheduler\(\)[\s\S]*?SpotiSync\.SyncEngine\.runDue\(\)/.test(entrypoints), 'Clock trigger must not bypass scheduler telemetry.');
assert(entrypoints.includes(".addItem('Check for Updates', 'spotiSyncCheckForUpdates')"), 'Menu must expose manual update checks.');
assert(entrypoints.includes('SpotiSync.SheetStore.refreshAllViews();'), 'Interactive state changes must refresh the new views.');
assert(entrypoints.includes('Dashboard, Jobs, Schedule, and Activity are ready'), 'Repair command must describe the v1.3 sheet model.');
assert(updateChecker.includes('UPDATE_CHECK_INTERVAL_MS'), 'Update checks must be rate limited.');
assert(!updateChecker.includes('script.projects'), 'Update checker must not require script-project write scope.');
assert(!/\beval\s*\(/.test(updateChecker), 'Update checker must never execute fetched code.');

console.log('Scheduler and sheet visibility checks passed.');
