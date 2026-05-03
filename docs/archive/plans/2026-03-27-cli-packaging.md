# Rouge CLI Packaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Package Rouge as a proper CLI tool with `rouge init`, `rouge seed`, `rouge build`, `rouge status`, `rouge cost` commands plus a Slack setup guide, ready for npm distribution.

**Architecture:** Extend the existing `src/launcher/rouge-cli.js` with new subcommands. Each command is a thin wrapper over existing functionality (claude -p invocations, rouge-loop.js, state.json reading, estimate-cost.js). No new core logic — just CLI ergonomics over what already works.

**Tech Stack:** Node.js (CommonJS), readline for interactive prompts, child_process for claude -p invocations.

---

## Task 1: Add `rouge init <name>` command

**Files:**
- Modify: `src/launcher/rouge-cli.js`
- Create: `tests/cli.test.js`

**What it does:**
- Creates `projects/<name>/` directory
- Creates a minimal `vision.json` stub (name only, to be filled by seeding)
- Prints next steps: "Run `rouge seed <name>` to start the seeding process"
- If directory already exists, warn and exit

**Step 1: Write the test**

```javascript
// tests/cli.test.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log(`  PASS: ${message}`); }
  else { failed++; console.error(`  FAIL: ${message}`); }
}

console.log('\nRouge CLI tests');
console.log('='.repeat(50));

// Test: rouge init creates project directory
console.log('\n[rouge init]');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-test-'));
  const result = execSync(
    `node src/launcher/rouge-cli.js init test-project`,
    { encoding: 'utf8', env: { ...process.env, ROUGE_PROJECTS_DIR: tmpDir } }
  );
  assert(fs.existsSync(path.join(tmpDir, 'test-project')), 'creates project directory');
  assert(result.includes('rouge seed'), 'prints next step hint');
  fs.rmSync(tmpDir, { recursive: true });
}

// ... more tests per task below

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

**Step 2: Implement `rouge init`**

Add to the CLI router in rouge-cli.js:
- Parse `init <name>` command
- Read `ROUGE_PROJECTS_DIR` env var (fallback to `projects/` relative to ROUGE_ROOT)
- Create directory, write stub vision.json
- Print instructions

**Step 3: Run tests, commit**

```bash
node tests/cli.test.js
git add src/launcher/rouge-cli.js tests/cli.test.js
git commit -m "feat(cli): add rouge init command"
```

---

## Task 2: Add `rouge seed <name>` command

**Files:**
- Modify: `src/launcher/rouge-cli.js`
- Modify: `tests/cli.test.js`

**What it does:**
- Verifies `projects/<name>/` exists (if not, suggest `rouge init`)
- Invokes `claude -p` with the swarm orchestrator prompt against the project
- Passes through stdout/stderr so the user sees the interactive seeding session
- Command: `claude -p --project projects/<name> --prompt-file src/prompts/seeding/00-swarm-orchestrator.md`

**Step 1: Write the test**

Test that `rouge seed` with a non-existent project prints an error and suggests `rouge init`. (Don't test the actual claude -p invocation — that's an integration test.)

**Step 2: Implement**

Add `seed <name>` to CLI router. Verify project exists. Spawn `claude` as a child process with `stdio: 'inherit'` so the user interacts directly.

**Step 3: Run tests, commit**

```bash
node tests/cli.test.js
git add src/launcher/rouge-cli.js tests/cli.test.js
git commit -m "feat(cli): add rouge seed command — invokes interactive seeding"
```

---

## Task 3: Add `rouge build [name]` command

**Files:**
- Modify: `src/launcher/rouge-cli.js`
- Modify: `tests/cli.test.js`

**What it does:**
- If `<name>` provided: starts the loop for just that project
- If no name: starts the loop for all projects (existing rouge-loop.js behaviour)
- Spawns `rouge-loop.js` with `stdio: 'inherit'`
- Prints: "Starting the Karpathy Loop. Press Ctrl+C to stop. Projects will be advanced one phase per iteration."

**Step 1: Write the test**

Test that `rouge build nonexistent` prints an error. Test that `rouge build` without args doesn't crash (just verify it starts — kill after 1 second).

**Step 2: Implement**

Add `build [name]` to CLI router. If name given, set `ROUGE_PROJECT_FILTER=<name>` env var (rouge-loop.js already reads this or can be made to). Spawn rouge-loop.js.

**Step 3: Run tests, commit**

```bash
node tests/cli.test.js
git add src/launcher/rouge-cli.js tests/cli.test.js
git commit -m "feat(cli): add rouge build command — starts Karpathy Loop"
```

---

## Task 4: Add `rouge status [name]` command

**Files:**
- Modify: `src/launcher/rouge-cli.js`
- Modify: `tests/cli.test.js`

**What it does:**
- If `<name>` provided: reads `projects/<name>/state.json`, prints current state, cycle number, feature areas with status
- If no name: reads all projects, prints summary table
- Format:
```
  Project          State              Cycle   Features
  fleet-manager    building           3       2/7 complete
  testimonial      waiting-for-human  1       0/3 complete
