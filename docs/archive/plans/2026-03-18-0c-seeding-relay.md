# 0c.18-22: Seeding Relay — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Slack-to-Claude seeding relay so users can seed new products via Slack conversation.

**Architecture:** `rouge new <name>` creates a project directory and starts a `claude -p` seeding session. Each subsequent Slack message resumes the session via `--resume <session-id>`. The bot relays responses back to Slack. On convergence + approval, artifacts are written and state set to `ready`. On timeout (2h), session ID is saved for later resume.

**Tech Stack:** Node.js (extending existing bot.js), `child_process.execSync`, Claude CLI `--resume`

---

### Task 1: Add "new" command to Slack bot (0c.18)

**Files:**
- Modify: `src/slack/bot.js`

**Step 1: Add seeding state helpers**

Add these functions after the existing helpers in bot.js:

```javascript
const { execSync } = require('child_process');

function getSeedingState(projectName) {
  const seedPath = path.join(PROJECTS_DIR, projectName, 'seeding-state.json');
  if (!fs.existsSync(seedPath)) return null;
  return JSON.parse(fs.readFileSync(seedPath, 'utf8'));
}

function writeSeedingState(projectName, seedState) {
  const seedPath = path.join(PROJECTS_DIR, projectName, 'seeding-state.json');
  const tmp = seedPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(seedState, null, 2) + '\n');
  fs.renameSync(tmp, seedPath);
}

function invokeClaudeSeeding(projectDir, prompt, sessionId) {
  const args = [
    'claude', '-p', JSON.stringify(prompt),
    '--project', projectDir,
    '--dangerously-skip-permissions',
    '--model', 'opus',
    '--max-turns', '50',
    '--output-format', 'json',
  ];
  if (sessionId) {
    args.push('--resume', sessionId);
  }
  try {
    const result = execSync(args.join(' '), {
      encoding: 'utf8',
      timeout: 300000, // 5 min max per invocation
      cwd: projectDir,
    });
    return JSON.parse(result);
  } catch (err) {
    return { error: err.message, result: null };
  }
}
```

**Step 2: Add "new" command case**

In the switch statement, add before `default`:

```javascript
      case 'new': {
        if (!projectName) { await say('Usage: `rouge new <project-name>`'); return; }

        // Validate name (kebab-case)
        if (!/^[a-z][a-z0-9-]+$/.test(projectName)) {
          await say('Project name must be kebab-case (e.g., `my-cool-app`).');
          return;
        }

        const projectDir = path.join(PROJECTS_DIR, projectName);
        if (fs.existsSync(projectDir)) {
          await say(`Project \`${projectName}\` already exists.`);
          return;
        }

        // Create project directory with initial state
        fs.mkdirSync(projectDir, { recursive: true });
        writeState(projectName, {
          current_state: 'seeding',
          cycle_number: 0,
          feature_areas: [],
          current_feature_area: null,
          confidence_history: [],
        });

        // Read the seeding swarm prompt
        const promptPath = path.join(__dirname, '../prompts/seeding/00-swarm-orchestrator.md');
        const seedPrompt = fs.readFileSync(promptPath, 'utf8');

        await say(`🌱 Creating project \`${projectName}\`. Starting seeding session...\n_This is an interactive conversation. Tell me about your product idea._`);

        // First invocation with the full seeding prompt
        const initPrompt = seedPrompt + '\n\n---\n\nThe user wants to build a product called "' + projectName + '". Start the seeding swarm. Ask the first question.';

        const result = invokeClaudeSeeding(projectDir, initPrompt, null);

        if (result.error) {
          await say(`❌ Seeding failed to start: ${result.error}`);
          return;
        }

        // Save session ID for future messages
        writeSeedingState(projectName, {
          session_id: result.session_id,
          channel_id: event.channel,
          started_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          status: 'active',
        });

        // Send Claude's first response
        const response = result.result || result.message || JSON.stringify(result);
        await say(response);
        break;
      }
```

**Step 3: Add "seed" command for resuming**

Add after the "new" case:

```javascript
      case 'seed': {
        if (!projectName) { await say('Usage: `rouge seed <project-name>` to resume a seeding session'); return; }
        const seedState = getSeedingState(projectName);
        if (!seedState || seedState.status !== 'paused') {
          await say(`No paused seeding session for \`${projectName}\`.`);
          return;
        }
        seedState.status = 'active';
        seedState.last_activity = new Date().toISOString();
        writeSeedingState(projectName, seedState);
        await say(`🌱 Resumed seeding for \`${projectName}\`. Continue the conversation.`);
        break;
      }
