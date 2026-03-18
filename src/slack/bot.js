const { App } = require('@slack/bolt');
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

      default: {
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