```

**Step 1: Write the test**

Create a temp project dir with a mock state.json. Run `rouge status`. Verify output contains project name and state.

**Step 2: Implement**

Add `status [name]` to CLI router. Read state.json, format output. Handle missing state.json gracefully.

**Step 3: Run tests, commit**

```bash
node tests/cli.test.js
git add src/launcher/rouge-cli.js tests/cli.test.js
git commit -m "feat(cli): add rouge status command — project state summary"
```

---

## Task 5: Add `rouge cost [name]` command

**Files:**
- Modify: `src/launcher/rouge-cli.js`
- Modify: `tests/cli.test.js`

**What it does:**
- Wraps `estimate-cost.js`
- If `<name>` provided: runs estimate for that project
- `--actual` flag: shows actual cost from logs instead of estimate
- Passes through the estimate-cost.js output

**Step 1: Write the test**

Test that `rouge cost nonexistent` prints an error.

**Step 2: Implement**

Add `cost [name] [--actual]` to CLI router. Spawn `estimate-cost.js` with the project path.

**Step 3: Run tests, commit**

```bash
node tests/cli.test.js
git add src/launcher/rouge-cli.js tests/cli.test.js
git commit -m "feat(cli): add rouge cost command — wraps estimate-cost.js"
```

---

## Task 6: Add `rouge slack` setup guide command

**Files:**
- Modify: `src/launcher/rouge-cli.js`
- Create: `docs/slack-setup.md`
- Modify: `tests/cli.test.js`

**What it does:**
- `rouge slack setup` — prints step-by-step Slack app setup guide inline
- `rouge slack start` — starts the Slack bot (`node src/slack/bot.js`)
- `rouge slack test` — sends a test message to verify webhook works

The setup guide walks through:
1. Go to api.slack.com/apps → Create New App → From Manifest
2. Paste the manifest from `src/slack/manifest.yaml`
3. Install to workspace
4. Enable Socket Mode, get App Token
5. Get Bot Token from OAuth & Permissions
6. Run `rouge setup slack` to store the tokens
7. Run `rouge slack start` to start the bot
8. Run `rouge slack test` to verify

**Step 1: Write docs/slack-setup.md**

Full step-by-step guide with screenshots placeholders and exact settings. Reference the manifest.yaml. Include troubleshooting (common errors: missing scopes, socket mode not enabled, wrong token type).

**Step 2: Add CLI commands**

- `rouge slack setup` — reads and prints the guide (or opens it in less/cat)
- `rouge slack start` — spawns `src/slack/bot.js` with required env vars from secrets store
- `rouge slack test` — reads `ROUGE_SLACK_WEBHOOK` from secrets, sends a test POST

**Step 3: Write the test**

Test that `rouge slack setup` prints the guide text. Test that `rouge slack test` without a webhook configured prints a helpful error.

**Step 4: Run tests, commit**

```bash
node tests/cli.test.js
git add src/launcher/rouge-cli.js docs/slack-setup.md tests/cli.test.js
git commit -m "feat(cli): add rouge slack command — setup guide, bot start, test webhook"
```

---

## Task 7: Update package.json for npm distribution

**Files:**
- Modify: `package.json`

**Changes:**
- Remove `"private": true`
- Update `"license": "PolyForm-Noncommercial-1.0.0"`
- Add `"homepage": "https://github.com/gregario/the-rouge"`
- Add `"keywords": ["ai", "autonomous", "product-development", "claude", "karpathy-loop"]`
- Add `"engines": { "node": ">=18" }`
- Add `"scripts": { "test": "node tests/secrets.test.js && node tests/cli.test.js" }`
- Add `"files"` array to control what's published:
  ```json
  "files": [
    "src/",
    "schemas/",
    "library/global/",
    "library/domain/",
    "library/templates/",
    "library/integrations/",
    "library/README.md",
    "rouge.config.json",
    "LICENSE",
    "README.md",
    "CONTRIBUTING.md"
  ]
  ```

**Step 1: Make all changes**

**Step 2: Verify with `npm pack --dry-run`**

Run `npm pack --dry-run` to see exactly what would be published. Verify no secrets, no personal data, no projects/ directory.

**Step 3: Run full test suite**

```bash
npm test
```

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat(packaging): prepare package.json for npm distribution"
```

---

## Task 8: Update README Getting Started section

**Files:**
- Modify: `README.md`

**Changes:**
Update the Getting Started section to use the new CLI commands:

```markdown
### Getting started

```bash
git clone https://github.com/gregario/the-rouge.git
cd the-rouge
npm install
```

### Set up integrations

```bash
rouge setup supabase
rouge setup stripe
rouge secrets list
```

### Set up Slack (recommended)

```bash
rouge slack setup    # Prints step-by-step guide
rouge setup slack    # Store your Slack tokens
rouge slack start    # Start the bot
rouge slack test     # Verify it works
```

### Build a product

```bash
rouge init my-product       # Create project directory
rouge seed my-product       # Interactive seeding session
rouge build my-product      # Start the Karpathy Loop
rouge status                # Check progress
rouge cost my-product       # See cost estimate
```
```

**Step 1: Update README**

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update Getting Started with new CLI commands and Slack setup"
```

---

## Execution Order

```
Task 1 (init) → Task 2 (seed) → Task 3 (build) → Task 4 (status) → Task 5 (cost)
  → Task 6 (slack) → Task 7 (package.json) → Task 8 (README)
```

All sequential — each task extends rouge-cli.js and the test file.

---

## Review Checkpoint

After Task 5: all five core commands work. Run `node tests/cli.test.js` — all pass.

After Task 8: full package ready. Run `npm test` and `npm pack --dry-run` — clean.
