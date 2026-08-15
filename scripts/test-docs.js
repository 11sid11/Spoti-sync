#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const core = read('src/00_Core.gs');
const versionMetadata = JSON.parse(read('docs/version.json'));
const manifest = JSON.parse(read('docs/source-files.json'));
const buildScript = read('scripts/build.js');
const browserInstaller = read('docs/app.js');
const currentDocs = {
  'README.md': read('README.md'),
  'docs/index.html': read('docs/index.html')
};

const versionMatch = core.match(/ns\.VERSION\s*=\s*['"]([^'"]+)['"]/);
assert(versionMatch, 'Could not find ns.VERSION in src/00_Core.gs.');
assert.strictEqual(
  versionMatch[1],
  versionMetadata.version,
  'Runtime version and docs/version.json must match.'
);

assert(Array.isArray(manifest) && manifest.length > 0, 'docs/source-files.json must contain source files.');
assert.strictEqual(new Set(manifest).size, manifest.length, 'docs/source-files.json must not contain duplicates.');

const sourceFiles = fs.readdirSync(path.join(root, 'src'))
  .filter((name) => name.endsWith('.gs'))
  .sort();
const manifestFiles = manifest.slice().sort();

assert.deepStrictEqual(
  manifestFiles,
  sourceFiles,
  'docs/source-files.json must contain every production .gs file exactly once.'
);
manifest.forEach((filename) => {
  assert(fs.existsSync(path.join(root, 'src', filename)), `Missing source file: ${filename}`);
});

assert(
  buildScript.includes("docs', 'source-files.json"),
  'scripts/build.js must consume docs/source-files.json.'
);
assert(
  browserInstaller.includes("new URL('source-files.json'"),
  'docs/app.js must consume docs/source-files.json.'
);

const stalePhrases = [
  'Start setup',
  'Edit Selected Job',
  'Enable Daily Scheduler',
  'Disable Scheduler',
  'Preview Enabled Jobs',
  'Initialize / Repair Sheets',
  'select a Jobs row',
  'select a row before editing',
  'edit the Jobs sheet',
  'configure Jobs sheet cells'
];

Object.entries(currentDocs).forEach(([filename, content]) => {
  stalePhrases.forEach((phrase) => {
    assert(
      !content.toLowerCase().includes(phrase.toLowerCase()),
      `${filename} contains obsolete current-user wording: ${phrase}`
    );
  });
});

const requiredCurrentFlow = [
  'Spoti Sync → Open Spoti Sync',
  'Exact Mirror',
  'Append Only',
  'Every N days'
];

Object.entries(currentDocs).forEach(([filename, content]) => {
  requiredCurrentFlow.forEach((phrase) => {
    assert(content.includes(phrase), `${filename} is missing current product wording: ${phrase}`);
  });
});

assert(currentDocs['docs/index.html'].includes('Install Spoti Sync'), 'Landing page must expose the install action.');
assert(currentDocs['docs/index.html'].includes('View on GitHub'), 'Landing page must link to GitHub.');
assert(!currentDocs['docs/index.html'].includes('setup-progress'), 'Landing page must not restore the old setup progress UI.');

console.log('Docs freshness checks passed.');
