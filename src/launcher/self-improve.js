#!/usr/bin/env node
/**
 * Rouge unattended self-improvement loop.
 *
 * Monitors the issue backlog, picks up approved work, creates PRs.
 * Runs on a budget (max iterations). One issue at a time.
 * Falls back to exploration mode when no issues remain.
 *
 * Usage:
 *   node self-improve.js [--max-iterations N] [--explore] [--dry-run]
 *
 * Can also be called programmatically:
 *   const { run } = require('./self-improve.js');
 *   await run({ maxIterations: 5, explore: true });
 */

const { execSync, execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROUGE_ROOT = path.resolve(__dirname, '../..');

// Only work on issues from trusted sources
const TRUSTED_AUTHORS = ['gregario']; // repo owner

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a title to a branch-safe slug.
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Safe git execution within ROUGE_ROOT.
 */
function gitExec(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd || ROUGE_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    stdio: 'pipe',
    ...opts,
  }).trim();
}

/**
 * Append an entry to the daily run log (logs/ directory, gitignored).
 */
function logIteration(entry) {
  const logsDir = path.join(ROUGE_ROOT, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const logFile = path.join(logsDir, `self-improve-${new Date().toISOString().split('T')[0]}.json`);
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
  log.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
}

// ---------------------------------------------------------------------------
// Issue management
// ---------------------------------------------------------------------------

/**
 * Fetch open issues from GitHub, filtered to trusted authors only.
 * Returns array of { number, title, body, author, labels, createdAt }.
 */
function fetchApprovedIssues() {
  const output = execSync(
    `gh issue list --state open --json number,title,body,author,labels,createdAt --limit 20`,
    { encoding: 'utf8', cwd: ROUGE_ROOT, timeout: 15000, stdio: 'pipe' }
  );
  const issues = JSON.parse(output);
  return issues.filter((i) => TRUSTED_AUTHORS.includes(i.author.login));
}

/**
 * Prioritise issues: blocker > priority > oldest.
 * Skip issues labelled 'backlog' unless nothing else available.
 */
function prioritiseIssues(issues) {
  const hasLabel = (issue, name) =>
    issue.labels && issue.labels.some((l) => l.name === name);

  const blockers = issues.filter((i) => hasLabel(i, 'blocker'));
  const priority = issues.filter((i) => hasLabel(i, 'priority') && !hasLabel(i, 'blocker'));
  const backlog = issues.filter((i) => hasLabel(i, 'backlog'));
  const normal = issues.filter(
    (i) => !hasLabel(i, 'blocker') && !hasLabel(i, 'priority') && !hasLabel(i, 'backlog')
  );

  // Sort each group by oldest first
  const byDate = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
  blockers.sort(byDate);
  priority.sort(byDate);
  normal.sort(byDate);
  backlog.sort(byDate);

  // Blockers first, then priority, then normal, then backlog as last resort
  return [...blockers, ...priority, ...normal, ...backlog];
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the prompt for claude -p to work on an issue.
 */
function buildIssuePrompt(issue) {
  return `You are working on The Rouge, an autonomous product development system.

Read CLAUDE.md for the project workflow. Read VISION.md for the North Star.

You are implementing this issue:

## #${issue.number}: ${issue.title}

${issue.body || '(no description)'}

## Instructions

1. Read the relevant files before making changes
2. Work on a feature branch (already created: you are on it)
3. Write tests for your changes
4. Make small, focused commits
5. Do NOT merge to main
6. When done, summarise what you changed and what to verify

Stay within the scope of the issue. Do not add features not described.`;
}

// ---------------------------------------------------------------------------
// Core: work on an issue
// ---------------------------------------------------------------------------

/**
 * Work on a single issue: branch, implement via claude -p, test, create PR.
 * Returns { success, pr, error }.
 */
function workOnIssue(issue, opts = {}) {
  const branch = `auto/${issue.number}-${slugify(issue.title)}`;
  const startTime = Date.now();

  if (opts.dryRun) {
    console.log(`  [dry-run] Would work on #${issue.number}: ${issue.title}`);
    console.log(`  [dry-run] Branch: ${branch}`);
    return { success: true, dryRun: true, branch };
  }

  try {
    // Ensure we're on main and up to date
    gitExec(['checkout', 'main']);
    try { gitExec(['pull', '--ff-only']); } catch { /* may not have remote */ }

    // Create branch
    try {
      gitExec(['checkout', '-b', branch]);
    } catch (err) {
      // Branch might already exist
      if (err.stderr && err.stderr.includes('already exists')) {
        gitExec(['checkout', branch]);
      } else {
        throw err;
      }
    }

    // Build the prompt for claude -p
    const prompt = buildIssuePrompt(issue);

    // Spawn claude -p
    console.log(`  Working on #${issue.number}: ${issue.title}`);
    const result = spawnSync('claude', ['-p', '--max-turns', '50'], {
      input: prompt,
      cwd: ROUGE_ROOT,
      encoding: 'utf8',
      timeout: 600000, // 10 min max per issue
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      const errorMsg = `claude -p exited with status ${result.status}`;
      commentOnIssue(issue.number, `Self-improvement attempt failed:\n\n\`\`\`\n${errorMsg}\n\`\`\`\n\nBranch: \`${branch}\``);
      gitExec(['checkout', 'main']);
      return { success: false, error: errorMsg };
    }

    // Run tests
    let testsPassed = false;
    try {
      execSync('npm test', { cwd: ROUGE_ROOT, encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
      testsPassed = true;
    } catch (err) {
      const testOutput = (err.stdout || '') + (err.stderr || '');
      commentOnIssue(
        issue.number,
        `Self-improvement attempt: tests failed.\n\n\`\`\`\n${testOutput.slice(0, 1000)}\n\`\`\`\n\nBranch: \`${branch}\``
      );
      gitExec(['checkout', 'main']);
      return { success: false, error: 'Tests failed' };
    }

    // Create PR
    let prUrl = null;
    if (testsPassed) {
      try {
        gitExec(['push', '-u', 'origin', branch]);

        const prOutput = execFileSync('gh', [
          'pr', 'create',
          '--title', `auto: #${issue.number} — ${issue.title}`,
          '--body', [
            `## Summary`,
            ``,
            `Automated implementation for #${issue.number}.`,
            ``,
            `### What changed`,
            result.stdout ? result.stdout.slice(-500) : '(see diff)',
            ``,
            `### Tests`,
            `All tests pass.`,
            ``,
            `---`,
            `*Created by Rouge self-improvement loop.*`,
          ].join('\n'),
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
      }

      // Comment on issue with results
      const body = prUrl
        ? `Self-improvement loop created a PR: ${prUrl}`
        : `Self-improvement loop committed to branch \`${branch}\`. Create PR manually.`;
      commentOnIssue(issue.number, body);
    }

    // Switch back to main
    gitExec(['checkout', 'main']);
    try { gitExec(['pull', '--ff-only']); } catch { /* ok */ }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logIteration({
      type: 'issue',
      number: issue.number,
      title: issue.title,
      pr: prUrl,
      duration,
      success: true,
    });

    return { success: true, pr: prUrl, branch };
  } catch (err) {
    // Attempt to return to main on failure
    try { gitExec(['checkout', 'main']); } catch { /* ok */ }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logIteration({
      type: 'issue',
      number: issue.number,
      title: issue.title,
      error: (err.message || '').slice(0, 300),
      duration,
      success: false,
    });

    return { success: false, error: (err.message || '').slice(0, 300) };
  }
}

/**
 * Comment on a GitHub issue.
 */
function commentOnIssue(issueNumber, body) {
  try {
    execSync(`gh issue comment ${issueNumber} --body ${JSON.stringify(body)}`, {
      cwd: ROUGE_ROOT,
      encoding: 'utf8',
      timeout: 15000,
      stdio: 'pipe',
    });
  } catch {
    console.log(`  Warning: could not comment on issue #${issueNumber}`);
  }
}

// ---------------------------------------------------------------------------
// Exploration mode
// ---------------------------------------------------------------------------

/**
 * Read anthology.md and find the next unchecked item from the highest priority section.
 * Returns { item, section } or null.
 */
function findNextExplorationItem() {
  const anthologyPath = path.join(ROUGE_ROOT, 'docs', 'anthology.md');
  if (!fs.existsSync(anthologyPath)) return null;

  const content = fs.readFileSync(anthologyPath, 'utf8');
  const lines = content.split('\n');

  let currentSection = '';
  for (const line of lines) {
    // Track section headers
    if (line.startsWith('### Priority 1')) {
      currentSection = 'priority-1';
    } else if (line.startsWith('### Priority 2')) {
      currentSection = 'priority-2';
    } else if (line.startsWith('### Priority 3')) {
      currentSection = 'priority-3';
    }

    // Find first unchecked item
    const match = line.match(/^- \[ \] (.+)$/);
    if (match) {
      // Extract the item text, strip trailing annotations like " — description"
      const fullText = match[1].trim();
      const title = fullText.split(' — ')[0].trim();
      return { item: title, fullText, section: currentSection };
    }
  }

  return null;
}

/**
 * Explore: pick the next unchecked anthology item, run feasibility,
 * create an issue, then work on it.
 * Returns { success, item, issueUrl, pr } or null if nothing to explore.
 */
function explore(opts = {}) {
  const entry = findNextExplorationItem();
  if (!entry) {
    console.log('  No unchecked items in anthology.');
    return null;
  }

  console.log(`  Exploring: ${entry.item}`);

  // Run feasibility
  const { assess } = require('./feasibility.js');
  const assessment = assess({
    title: entry.item,
    description: entry.fullText,
    type: 'integration',
  });

  if (assessment.verdict === 'defer' || assessment.verdict === 'escalate') {
    console.log(`  Exploration deferred: ${entry.item} — ${assessment.reasoning}`);
    logIteration({
      type: 'exploration',
      title: entry.item,
      verdict: assessment.verdict,
      reasoning: assessment.reasoning,
      success: false,
    });
    return { success: false, item: entry.item, verdict: assessment.verdict };
  }

  if (opts.dryRun) {
    console.log(`  [dry-run] Would create issue for: ${entry.item}`);
    console.log(`  [dry-run] Feasibility: ${assessment.verdict}`);
    return { success: true, dryRun: true, item: entry.item, verdict: assessment.verdict };
  }

  // Create an issue for it
  let issueUrl;
  try {
    issueUrl = execSync(
      `gh issue create --title ${JSON.stringify(`Explore: ${entry.item}`)} --body ${JSON.stringify(`Auto-created by exploration mode. From docs/anthology.md.\n\nFeasibility: ${assessment.verdict}\n${assessment.reasoning}`)} --label "enhancement"`,
      { encoding: 'utf8', cwd: ROUGE_ROOT, timeout: 15000, stdio: 'pipe' }
    ).trim();
  } catch (err) {
    console.log(`  Warning: could not create issue: ${(err.message || '').slice(0, 200)}`);
    return { success: false, item: entry.item, error: 'Failed to create issue' };
  }

  // Parse issue number from URL
  const issueNumberMatch = issueUrl.match(/\/(\d+)$/);
  if (!issueNumberMatch) {
    console.log(`  Warning: could not parse issue number from: ${issueUrl}`);
    return { success: false, item: entry.item, error: 'Could not parse issue URL' };
  }

  const issueNumber = parseInt(issueNumberMatch[1], 10);

  // Fetch the issue we just created so we can work on it
  const issue = {
    number: issueNumber,
    title: `Explore: ${entry.item}`,
    body: `Auto-created by exploration mode. From docs/anthology.md.\n\nFeasibility: ${assessment.verdict}\n${assessment.reasoning}`,
    author: { login: TRUSTED_AUTHORS[0] },
    labels: [{ name: 'enhancement' }],
    createdAt: new Date().toISOString(),
  };

  const result = workOnIssue(issue);

  logIteration({
    type: 'exploration',
    title: entry.item,
    issueUrl,
    pr: result.pr || null,
    success: result.success,
  });

  return { success: result.success, item: entry.item, issueUrl, pr: result.pr };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

/**
 * Run the self-improvement loop.
 *
 * @param {object} opts — { maxIterations, explore, dryRun }
 */
async function run(opts = {}) {
  const maxIterations = opts.maxIterations || 1;
  const enableExplore = opts.explore || false;
  const dryRun = opts.dryRun || false;

  console.log('');
  console.log('  Rouge Self-Improvement Loop');
  console.log(`  ${'─'.repeat(35)}`);
  console.log(`  Max iterations: ${maxIterations}`);
  console.log(`  Exploration: ${enableExplore ? 'enabled' : 'disabled'}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log('');

  let remaining = maxIterations;

  while (remaining > 0) {
    console.log(`  --- Iteration ${maxIterations - remaining + 1} of ${maxIterations} ---`);

    // 1. Fetch approved issues
    let issues = [];
    try {
      issues = fetchApprovedIssues();
      issues = prioritiseIssues(issues);
    } catch (err) {
      console.log(`  Warning: could not fetch issues: ${(err.message || '').slice(0, 200)}`);
      // If we can't fetch issues but explore is enabled, try exploration
      if (!enableExplore) {
        console.log('  No issues and exploration disabled. Stopping.');
        break;
      }
    }

    if (dryRun) {
      if (issues.length > 0) {
        console.log(`  [dry-run] Found ${issues.length} approved issue(s):`);
        for (const issue of issues.slice(0, 5)) {
          const labels = issue.labels ? issue.labels.map((l) => l.name).join(', ') : '';
          console.log(`    #${issue.number}: ${issue.title} [${labels}]`);
        }
        console.log(`  [dry-run] Would work on #${issues[0].number}: ${issues[0].title}`);
      } else if (enableExplore) {
        console.log('  [dry-run] No issues found. Would enter exploration mode.');
        explore({ dryRun: true });
      } else {
        console.log('  [dry-run] No issues found and exploration disabled.');
      }
      remaining--;
      continue;
    }

    // 2. Work on an issue or explore
    if (issues.length > 0) {
      const issue = issues[0];
      console.log(`  Picking up #${issue.number}: ${issue.title}`);
      const result = workOnIssue(issue, { dryRun });
      if (result.success) {
        console.log(`  Completed #${issue.number}${result.pr ? ` — PR: ${result.pr}` : ''}`);
      } else {
        console.log(`  Failed #${issue.number}: ${result.error || 'unknown error'}`);
      }
    } else if (enableExplore) {
      console.log('  No approved issues. Entering exploration mode...');
      const result = explore({ dryRun });
      if (!result) {
        console.log('  Nothing to explore. Stopping.');
        break;
      }
    } else {
      console.log('  No approved issues and exploration disabled. Stopping.');
      break;
    }

    remaining--;
  }

  console.log('');
  console.log('  Self-improvement loop complete.');
  console.log('');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  Usage: node self-improve.js [options]

  Options:
    --max-iterations N   Run up to N iterations (default: 1)
    --explore            Enable exploration when no issues remain
    --dry-run            Show what would be done without doing it
    --help, -h           Show this help message

  Examples:
    node self-improve.js                       # One iteration
    node self-improve.js --max-iterations 5    # Up to 5 iterations
    node self-improve.js --explore             # Enable exploration fallback
    node self-improve.js --dry-run             # Preview only
`);
    process.exit(0);
  }

  const maxIdx = args.indexOf('--max-iterations');
  const maxIterations = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) || 1 : 1;
  const explore = args.includes('--explore');
  const dryRun = args.includes('--dry-run');

  run({ maxIterations, explore, dryRun }).catch((err) => {
    console.error(`  Fatal error: ${err.message}`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Exports (for programmatic use and testing)
// ---------------------------------------------------------------------------

module.exports = {
  run,
  fetchApprovedIssues,
  prioritiseIssues,
  buildIssuePrompt,
  findNextExplorationItem,
  slugify,
  TRUSTED_AUTHORS,
};
