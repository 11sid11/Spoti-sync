#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceFiles = [
  '00_Core.gs',
  '10_Storage.gs',
  '20_SpotifyAuth.gs',
  '30_SpotifyApi.gs',
  '40_Sources.gs',
  '50_Strategies.gs',
  '60_SheetStore.gs',
  '65_SheetViews.gs',
  '70_SyncEngine.gs',
  '75_PlaylistHeartbeat.gs',
  '80_Scheduler.gs',
  '85_UpdateChecker.gs',
  '90_Ui.gs',
  '99_Entrypoints.gs'
];

function buildBundle() {
  const banner = [
    '// Spoti Sync — generated install bundle.',
    '// Source: https://github.com/11sid11/Spoti-sync',
    '// Do not edit this generated file directly; edit src/*.gs and run node scripts/build.js.',
    ''
  ].join('\n');

  const parts = sourceFiles.map((filename) => {
    const fullPath = path.join(root, 'src', filename);
    const content = fs.readFileSync(fullPath, 'utf8').trimEnd();
    return `// ---- ${filename} ----\n${content}`;
  });

  return `${banner}${parts.join('\n\n')}\n`;
}

function writeOrCheck(filePath, expected, checkOnly) {
  if (checkOnly) {
    const actual = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (actual !== expected) {
      throw new Error(`Generated file is out of date: ${path.relative(root, filePath)}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, expected);
}

const checkOnly = process.argv.includes('--check');
const bundle = buildBundle();
const output = path.join(root, 'dist', 'SpotiSync.gs');

writeOrCheck(output, bundle, checkOnly);
new Function(bundle);

console.log(checkOnly ? 'Generated file is current.' : 'Generated SpotiSync.gs bundle.');
