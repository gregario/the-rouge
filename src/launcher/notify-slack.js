#!/usr/bin/env node
/**
 * Post Block Kit notifications to Slack.
 * Usage: node notify-slack.js <type> <json-args>
 * Called by the launcher to send rich notifications.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const blockKit = require('../slack/block-kit');

const WEBHOOK = process.env.ROUGE_SLACK_WEBHOOK;
if (!WEBHOOK) {
  console.log('No ROUGE_SLACK_WEBHOOK set — skipping notification');
  process.exit(0);
}

function send(payload) {
  try {
    execSync(
      `curl -s -X POST "${WEBHOOK}" -H 'Content-Type: application/json' -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`,
      { timeout: 10000, stdio: 'pipe' }
    );
  } catch {}
}

const type = process.argv[2];
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

switch (type) {
  case 'transition':
    send(blockKit.phaseTransition(args.project, args.from, args.to, args.details));
    break;
  case 'complete':
    send(blockKit.phaseComplete(args.project, args.phase, args.duration, args.filesDelta, args.output));
    break;
  case 'qa':
    send(blockKit.qaResult(args.project, args.verdict, args.healthScore, args.criteriaPass, args.criteriaTotal));
    break;
  case 'escalation':
    send(blockKit.escalation(args.project, args.phase, args.reason));
    break;
  case 'briefing':
    send(blockKit.morningBriefing(args.projects));
    break;
  case 'screenshots':
    send({
      text: `📸 *${args.project}* — ${args.count} screenshots captured (loop ${args.loop})`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `📸 *${args.project}* — Screenshots captured` },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Loop ${args.loop} | ${args.screens.join(', ')} | Saved to \`screenshots/loop-${args.loop}/\`` },
          ],
        },
      ],
    });
    break;
  default:
    // Plain text fallback
    send({ text: args.text || type });
}
