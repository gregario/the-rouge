#!/usr/bin/env node
/**
 * Contribute a draft integration pattern back to Rouge's catalogue.
 *
 * Takes a draft YAML file from library/integrations/drafts/,
 * validates it, creates a feature branch, moves it to the correct
 * tier directory, and creates a PR.
 *
 * Usage:
 *   node contribute-pattern.js <draft-file>
 *   node contribute-pattern.js library/integrations/drafts/mapbox-geocoding.yaml
 *
 * Can also be called programmatically from the launcher.
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROUGE_ROOT = path.resolve(__dirname, '../..');
const INTEGRATIONS_DIR = path.join(ROUGE_ROOT, 'library', 'integrations');
const DRAFTS_DIR = path.join(INTEGRATIONS_DIR, 'drafts');

// ---------------------------------------------------------------------------
// YAML parsing (lightweight — no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a flat YAML file into an object. Handles scalar fields, single-line
 * arrays (flow style), and block sequences. Does NOT handle nested maps —
 * those are passed through as raw strings.
 */
function parseYaml(content) {
  const result = {};
  let currentKey = null;
  let currentList = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    // Skip comments and blank lines
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    // Block sequence item (e.g., "  - value")
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      if (!currentList) currentList = [];
      currentList.push(value.replace(/^['"]|['"]$/g, ''));
      result[currentKey] = currentList;
      continue;
    }

    // Top-level key: value
    const match = line.match(/^([a-z_][a-z0-9_-]*):\s*(.*)/i);
    if (match) {
      // Save any pending list
      currentList = null;
      currentKey = match[1];
      let value = match[2].trim();

      // Multi-line scalar indicator (>)
      if (value === '>' || value === '|') {
        // Collect continuation lines
        result[currentKey] = '';
        continue;
      }

      // Flow-style array: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        currentList = result[currentKey];
        continue;
      }

      // Quoted or plain scalar
      value = value.replace(/^['"]|['"]$/g, '');
      if (value === '') {
        // Key with no value — might be start of a block sequence or map
        currentList = [];
        result[currentKey] = currentList;
        continue;
      }

      result[currentKey] = value;
      continue;
    }

    // Continuation line for multi-line scalar
    if (currentKey && typeof result[currentKey] === 'string' && line.match(/^\s+/)) {
      const trimmed = line.trim();
      result[currentKey] = result[currentKey]
        ? result[currentKey] + ' ' + trimmed
        : trimmed;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a draft YAML entry. Returns { valid: boolean, errors: string[] }.
 * This mirrors the key checks from validate-contribution.sh but operates on
 * flat YAML catalogue entries rather than directory-based contributions.
 */
function validateDraft(filePath) {
  const errors = [];

  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`] };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const data = parseYaml(content);

  // Required fields
  const required = ['id', 'name', 'tier'];
  for (const field of required) {
    if (!data[field]) {
      errors.push(`Required field '${field}' is missing`);
    }
  }

  // Bail early if critical fields missing
  if (!data.id || !data.tier) {
    return { valid: errors.length === 0, errors };
  }

  // id must be kebab-case
  if (!/^[a-z0-9-]+$/.test(data.id)) {
    errors.push(`id '${data.id}' is not valid kebab-case (expected [a-z0-9-]+)`);
  }

  // tier must be 1, 2, or 3
  const tier = parseInt(data.tier, 10);
  if (![1, 2, 3].includes(tier)) {
    errors.push(`tier '${data.tier}' is not valid (expected 1, 2, or 3)`);
  }

  // description is expected
  if (!data.description) {
    errors.push(`Missing 'description' field`);
  }

  return { valid: errors.length === 0, errors, data };
}

/**
 * Determine the destination path for a catalogue entry.
 */
function destinationPath(data) {
  const tier = parseInt(data.tier, 10);
  return path.join(INTEGRATIONS_DIR, `tier-${tier}`, `${data.id}.yaml`);
}

/**
 * Check whether an entry with the same id already exists in the catalogue.
 * Returns 'new' | 'update'.
 */
function checkDuplicate(data) {
  const dest = destinationPath(data);
  return fs.existsSync(dest) ? 'update' : 'new';
}

// ---------------------------------------------------------------------------
// Git + PR operations
// ---------------------------------------------------------------------------

function gitExec(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd || ROUGE_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    stdio: 'pipe',
    ...opts,
  }).trim();
}

function ghAvailable() {
  try {
    execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Contribute a draft integration file to the catalogue via PR.
 *
 * @param {string} draftPath — absolute or relative path to the draft YAML file
 * @param {object} opts — { dryRun?: boolean, product?: string }
 * @returns {{ success: boolean, pr?: string, branch?: string, errors?: string[] }}
 */
function contribute(draftPath, opts = {}) {
  const resolvedPath = path.resolve(draftPath);

  // 1. Validate
  const validation = validateDraft(resolvedPath);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const { data } = validation;
  const id = data.id;
  const name = data.name;
  const tier = parseInt(data.tier, 10);
  const action = checkDuplicate(data);
  const dest = destinationPath(data);
  const destDir = path.dirname(dest);
  const branchName = `catalogue/${id}`;

  const verb = action === 'update' ? 'update' : 'add';
  const commitMsg = `feat(catalogue): ${verb} ${name} (Tier ${tier})`;

  if (opts.dryRun) {
    return {
      success: true,
      dryRun: true,
      action,
      branch: branchName,
      destination: dest,
      commitMsg,
    };
  }

  // Record current branch so we can return to it
  let originalBranch;
  try {
    originalBranch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    originalBranch = 'main';
  }

  // Warn if not on main
  if (originalBranch !== 'main') {
    console.log(`  Warning: currently on '${originalBranch}', not 'main'. Creating branch from current HEAD.`);
  }

  try {
    // 5. Create feature branch
    try {
      gitExec(['checkout', '-b', branchName]);
    } catch (err) {
      // Branch might already exist — try switching to it
      if (err.stderr && err.stderr.includes('already exists')) {
        gitExec(['checkout', branchName]);
      } else {
        throw err;
      }
    }

    // 6. Copy file to destination
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(resolvedPath, dest);

    // Stage the new/updated file
    gitExec(['add', dest]);

    // 7. Commit
    gitExec(['commit', '-m', commitMsg]);

    // 8. Create PR (if gh is available)
    let prUrl = null;
    if (ghAvailable()) {
      const scaleNotes = data.scale_considerations
        ? `\n\n### Scale considerations\n${data.scale_considerations}`
        : '';
      const productNote = opts.product
        ? `Triggered by product: **${opts.product}**`
        : 'Contributed from a Rouge product build';

      const prBody = [
        `## Summary`,
        ``,
        `${verb === 'update' ? 'Updates' : 'Adds'} **${name}** to the integration catalogue (Tier ${tier}).`,
        ``,
        productNote,
        ``,
        `### What it does`,
        data.description || '(no description)',
        scaleNotes,
        ``,
        `### Tier`,
        `Tier ${tier}` + (tier === 1 ? ' — Stack' : tier === 2 ? ' — Service' : ' — Integration pattern'),
      ].join('\n');

      try {
        // Push branch
        gitExec(['push', '-u', 'origin', branchName]);

        // Create PR
        const prOutput = execFileSync('gh', [
          'pr', 'create',
          '--title', `feat(catalogue): ${verb} ${name} integration pattern`,
          '--body', prBody,
          '--base', 'main',
        ], {
          cwd: ROUGE_ROOT,
          encoding: 'utf8',
          timeout: 30000,
          stdio: 'pipe',
        }).trim();

        prUrl = prOutput;
      } catch (err) {
        console.log(`  Warning: PR creation failed: ${(err.message || '').slice(0, 200)}`);
        console.log(`  Branch '${branchName}' has been committed. Create the PR manually.`);
      }
    } else {
      console.log(`  'gh' CLI not found. Branch '${branchName}' committed locally.`);
      console.log(`  Push and create the PR manually:`);
      console.log(`    git push -u origin ${branchName}`);
      console.log(`    gh pr create --title "feat(catalogue): ${verb} ${name} integration pattern"`);
    }

    // 10. Clean up draft file
    try {
      fs.unlinkSync(resolvedPath);
      gitExec(['add', resolvedPath]);
      gitExec(['commit', '-m', `chore: remove draft ${id} (PR created)`]);
      if (ghAvailable() && prUrl) {
        try { gitExec(['push']); } catch {}
      }
    } catch {
      // Draft may not be tracked — that's fine
    }

    // 9. Switch back to original branch
    try {
      gitExec(['checkout', originalBranch]);
    } catch {
      // If original branch doesn't exist anymore, go to main
      try { gitExec(['checkout', 'main']); } catch {}
    }

    return {
      success: true,
      action,
      branch: branchName,
      destination: dest,
      pr: prUrl || null,
    };
  } catch (err) {
    // Attempt to return to original branch on failure
    try { gitExec(['checkout', originalBranch]); } catch {}
    return {
      success: false,
      errors: [`Git/PR operation failed: ${(err.message || '').slice(0, 300)}`],
    };
  }
}

// ---------------------------------------------------------------------------
// Scan drafts directory for pending contributions
// ---------------------------------------------------------------------------

/**
 * Scan the drafts directory and return a list of YAML files ready to contribute.
 */
function scanDrafts() {
  if (!fs.existsSync(DRAFTS_DIR)) return [];
  return fs.readdirSync(DRAFTS_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => path.join(DRAFTS_DIR, f));
}

/**
 * Contribute all pending drafts. Called by the loop after project completion.
 * Non-blocking — logs errors but does not throw.
 *
 * @param {function} logFn — logging function (receives a single string)
 * @param {string} [product] — name of the product that triggered the contribution
 * @returns {{ contributed: string[], failed: string[] }}
 */
function contributeAllDrafts(logFn, product) {
  const log = logFn || console.log;
  const drafts = scanDrafts();
  const contributed = [];
  const failed = [];

  if (drafts.length === 0) return { contributed, failed };

  log(`Found ${drafts.length} draft(s) to contribute`);

  for (const draftPath of drafts) {
    const filename = path.basename(draftPath);
    try {
      const result = contribute(draftPath, { product });
      if (result.success) {
        contributed.push(filename);
        const prNote = result.pr ? ` — PR: ${result.pr}` : ` — branch: ${result.branch}`;
        log(`Contributed ${filename} (${result.action})${prNote}`);
      } else {
        failed.push(filename);
        log(`Failed to contribute ${filename}: ${(result.errors || []).join(', ')}`);
      }
    } catch (err) {
      failed.push(filename);
      log(`Error contributing ${filename}: ${(err.message || '').slice(0, 200)}`);
    }
  }

  return { contributed, failed };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
  Usage: node contribute-pattern.js <draft-file> [--dry-run] [--product <name>]

  Contribute a draft integration pattern back to Rouge's catalogue.

  Arguments:
    <draft-file>    Path to a YAML draft in library/integrations/drafts/

  Options:
    --dry-run       Validate and show what would happen, without creating a branch or PR
    --product       Name of the product that triggered this contribution

  Examples:
    node contribute-pattern.js library/integrations/drafts/mapbox-geocoding.yaml
    node contribute-pattern.js library/integrations/drafts/mapbox-geocoding.yaml --dry-run
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const draftFile = args[0];
  const dryRun = args.includes('--dry-run');
  const productIdx = args.indexOf('--product');
  const product = productIdx >= 0 ? args[productIdx + 1] : undefined;

  const result = contribute(draftFile, { dryRun, product });

  if (!result.success) {
    console.error('\n  Validation failed:');
    for (const err of result.errors || []) {
      console.error(`    - ${err}`);
    }
    console.error('');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n  Dry run — no changes made:');
    console.log(`    Action: ${result.action}`);
    console.log(`    Branch: ${result.branch}`);
    console.log(`    Destination: ${result.destination}`);
    console.log(`    Commit: ${result.commitMsg}`);
    console.log('');
  } else {
    console.log(`\n  Contributed: ${draftFile}`);
    console.log(`    Action: ${result.action}`);
    console.log(`    Branch: ${result.branch}`);
    console.log(`    Destination: ${result.destination}`);
    if (result.pr) {
      console.log(`    PR: ${result.pr}`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Exports (for programmatic use from the loop)
// ---------------------------------------------------------------------------

module.exports = {
  contribute,
  contributeAllDrafts,
  scanDrafts,
  validateDraft,
  destinationPath,
  checkDuplicate,
  parseYaml,
};
