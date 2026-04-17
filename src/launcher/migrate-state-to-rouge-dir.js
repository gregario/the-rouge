#!/usr/bin/env node
/**
 * One-shot migration: move each project's legacy `state.json` into `.rouge/state.json`.
 *
 * Motivation (issue #135): with state.json sitting in the project root, any
 * phase agent spawned with cwd = projectDir auto-ingested the file and
 * started narrating Rouge's pipeline back at the user instead of doing its
 * assigned role. Moving state under a `.rouge/` dotdir keeps it out of the
 * agent's working-directory listing.
 *
 * Safe to run repeatedly:
 *   - skips projects already migrated (`.rouge/state.json` exists)
 *   - skips directories with no `state.json` at all
 *   - aborts if both locations exist but the contents differ (conflict)
 *
 * Usage: node src/launcher/migrate-state-to-rouge-dir.js [projects-dir]
 *
 * Default projects dir: `$ROUGE_PROJECTS_DIR` or `<repo>/projects`.
 */

const fs = require('fs');
const path = require('path');

const { ROUGE_DIR, STATE_FILE } = require('./state-path.js');

function resolveProjectsDir(arg) {
  if (arg) return path.resolve(arg);
  if (process.env.ROUGE_PROJECTS_DIR) return process.env.ROUGE_PROJECTS_DIR;
  return path.join(path.resolve(__dirname, '../..'), 'projects');
}

function migrateProject(projectDir) {
  const legacyPath = path.join(projectDir, STATE_FILE);
  const newDir = path.join(projectDir, ROUGE_DIR);
  const newPath = path.join(newDir, STATE_FILE);

  const hasLegacy = fs.existsSync(legacyPath);
  const hasNew = fs.existsSync(newPath);

  if (!hasLegacy && !hasNew) return { status: 'no-state', projectDir };
  if (!hasLegacy && hasNew) return { status: 'already-migrated', projectDir };

  if (hasLegacy && hasNew) {
    const legacy = fs.readFileSync(legacyPath, 'utf8');
    const current = fs.readFileSync(newPath, 'utf8');
    if (legacy === current) {
      fs.unlinkSync(legacyPath);
      return { status: 'cleaned-stale-legacy', projectDir };
    }
    return { status: 'conflict', projectDir, detail: 'both files exist with different content — resolve manually' };
  }

  fs.mkdirSync(newDir, { recursive: true });
  fs.renameSync(legacyPath, newPath);
  return { status: 'migrated', projectDir };
}

function main() {
  const projectsDir = resolveProjectsDir(process.argv[2]);
  if (!fs.existsSync(projectsDir)) {
    console.error(`Projects dir not found: ${projectsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join(projectsDir, e.name));

  const results = entries.map(migrateProject);

  let migrated = 0;
  let already = 0;
  let noState = 0;
  let conflicts = 0;
  let cleanedStale = 0;

  for (const r of results) {
    const label = path.basename(r.projectDir);
    switch (r.status) {
      case 'migrated':
        console.log(`  migrated: ${label}`);
        migrated++;
        break;
      case 'already-migrated':
        console.log(`  already migrated: ${label}`);
        already++;
        break;
      case 'cleaned-stale-legacy':
        console.log(`  cleaned stale legacy: ${label}`);
        cleanedStale++;
        break;
      case 'no-state':
        console.log(`  no state.json: ${label}`);
        noState++;
        break;
      case 'conflict':
        console.error(`  CONFLICT: ${label} — ${r.detail}`);
        conflicts++;
        break;
    }
  }

  console.log('');
  console.log(`Summary: ${migrated} migrated, ${already} already, ${cleanedStale} cleaned, ${noState} no-state, ${conflicts} conflicts`);

  if (conflicts > 0) process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = { migrateProject };
