# Loop Operational Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 operational bugs preventing smooth unattended loop operation

**Architecture:** All fixes are in the launcher layer (rouge-loop.js, rouge-cli.js, deploy-to-staging.js, progress-streamer.js, notify-slack.js) and one prompt file (02e-evaluation.md). No product code changes.

**Tech Stack:** Node.js, Slack Block Kit

---

### Task 1: Fix SIGTERM handling — graceful shutdown instead of ignore

**Files:**
- Modify: `src/launcher/rouge-loop.js:1136-1138`

**Step 1: Replace SIGTERM handler with graceful shutdown**

Replace the SIGTERM handler that ignores the signal with one that sets a shutdown flag, waits for the current phase to finish, then exits.

```javascript
// Line 1136-1138: Replace
process.on('SIGTERM', () => {
  log('SIGTERM received — ignoring (launcher is long-running)');
});

// With:
let shuttingDown = false;
process.on('SIGTERM', () => {
  log('SIGTERM received — will exit after current phase completes');
  shuttingDown = true;
});
```

**Step 2: Check shutdown flag in the main loop**

After each phase completes (before `Loop complete. Sleeping`), check the flag:

At the end of the `while (true)` loop body (before the sleep), add:

```javascript
if (shuttingDown) {
  log('Graceful shutdown complete');
  process.exit(0);
}
```

**Step 3: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "fix: graceful SIGTERM shutdown instead of ignoring signal"
```

---

### Task 2: Fix deploy targeting wrong directory

**Files:**
- Modify: `src/launcher/deploy-to-staging.js:71-97`

**Step 1: Detect app subdirectory**

In the `deploy` function, before running `npm run build`, find the actual app directory:

```javascript
// After line 72 (const ctxFile = ...), add:
// Find the app directory — look for package.json with a build script
let appDir = projectDir;
const subdirs = ['app', 'src', 'web', 'frontend'];
for (const sub of subdirs) {
  const subPkg = path.join(projectDir, sub, 'package.json');
  if (fs.existsSync(subPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(subPkg, 'utf8'));
      if (pkg.scripts && pkg.scripts.build) {
        appDir = path.join(projectDir, sub);
        log(`App directory detected: ${sub}/`);
        break;
      }
    } catch {}
  }
}

// Also check project root
if (appDir === projectDir) {
  const rootPkg = path.join(projectDir, 'package.json');
  if (fs.existsSync(rootPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkg, 'utf8'));
      if (!pkg.scripts || !pkg.scripts.build) {
        log(`No build script in project root — skipping deploy`);
        return null;
      }
    } catch {}
  } else {
    log(`No package.json found — skipping deploy`);
    return null;
  }
}
```

**Step 2: Use appDir for all build commands**

Replace `{ cwd: projectDir }` with `{ cwd: appDir }` in the build commands (lines 86-88).

**Step 3: Commit**

```bash
git add src/launcher/deploy-to-staging.js
git commit -m "fix: deploy detects app subdirectory instead of running in project root"
```

---

### Task 3: Fix progress streamer reporting premature FAIL verdict

**Files:**
- Modify: `src/launcher/progress-streamer.js:15`

**Step 1: Make PASS/FAIL pattern only match verdict lines**

The current pattern `/PASS|FAIL/i` matches any occurrence. Change it to only match explicit verdict declarations:

```javascript
// Line 15: Replace
{ pattern: /PASS|FAIL/i, format: (m) => `${m[0] === 'PASS' ? '✅' : '❌'} Verdict: ${m[0]}` },

// With:
{ pattern: /\bVerdict:?\s*(PASS|FAIL)\b/i, format: (m) => `${m[1].toUpperCase() === 'PASS' ? '✅' : '❌'} Verdict: ${m[1]}` },
```

This ensures it only reports verdicts when the evaluation explicitly says "Verdict: PASS" or "Verdict: FAIL", not when it mentions pass/fail in reasoning text.

**Step 2: Commit**

```bash
git add src/launcher/progress-streamer.js
git commit -m "fix: progress streamer only reports explicit verdict declarations"
```

---

### Task 4: Fix Slack notifications — load webhook from Keychain in cmdBuild

**Files:**
- Modify: `src/launcher/rouge-cli.js:349-371`

**Step 1: Load Slack webhook in cmdBuild**

```javascript
function cmdBuild(name) {
  const env = { ...process.env };
  if (name) {
    const projectPath = path.join(PROJECTS_DIR, name);
    if (!fs.existsSync(projectPath)) {
      console.error(`Project not found: ${projectPath}`);
      process.exit(1);
    }
    env.ROUGE_PROJECT_FILTER = name;
  }

  // Load Slack webhook from Keychain so the loop can send notifications
  const slackWebhook = getSecret('slack', 'ROUGE_SLACK_WEBHOOK');
  if (slackWebhook) {
    env.ROUGE_SLACK_WEBHOOK = slackWebhook;
  }

  console.log('Starting the Karpathy Loop...');

  const loopScript = path.join(__dirname, 'rouge-loop.js');
  const child = spawn('node', [loopScript], {
    stdio: 'inherit',
    env,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}
```

**Step 2: Add error logging to notifyRich**

In `rouge-loop.js`, change `notifyRich` to log failures instead of silently swallowing:

```javascript
function notifyRich(type, args) {
  try {
    execFileSync('node', [
      path.join(__dirname, 'notify-slack.js'),
      type,
      JSON.stringify(args),
    ], { env: process.env, timeout: 15000, stdio: 'pipe' });
  } catch (err) {
    log(`Slack notification (${type}) failed: ${(err.message || '').slice(0, 100)}`);
  }
}
```

**Step 3: Commit**

```bash
git add src/launcher/rouge-cli.js src/launcher/rouge-loop.js
git commit -m "fix: load Slack webhook from Keychain in build command, log notification failures"
```

---

### Task 5: Fix stale rate limit reset times

**Files:**
- Modify: `src/launcher/rouge-loop.js:1115-1130` (the rate limit retry logic)

**Step 1: Add fallback backoff when parsed time is in the past**

The `parseResetTime` fix (retry in 2min when past) is already in place. But the rate limit retry block also has a fallback `backoff = 60000 * (retries + 1)` that can produce long waits. Cap the fallback:

```javascript
// In the rate limit handling block (~line 1115), change the fallback:
let backoff = 120000; // 2 min default — don't escalate, just retry
```

This ensures that even when `parseResetTime` returns 0 (no match), the fallback is 2 minutes, not escalating.

**Step 2: Commit**

```bash
git add src/launcher/rouge-loop.js
git commit -m "fix: cap rate limit fallback backoff to 2 minutes"
```

---

### Task 6: Ensure evaluation reads correct versioned walk screenshots

**Files:**
- Modify: `src/prompts/loop/02e-evaluation.md`

**Step 1: Add walk version awareness to evaluation**

Add to the "What You Read" section, after `_cycle_number`:

```markdown
- `_walk_pass` — current walk pass number (screenshots are in `screenshots/cycle-N/walk-P/`)
```

Add to the QA lens section, after criteria verification:

```markdown
**Screenshot evidence:** When referencing screenshots, use the most recent walk pass. Read `_walk_pass` from `cycle_context.json` and look for evidence in `screenshots/cycle-${CYCLE}/walk-${WALK_PASS}/`. If a previous walk pass exists, note improvements or regressions compared to the earlier pass.
```

**Step 2: Commit**

```bash
git add src/prompts/loop/02e-evaluation.md
git commit -m "fix: evaluation reads screenshots from correct versioned walk folder"
```
