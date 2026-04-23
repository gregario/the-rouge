#!/usr/bin/env node
/**
 * Aggregate validator — runs all catalog validators and exits non-zero if any fail.
 * Useful as a single npm-script entry.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const here = __dirname;
const scripts = [
  'validate-skills.js',
  'validate-rules.js',
  'validate-agents.js',
];

let failed = 0;
for (const s of scripts) {
  const res = spawnSync('node', [path.join(here, s)], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

if (failed) {
  console.error(`[validate-catalog] ${failed} validator(s) failed`);
  process.exit(1);
}

console.log('[validate-catalog] all validators passed.');