```

**Step 4: Update the help text**

In the default case, add:
```
'• `new <name>` — Create a new project and start seeding',
'• `seed <name>` — Resume a paused seeding session',
```

**Step 5: Commit**

```bash
git add src/slack/bot.js
git commit -m "feat(slack): add 'new' and 'seed' commands for seeding relay"
```

---

### Task 2: Message relay for active seeding sessions (0c.19)

**Files:**
- Modify: `src/slack/bot.js`

**Step 1: Add seeding message detection**

In the `default` case of the switch, BEFORE the existing feedback check, add seeding relay logic. When a message comes in on a channel where a seeding session is active, relay it to Claude:

```javascript
      default: {
        // Check if there's an active seeding session in this channel
        const activeSeedings = listProjects().filter(name => {
          const ss = getSeedingState(name);
          return ss && ss.status === 'active' && ss.channel_id === event.channel;
        });

        if (activeSeedings.length > 0) {
          const seedProject = activeSeedings[0]; // One seeding session per channel
          const seedState = getSeedingState(seedProject);
          const projectDir = path.join(PROJECTS_DIR, seedProject);

          // Relay the full message text to Claude
          const userMessage = text; // Already stripped of @mention
          await say('_Thinking..._');

          const result = invokeClaudeSeeding(projectDir, userMessage, seedState.session_id);

          if (result.error) {
            await say(`❌ Seeding error: ${result.error}`);
            break;
          }

          // Update session state
          seedState.last_activity = new Date().toISOString();
          if (result.session_id) seedState.session_id = result.session_id;
          writeSeedingState(seedProject, seedState);

          // Check if Claude indicated convergence/approval
          const response = result.result || result.message || JSON.stringify(result);

          // Send response (split if > 3000 chars for Slack limit)
          if (response.length > 3000) {
            const chunks = response.match(/.{1,3000}/gs) || [response];
            for (const chunk of chunks) {
              await say(chunk);
            }
          } else {
            await say(response);
          }
          break;
        }

        // ... existing feedback check and help text ...
```

**Step 2: Commit**

```bash
git add src/slack/bot.js
git commit -m "feat(slack): add bidirectional seeding relay via claude --resume"
```

---

### Task 3: Seeding timeout (0c.20)

**Files:**
- Modify: `src/slack/bot.js`

**Step 1: Add timeout check**

Add a periodic check that runs every 10 minutes. After the `app.start()` call:

```javascript
// Check for seeding timeouts every 10 minutes
const SEEDING_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  const projects = listProjects();
  for (const name of projects) {
    const ss = getSeedingState(name);
    if (!ss || ss.status !== 'active') continue;

    const elapsed = Date.now() - new Date(ss.last_activity).getTime();
    if (elapsed > SEEDING_TIMEOUT_MS) {
      ss.status = 'paused';
      writeSeedingState(name, ss);

      // Notify via webhook (can't use say() outside event context)
      if (process.env.ROUGE_SLACK_WEBHOOK) {
        const msg = `⏸️ Seeding session for \`${name}\` paused after 2 hours of inactivity. Resume with \`rouge seed ${name}\`.`;
        require('child_process').execSync(
          `curl -s -X POST "${process.env.ROUGE_SLACK_WEBHOOK}" -H 'Content-Type: application/json' -d '${JSON.stringify({ text: msg })}'`
        );
      }

      console.log(`Seeding timeout: ${name} paused`);
    }
  }
}, 10 * 60 * 1000);
```

**Step 2: Commit**

```bash
git add src/slack/bot.js
git commit -m "feat(slack): add 2-hour seeding timeout with auto-pause and notification"
```

---

### Task 4: Seeding completion handler (0c.21)

**Files:**
- Modify: `src/slack/bot.js`

**Step 1: Add completion detection**

In the seeding relay (Task 2's code), after getting Claude's response, check for completion signals. Add after the response is received:

```javascript
          // Detect seeding completion
          // The swarm orchestrator outputs a structured approval block when converged
          const isComplete = response.includes('SEEDING_COMPLETE') ||
                           response.includes('seed approved') ||
                           response.includes('ready to start');

          if (isComplete) {
            // Transition project to ready state
            const state = readState(seedProject);
            state.current_state = 'ready';
            writeState(seedProject, state);

            // Clean up seeding state
            seedState.status = 'complete';
            writeSeedingState(seedProject, seedState);

            await say(`\n✅ Seeding complete for \`${seedProject}\`! State set to \`ready\`.\nUse \`rouge start ${seedProject}\` when you want the autonomous loop to begin.`);
          }
```

**Step 2: Commit**

```bash
git add src/slack/bot.js
git commit -m "feat(slack): add seeding completion detection and ready state transition"
```

---

### Task 5: Test the seeding flow manually (0c.22)

**Files:**
- No new files — this is a manual test

**Step 1: Start the bot**

```bash
cd src/slack
export $(grep -v '^#' ../../.env | grep -v '^$' | xargs)
node bot.js
```

**Step 2: Test in Slack**

1. `@rouge new test-project` → should create project dir and start seeding
2. Reply with a product description → should relay to Claude and back
3. Continue conversation until seeding completes
4. `@rouge status` → should show test-project as `ready`
5. `@rouge start test-project` → should transition to `building`
6. `@rouge pause test-project` → should pause
7. `@rouge resume test-project` → should resume

**Step 3: Clean up test project**

```bash
rm -rf projects/test-project
```

**Step 4: Commit any fixes discovered during testing**

---

## Key Design Decisions

1. **Session resume via `--resume`**: Each Slack message triggers a separate `claude -p --resume <id>` call. The Claude session maintains full conversation context. No manual history management.

2. **Synchronous invocations**: `execSync` blocks the bot while Claude responds (up to 5 min timeout). This is fine for seeding — only one user seeds at a time. If it becomes a problem, switch to `execFile` with async/await.

3. **One seeding session per channel**: Simplifies relay — any message in the channel during active seeding goes to Claude. Multiple concurrent seedings would need thread-based routing.

4. **Completion detection by keyword**: The swarm orchestrator prompt should output a clear "SEEDING_COMPLETE" marker. This is fragile — a future improvement would use structured JSON output from `--output-format json` to detect completion via a specific field.
