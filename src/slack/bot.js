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

function invokeClaudeSeeding(projectDir, prompt, sessionId) {
  const args = ['claude', '-p'];
  // Escape the prompt for shell safety
  args.push(JSON.stringify(prompt));
  args.push('--project', projectDir);
  args.push('--dangerously-skip-permissions');
  args.push('--model', 'opus');
  args.push('--max-turns', '50');
  args.push('--output-format', 'json');
  if (sessionId) {
    args.push('--resume', sessionId);
  }
  try {
    const result = execSync(args.join(' '), {
      encoding: 'utf8',
      timeout: 300000,
      cwd: projectDir,
      env: { ...process.env, HOME: process.env.HOME },
    });
    return JSON.parse(result);
  } catch (err) {
    // If JSON parse fails, return the raw output
    if (err.stdout) {
      try { return JSON.parse(err.stdout); } catch {}
    }
    return { error: err.message.slice(0, 500) };
  }
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

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[^>]+>\s*/g, '').trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const projectName = parts[1];

  try {
    switch (cmd) {
      case 'status': {
        const projects = listProjects();
        if (projects.length === 0) {
          await say('No projects found.');
          return;
        }
        const lines = projects.map(name => {
          const state = readState(name);
          const emoji = STATE_EMOJI[state?.current_state] || '\u2753';
          return `${emoji} *${name}*: \`${state?.current_state || 'unknown'}\` (cycle ${state?.cycle_number || 0})`;
        });
        await say(lines.join('\n'));
        break;
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
        break;
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
        const wasState = state.current_state;
        state.paused_from_state = wasState;
        state.current_state = 'waiting-for-human';
        writeState(projectName, state);
        await say(`\u23F8\uFE0F Paused \`${projectName}\` (was: \`${wasState}\`). Use \`rouge resume ${projectName}\` to continue.`);
        break;
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
        await say(`\u25B6\uFE0F Resumed \`${projectName}\` \u2192 \`${resumeTo}\`.`);
        break;
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
          await say(`❌ Seeding prompt not found at ${promptPath}`);
          return;
        }
        const seedPrompt = fs.readFileSync(promptPath, 'utf8');

        await say(`🌱 Creating project \`${projectName}\`. Starting seeding session...\n_Tell me about your product idea._`);

        const initPrompt = seedPrompt + '\n\n---\n\nThe user wants to build a product called "' + projectName + '". Start the seeding swarm. Ask the first question.';
        const result = invokeClaudeSeeding(projectDir, initPrompt, null);

        if (result.error) {
          await say(`❌ Seeding failed to start: ${result.error}`);
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
        break;
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
        await say(`🌱 Resumed seeding for \`${projectName}\`. Continue the conversation.`);
        break;
      }

      default: {
        // Check for active seeding session in this channel
        const activeSeedings = listProjects().filter(name => {
          const ss = getSeedingState(name);
          return ss && ss.status === 'active' && ss.channel_id === event.channel;
        });

        if (activeSeedings.length > 0) {
          const seedProject = activeSeedings[0];
          const seedState = getSeedingState(seedProject);
          const projectDir = path.join(PROJECTS_DIR, seedProject);

          const result = invokeClaudeSeeding(projectDir, text, seedState.session_id);

          if (result.error) {
            await say(`❌ Seeding error: ${result.error}`);
            break;
          }

          seedState.last_activity = new Date().toISOString();
          if (result.session_id) seedState.session_id = result.session_id;

          const response = result.result || result.message || (typeof result === 'string' ? result : JSON.stringify(result));

          // Detect seeding completion
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
            await say(`\n✅ Seeding complete for \`${seedProject}\`! Use \`rouge start ${seedProject}\` when ready.`);
          }
          break;
        }

        // Check if this is feedback for a waiting project
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
        await say([
          '*Rouge Commands:*',
          '\u2022 `status` \u2014 Show all projects and their states',
          '\u2022 `new <name>` \u2014 Create a new project and start seeding',
          '\u2022 `seed <name>` \u2014 Resume a paused seeding session',
          '\u2022 `start <project>` \u2014 Start a ready project',
          '\u2022 `pause <project>` \u2014 Pause an active project',
          '\u2022 `resume <project>` \u2014 Resume a paused project',
          '\u2022 `<project> <feedback>` \u2014 Send feedback to a waiting project',
        ].join('\n'));
      }
    }
  } catch (err) {
    console.error('Command error:', err);
    await say(`\u274C Error: ${err.message}`);
  }
});

(async () => {
  await app.start();
  console.log('\u26A1 Rouge Slack bot is running (Socket Mode)');
})();
