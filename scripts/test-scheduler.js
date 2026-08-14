#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scheduler = fs.readFileSync(path.join(root, 'src', '80_Scheduler.gs'), 'utf8');
const entrypoints = fs.readFileSync(path.join(root, 'src', '99_Entrypoints.gs'), 'utf8');

assert(scheduler.includes("var PANEL_START_COLUMN = 15; // O"), 'Scheduler panel must stay beside the A:M Jobs table.');
assert(scheduler.includes("['Runs on', 'Google Apps Script cloud']"), 'Jobs panel must explain where the scheduler runs.');
assert(scheduler.includes("['Trigger count', triggers.length]"), 'Jobs panel must expose the actual scheduler trigger count.');
assert(scheduler.includes('SCHEDULER_LAST_CHECK_AT'), 'Scheduler must persist its last background check time.');
assert(scheduler.includes('SCHEDULER_LAST_CHECK_STATUS'), 'Scheduler must persist its last background result.');
assert(scheduler.includes('deleteSchedulerTriggers();\n      ScriptApp.newTrigger(HANDLER)'), 'Enabling the scheduler must replace existing Spoti Sync triggers before creating one.');
assert(entrypoints.includes('SpotiSync.Scheduler.runDue();'), 'Clock-trigger entrypoint must go through scheduler telemetry.');
assert(!/function spotiSyncScheduler\(\)[\s\S]*?SpotiSync\.SyncEngine\.runDue\(\)/.test(entrypoints), 'Clock-trigger entrypoint must not bypass scheduler telemetry.');
assert(entrypoints.includes('SpotiSync.Scheduler.refreshPanel();'), 'Interactive operations must refresh the Jobs scheduler panel.');

console.log('Scheduler visibility checks passed.');
