const { App } = require('@slack/bolt');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR || path.join(__dirname, '../../projects');
const KNOWN_COMMANDS = ['status', 'start', 'pause', 'resume', 'new', 'seed', 'help'];

function readState(projectName) {
  const statePath = path.join(PROJECTS_DIR, projectName, 'state.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(projectName, state) {
  const statePath = path.join(PROJECTS_DIR, projectName, 'state.json');
  state.timestamp = new Date().toISOString();
  const tmp = statePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, statePath);
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR)
    .filter(d => {
      const p = path.join(PROJECTS_DIR, d, 'state.json');
      return fs.existsSync(p);
    });
}

function writeFeedback(projectName, text) {
  const feedbackPath = path.join(PROJECTS_DIR, projectName, 'feedback.json');
  const tmp = feedbackPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({
    text,
    timestamp: new Date().toISOString(),
  }, null, 2) + '\n');
  fs.renameSync(tmp, feedbackPath);
}

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

function isRateLimited(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('hit your limit') ||
         lower.includes('rate limit') ||
         lower.includes('too many requests') ||
         lower.includes('resets ');
}

function tryParseClaudeOutput(raw) {
  // Try parsing the whole output as JSON
  try { return JSON.parse(raw); } catch {}
  // Try finding a JSON object in the output (Claude may prefix with non-JSON text)
  const jsonMatch = raw.match(/\{[\s\S]*"result"[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  // Try last line (Claude sometimes outputs progress then JSON on last line)
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  return null;
}

function invokeClaudeSeeding(projectDir, prompt, sessionId) {
  const args = ['claude', '-p'];
  args.push('--dangerously-skip-permissions');
  args.push('--model', 'opus');
  args.push('--max-turns', '50');
  args.push('--output-format', 'json');
  if (sessionId) {
    args.push('--resume', sessionId);
  }
  try {
    const rawOutput = execSync(args.join(' '), {
      encoding: 'utf8',
      input: prompt,
      timeout: 600000, // 10 min
      cwd: projectDir,
      env: { ...process.env, HOME: process.env.HOME },
    });

    // Claude may output multiple lines — find the JSON line
    const parsed = tryParseClaudeOutput(rawOutput);
    if (!parsed) {
      // Couldn't parse JSON — return raw text as the result
      console.error('Could not parse Claude JSON output, returning raw text');
      return { result: rawOutput.slice(0, 3000), session_id: null };
    }

    const responseText = parsed.result || parsed.message || '';
    if (isRateLimited(responseText)) {
      return { rate_limited: true, message: responseText };
    }

    return parsed;
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';

    // Try to parse stdout even on error exit
    if (stdout) {
      const parsed = tryParseClaudeOutput(stdout);
      if (parsed) {
        const responseText = parsed.result || parsed.message || '';
        if (isRateLimited(responseText)) {
          return { rate_limited: true, message: responseText };
        }
        return parsed;
      }
      // Couldn't parse but got output — return it as text
      if (stdout.length > 10) {
        return { result: stdout.slice(0, 3000), session_id: null };
      }
    }

    // Distinguish timeout from other errors
    if (err.message.includes('ETIMEDOUT') || err.message.includes('timed out')) {
      return { error: 'Claude took too long to respond. Try again in a minute.', timeout: true };
    }
    console.error('Claude invocation error:', err.message.slice(0, 200));
    return { error: err.message.slice(0, 500) };
  }
}

function sendSeedingResponse(say, result, seedProject) {
  const response = result.result || result.message || (typeof result === 'string' ? result : JSON.stringify(result));

  // Detect seeding completion
  const isComplete = response.includes('SEEDING_COMPLETE') ||
                   (response.includes('approved') && response.includes('ready'));

  return { response, isComplete };
}

const STATE_EMOJI = {
  building: '\u{1F528}',
  'test-integrity': '\u{1F9EA}',
  'qa-gate': '\u{1F50D}',
  'qa-fixing': '\u{1F527}',
  'po-reviewing': '\u{1F440}',
  analyzing: '\u{1F9E0}',
  'generating-change-spec': '\u{1F4DD}',
  'vision-checking': '\u{1F52D}',
  promoting: '\u{1F680}',
  'rolling-back': '\u23EA',
  complete: '\u2705',
  'waiting-for-human': '\u23F8\uFE0F',
  ready: '\u{1F4CB}',
  seeding: '\u{1F331}',
};

function showHelp(say) {
  return say([
    '*Rouge Commands:*',
    '\u2022 `status` \u2014 Show all projects and their states',
    '\u2022 `new <name>` \u2014 Create a new project and start seeding',
    '\u2022 `seed <name>` \u2014 Resume a paused seeding session',
    '\u2022 `start <project>` \u2014 Start a ready project',
    '\u2022 `pause <project>` \u2014 Pause an active project',
    '\u2022 `resume <project>` \u2014 Resume a paused project',
    '\u2022 `<project> <feedback>` \u2014 Send feedback to a waiting project',
    '',
    '_During an active seeding session, just talk naturally \u2014 messages are relayed to Claude._',
  ].join('\n'));
}

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[^>]+>\s*/g, '').trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const projectName = parts[1];

  try {
    // FIX Bug 2: Check known commands BEFORE seeding relay
    // This ensures help/status/pause/etc. always work, even during active seeding
    if (KNOWN_COMMANDS.includes(cmd)) {
      switch (cmd) {
        case 'help': {
          await showHelp(say);
          return;
        }

        case 'status': {
          const projects = listProjects();
          if (projects.length === 0) {
            await say('No projects found.');
            return;
          }
          const lines = projects.map(name => {
            const state = readState(name);
            const seedState = getSeedingState(name);
            const emoji = STATE_EMOJI[state?.current_state] || '\u2753';
            let extra = '';
            if (state?.current_state === 'seeding' && seedState?.status === 'active') {
              extra = ' _(seeding active)_';
            } else if (state?.current_state === 'seeding' && seedState?.status === 'paused') {
              extra = ' _(seeding paused)_';
            }
            return `${emoji} *${name}*: \`${state?.current_state || 'unknown'}\` (cycle ${state?.cycle_number || 0})${extra}`;
          });
          await say(lines.join('\n'));
          return;
        }

        case 'start': {
          if (!projectName) { await say('Usage: `rouge start <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          if (state.current_state !== 'ready') {
            await say(`\`${projectName}\` is \`${state.current_state}\`, not \`ready\`. Can only start ready projects.`);
            return;
          }
          state.current_state = 'building';
          writeState(projectName, state);
          await say(`\u{1F680} Started \`${projectName}\`. Launcher will pick it up on next iteration.`);
          return;
        }

        case 'pause': {
          if (!projectName) { await say('Usage: `rouge pause <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          const nonPausable = ['waiting-for-human', 'complete', 'ready'];
          if (nonPausable.includes(state.current_state)) {
            await say(`\`${projectName}\` is already \`${state.current_state}\`.`);
            return;
          }
          // Also pause active seeding
          if (state.current_state === 'seeding') {
            const seedState = getSeedingState(projectName);
            if (seedState && seedState.status === 'active') {
              seedState.status = 'paused';
              writeSeedingState(projectName, seedState);
            }
          }
          const wasState = state.current_state;
          state.paused_from_state = wasState;
          state.current_state = 'waiting-for-human';
          writeState(projectName, state);
          await say(`\u23F8\uFE0F Paused \`${projectName}\` (was: \`${wasState}\`). Use \`rouge resume ${projectName}\` to continue.`);
          return;
        }

        case 'resume': {
          if (!projectName) { await say('Usage: `rouge resume <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          if (state.current_state !== 'waiting-for-human') {
            await say(`\`${projectName}\` is not paused (current: \`${state.current_state}\`).`);
            return;
          }
          const resumeTo = state.paused_from_state || 'building';
          state.current_state = resumeTo;
          delete state.paused_from_state;
          writeState(projectName, state);
          // Also resume seeding if that was the paused state
          if (resumeTo === 'seeding') {
            const seedState = getSeedingState(projectName);
            if (seedState && seedState.status === 'paused') {
              seedState.status = 'active';
              seedState.channel_id = event.channel;
              seedState.last_activity = new Date().toISOString();
              writeSeedingState(projectName, seedState);
            }
          }
          await say(`\u25B6\uFE0F Resumed \`${projectName}\` \u2192 \`${resumeTo}\`.`);
          return;
        }

        case 'new': {
          if (!projectName) { await say('Usage: `rouge new <project-name>`'); return; }
          if (!/^[a-z][a-z0-9-]*$/.test(projectName)) {
            await say('Project name must be kebab-case (e.g., `my-cool-app`).');
            return;
          }
          const projectDir = path.join(PROJECTS_DIR, projectName);
          if (fs.existsSync(projectDir)) {
            await say(`Project \`${projectName}\` already exists.`);
            return;
          }

          fs.mkdirSync(projectDir, { recursive: true });
          writeState(projectName, {
            current_state: 'seeding',
            cycle_number: 0,
            feature_areas: [],
            current_feature_area: null,
            confidence_history: [],
          });

          const promptPath = path.join(__dirname, '../prompts/seeding/00-swarm-orchestrator.md');
          if (!fs.existsSync(promptPath)) {
            await say(`\u274C Seeding prompt not found at ${promptPath}`);
            return;
          }
          const seedPrompt = fs.readFileSync(promptPath, 'utf8');

          await say(`\u{1F331} Creating project \`${projectName}\`. Starting seeding session...\n_Tell me about your product idea. This may take 30-60 seconds per response._`);

          const initPrompt = seedPrompt + '\n\n---\n\nThe user wants to build a product called "' + projectName + '". Start the seeding swarm. Ask the first question.';
          const result = invokeClaudeSeeding(projectDir, initPrompt, null);

          if (result.rate_limited) {
            await say(`\u23F1\uFE0F Rate limited: ${result.message}\nSeeding session saved. Try again after the reset with \`rouge seed ${projectName}\`.`);
            writeSeedingState(projectName, {
              session_id: null,
              channel_id: event.channel,
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              status: 'paused',
            });
            return;
          }

          if (result.error) {
            await say(`\u274C Seeding failed to start: ${result.error}`);
            return;
          }

          writeSeedingState(projectName, {
            session_id: result.session_id || null,
            channel_id: event.channel,
            started_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            status: 'active',
          });

          const response = result.result || result.message || (typeof result === 'string' ? result : JSON.stringify(result));
          if (response.length > 3000) {
            const chunks = response.match(/.{1,3000}/gs) || [response];
            for (const chunk of chunks) await say(chunk);
          } else {
            await say(response);
          }
          return;
        }

        case 'seed': {
          if (!projectName) { await say('Usage: `rouge seed <project>` to resume a paused seeding session'); return; }
          const seedState = getSeedingState(projectName);
          if (!seedState || seedState.status !== 'paused') {
            await say(`No paused seeding session for \`${projectName}\`.`);
            return;
          }
          seedState.status = 'active';
          seedState.channel_id = event.channel;
          seedState.last_activity = new Date().toISOString();
          writeSeedingState(projectName, seedState);
          // Also make sure state.json reflects seeding
          const state = readState(projectName);
          if (state && state.current_state !== 'seeding') {
            state.current_state = 'seeding';
            delete state.paused_from_state;
            writeState(projectName, state);
          }
          await say(`\u{1F331} Resumed seeding for \`${projectName}\`. Continue the conversation.`);
          return;
        }
      }
    }

    // Seeding relay: if there's an active seeding session in this channel, relay messages
    const activeSeedings = listProjects().filter(name => {
      const ss = getSeedingState(name);
      return ss && ss.status === 'active' && ss.channel_id === event.channel;
    });

    if (activeSeedings.length > 0) {
      const seedProject = activeSeedings[0];
      const seedState = getSeedingState(seedProject);
      const projectDir = path.join(PROJECTS_DIR, seedProject);

      const result = invokeClaudeSeeding(projectDir, text, seedState.session_id);

      // FIX Bug 1: Handle rate limiting gracefully
      if (result.rate_limited) {
        seedState.status = 'paused';
        writeSeedingState(seedProject, seedState);
        await say(`\u23F1\uFE0F Rate limited: ${result.message}\nSeeding paused. Resume after reset with \`rouge seed ${seedProject}\`.`);
        return;
      }

      // FIX Bug 3: Handle timeouts gracefully
      if (result.timeout) {
        await say(`\u23F3 ${result.error}\nThe seeding session is still active — just send your message again.`);
        return;
      }

      if (result.error) {
        await say(`\u274C Seeding error: ${result.error}`);
        return;
      }

      seedState.last_activity = new Date().toISOString();
      if (result.session_id) seedState.session_id = result.session_id;

      const response = result.result || result.message || (typeof result === 'string' ? result : JSON.stringify(result));

      const isComplete = response.includes('SEEDING_COMPLETE') ||
                       (response.includes('approved') && response.includes('ready'));

      if (isComplete) {
        const state = readState(seedProject);
        state.current_state = 'ready';
        writeState(seedProject, state);
        seedState.status = 'complete';
      }

      writeSeedingState(seedProject, seedState);

      if (response.length > 3000) {
        const chunks = response.match(/.{1,3000}/gs) || [response];
        for (const chunk of chunks) await say(chunk);
      } else {
        await say(response);
      }

      if (isComplete) {
        await say(`\n\u2705 Seeding complete for \`${seedProject}\`! Use \`rouge start ${seedProject}\` when ready.`);
      }
      return;
    }

    // Feedback for waiting projects
    if (projectName) {
      const state = readState(projectName);
      if (state?.current_state === 'waiting-for-human') {
        const feedback = parts.slice(1).join(' ');
        if (feedback) {
          writeFeedback(projectName, feedback);
          await say(`\u{1F4DD} Feedback recorded for \`${projectName}\`. Launcher will process it on next iteration.`);
          return;
        }
      }
    }

    // Nothing matched — show help
    await showHelp(say);

  } catch (err) {
    console.error('Command error:', err);
    await say(`\u274C Error: ${err.message}`);
  }
});

(async () => {
  await app.start();
  console.log('\u26A1 Rouge Slack bot is running (Socket Mode)');
})();

// Check for seeding timeouts every 10 minutes
const SEEDING_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  try {
    const projects = listProjects();
    for (const name of projects) {
      const ss = getSeedingState(name);
      if (!ss || ss.status !== 'active') continue;

      const elapsed = Date.now() - new Date(ss.last_activity).getTime();
      if (elapsed > SEEDING_TIMEOUT_MS) {
        ss.status = 'paused';
        writeSeedingState(name, ss);

        if (process.env.ROUGE_SLACK_WEBHOOK) {
          const msg = `\u23F8\uFE0F Seeding for \`${name}\` paused (2h timeout). Resume: \`@rouge seed ${name}\``;
          try {
            execSync(
              `curl -s -X POST "$ROUGE_SLACK_WEBHOOK" -H 'Content-Type: application/json' -d '${JSON.stringify({ text: msg }).replace(/'/g, "'\\''")}'`,
              { env: process.env, timeout: 10000 }
            );
          } catch {}
        }
        console.log(`Seeding timeout: ${name} paused`);
      }
    }
  } catch (err) {
    console.error('Timeout check error:', err.message);
  }
}, 10 * 60 * 1000);
