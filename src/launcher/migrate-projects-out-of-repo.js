#!/usr/bin/env node
/**
 * One-shot migration: move every project directory out of the Rouge
 * repo tree and into `~/.rouge/projects/<slug>`.
 *
 * Motivation (#143): spawned phase agents run with `cwd = projectDir`
 * and Claude Code auto-loads every `CLAUDE.md` walking up. When
 * projects lived inside the Rouge repo, the ancestor walk picked up
 * Rouge's own developer CLAUDE.md and the agent started behaving like
 * a Rouge contributor instead of the product-building role it was
 * given. Moving projects to `~/.rouge/projects/` removes the ancestor
 * entirely.
 *
 * Safe to run repeatedly:
 *   - skips projects already at the destination
 *   - refuses to move if the destination exists with different contents
 *     (conflict — resolve manually)
 *
 * Usage:
 *   node src/launcher/migrate-projects-out-of-repo.js [source] [dest]
 *
 * Default source: `<repo>/projects`.
 * Default dest:   `$ROUGE_PROJECTS_DIR` or `~/.rouge/projects`.
 */

const fs = require('fs');
const path = require('path');

function resolveDefaultSource() {
  return path.join(path.resolve(__dirname, '../..'), 'projects');
}

function resolveDefaultDest() {
  if (process.env.ROUGE_PROJECTS_DIR) return process.env.ROUGE_PROJECTS_DIR;
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.rouge', 'projects');
}

function isDirEmpty(dir) {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}

function migrateProject(srcDir, destDir) {
  const hasSrc = fs.existsSync(srcDir);
  const hasDest = fs.existsSync(destDir);

  if (!hasSrc && !hasDest) return { status: 'missing' };
  if (!hasSrc && hasDest) return { status: 'already-migrated' };

  if (hasSrc && hasDest) {
    // Harmless duplicate if the destination is a leftover empty dir.
    if (isDirEmpty(destDir)) {
      fs.rmdirSync(destDir);
    } else {
      return {
        status: 'conflict',
        detail: `both ${srcDir} and ${destDir} exist with content — resolve manually`,
      };
    }
  }

  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.renameSync(srcDir, destDir);
  return { status: 'migrated' };
}

function main() {
  const source = path.resolve(process.argv[2] || resolveDefaultSource());
  const dest = path.resolve(process.argv[3] || resolveDefaultDest());

  if (!fs.existsSync(source)) {
    console.log(`Source does not exist, nothing to migrate: ${source}`);
    return;
  }

  console.log(`Migrating projects:`);
  console.log(`  from: ${source}`);
  console.log(`    to: ${dest}`);
  console.log('');

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(source, { withFileTypes: true })
    .filter(e => e.isDirectory());

  let migrated = 0;
  let already = 0;
  let conflicts = 0;

  for (const entry of entries) {
    const srcDir = path.join(source, entry.name);
    const destDir = path.join(dest, entry.name);
    const result = migrateProject(srcDir, destDir);
    switch (result.status) {
      case 'migrated':
        console.log(`  migrated: ${entry.name}`);
        migrated++;
        break;
      case 'already-migrated':
        console.log(`  already migrated: ${entry.name}`);
        already++;
        break;
      case 'conflict':
        console.error(`  CONFLICT: ${entry.name} — ${result.detail}`);
        conflicts++;
        break;
    }
  }

  // Drop the now-empty source dir so it stops showing up in `git status`.
  if (migrated > 0 && isDirEmpty(source)) {
    fs.rmdirSync(source);
    console.log(`  removed empty source: ${source}`);
  }

  console.log('');
  console.log(`Summary: ${migrated} migrated, ${already} already, ${conflicts} conflicts`);

  if (conflicts > 0) process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = { migrateProject };
