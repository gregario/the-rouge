# Slack Notifications Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Rouge's Slack notifications descriptive, actionable, and visually useful — screenshots after milestones, clear escalation messages with options, and a help guide that explains how to interact with Rouge.

**Architecture:** Rewrite block-kit.js message builders for human-readable copy, wire capture-screenshots.js into the launcher after milestone evaluation, upload images via Slack `files.upload` API (requires bot token), update bot.js for V3 terminology, add comprehensive help.

**Tech Stack:** Node.js, @slack/bolt, Slack Block Kit, Slack Web API (files.upload)

**Key docs:**
- `src/slack/block-kit.js` — message builders (rewrite copy)
- `src/slack/bot.js` — Slack bot commands and handlers (update for V3)
- `src/launcher/notify-slack.js` — notification dispatcher (add screenshot + deploy-failure types)
- `src/launcher/capture-screenshots.js` — screenshot capture (already exists, needs wiring)
- `src/launcher/rouge-loop.js` — launcher (wire screenshot capture after milestone-check)

---

## Phase 1: Message Copy Rewrite

### Task 1: Rewrite phaseTransition messages

**Files:**
- Modify: `src/slack/block-kit.js`

**Step 1: Read the current phaseTransition function**

Read `src/slack/block-kit.js:24-51`.

**Step 2: Rewrite the function**

Replace raw state names with human-readable descriptions. The emoji map and the message format both need updating.

```javascript
function phaseTransition(projectName, fromState, toState, details, confidenceHistory) {
  const descriptions = {
    'foundation':             'Building foundation — schema, auth, deploy pipeline',
    'foundation-eval':        'Evaluating foundation completeness',
    'story-building':         'Building a story',
    'story-diagnosis':        'Diagnosing a failing story',
    'milestone-check':        'Evaluating milestone — test integrity, code review, browser QA',
    'milestone-fix':          'Fixing quality gaps found during evaluation',
    'analyzing':              'Analysing evaluation results — deciding next action',
    'generating-change-spec': 'Generating fix stories from analysis',
    'vision-check':           'Checking product alignment with original vision',
    'shipping':               'Shipping — version bump, changelog, PR, deploy',
    'final-review':           'Final customer walkthrough',
    'escalation':             'Needs your input',
    'complete':               'Done!',
  };

  const emoji = {
    'foundation': '🏗️', 'foundation-eval': '🔍', 'story-building': '🔨',
    'story-diagnosis': '🩺', 'milestone-check': '📋', 'milestone-fix': '🔧',
    'analyzing': '🧠', 'generating-change-spec': '📝', 'vision-check': '🔭',
    'shipping': '🚀', 'final-review': '👀', 'escalation': '⏸️', 'complete': '✅',
  };

  const desc = descriptions[toState] || toState;
  const icon = emoji[toState] || '❓';

  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${icon} *${projectName}* — ${desc}` },
      },
      ...(details ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: details }],
      }] : []),
      ...(confidenceHistory && confidenceHistory.length > 0 ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `📊 Confidence: ${confidenceTrend(confidenceHistory)}` }],
      }] : []),
    ],
  };
}
```

**Step 3: Run any existing tests**

Run: `cd /path/to/the-rouge && npm test 2>&1 | tail -5`

**Step 4: Commit**

```bash
git commit -m "feat(slack): rewrite phase transition messages — human-readable descriptions"
```

---

### Task 2: Rewrite escalation messages

**Files:**
- Modify: `src/slack/block-kit.js`

**Step 1: Rewrite the escalation function**

The current escalation message says "needs human input" and shows raw state names. Rewrite to explain what happened, what was tried, and what the options are.

```javascript
function escalation(projectName, phase, reason, context) {
  const phaseExplanations = {
    'story-building':   'Rouge was building a story and got stuck.',
    'milestone-check':  'Rouge evaluated a milestone and found issues it couldn\'t fix.',
    'milestone-fix':    'Rouge tried to fix quality gaps but couldn\'t resolve them.',
    'analyzing':        'Rouge analysed the evaluation results but needs guidance.',
    'foundation':       'Foundation setup hit a blocker.',
    'foundation-eval':  'Foundation evaluation failed repeatedly.',
    'final-review':     'The final review flagged issues that need your judgment.',
    'vision-check':     'The product may have drifted from the original vision.',
    'shipping':         'Something went wrong during the ship process.',
  };

  const explanation = phaseExplanations[phase] || `Phase \`${phase}\` hit a problem.`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `⏸️ ${projectName} needs your input` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*What happened:* ${explanation}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Why it escalated:* ${reason}` },
    },
  ];

  if (context) {
    const details = [];
    if (context.milestone) details.push(`*Milestone:* ${context.milestone}`);
    if (context.story) details.push(`*Story:* ${context.story}`);
    if (context.healthScore != null) details.push(`*Health:* ${context.healthScore}/100`);
    if (context.confidence != null) details.push(`*Confidence:* ${(context.confidence * 100).toFixed(0)}%`);
    if (context.consecutiveFailures) details.push(`*Consecutive failures:* ${context.consecutiveFailures}`);
    if (context.costUsd != null) details.push(`*Cost so far:* $${context.costUsd.toFixed(2)}`);

    if (details.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: details.join('\n') },
      });
    }
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*What to do:*\nCreate a `feedback.json` in the project directory with your guidance, then click Resume. Or reply in this thread with your feedback.',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '▶️ Resume' },
          action_id: `resume_${projectName}`,
          value: projectName,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '⏭️ Skip' },
          action_id: `skip_${projectName}`,
          value: projectName,
        },
      ],
    }
  );

  return { blocks };
}
```

**Step 2: Commit**

```bash
git commit -m "feat(slack): rewrite escalation messages — explain what happened and what to do"
```

---

### Task 3: Rewrite qaResult and phaseComplete messages

**Files:**
- Modify: `src/slack/block-kit.js`

**Step 1: Rewrite qaResult**

Add which criteria failed (not just counts), show the milestone name, and make the verdict more descriptive.

```javascript
function qaResult(projectName, verdict, healthScore, criteriaPass, criteriaTotal, milestoneName, failedCriteria) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${verdict === 'PASS' ? '✅' : '❌'} *${projectName}* — Milestone "${milestoneName || 'unknown'}" evaluation: *${verdict}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Health Score*\n${healthScore}/100` },
        { type: 'mrkdwn', text: `*Criteria*\n${criteriaPass}/${criteriaTotal} passing` },
      ],
    },
  ];

  if (failedCriteria && failedCriteria.length > 0) {
    const failList = failedCriteria.slice(0, 5).map(c => `• ${c}`).join('\n');
    const extra = failedCriteria.length > 5 ? `\n_...and ${failedCriteria.length - 5} more_` : '';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Failed criteria:*\n${failList}${extra}` },
    });
  }

  if (verdict === 'PASS') {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '🔒 Milestone will be promoted and locked.' }],
    });
  } else {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '🔧 Generating fix stories — will re-evaluate after fixes.' }],
    });
  }

  return { blocks };
}
```

**Step 2: Rewrite phaseComplete to include milestone and story names**

```javascript
function phaseComplete(projectName, phase, duration, filesDelta, lastOutput, milestoneName, storyName) {
  const what = storyName ? `Story "${storyName}"` : phase;
  const where = milestoneName ? ` (milestone: ${milestoneName})` : '';

  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ *${projectName}* — ${what} complete${where}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `⏱️ ${duration || '?'} | 📁 ${filesDelta || '?'} files changed` },
        ],
      },
      ...(lastOutput ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `> ${lastOutput.slice(0, 200)}` }],
      }] : []),
    ],
  };
}
```

**Step 3: Commit**

```bash
git commit -m "feat(slack): rewrite QA result + phase complete — failed criteria, milestone context"
```

---

### Task 4: Rewrite help messages

**Files:**
- Modify: `src/slack/block-kit.js` (add `helpMessage` builder)
- Modify: `src/slack/bot.js` (update `showHelp` and `/rouge help`)

**Step 1: Add a helpMessage builder to block-kit.js**

```javascript
function helpMessage() {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Rouge — How to Use' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '*Three ways to interact:*',
            '',
            '💬 *@Rouge* in a channel — for seeding conversations and commands',
            '⚡ */rouge* slash command — same commands, only you see the response',
            '✉️ *DM* — for seeding conversations in private',
          ].join('\n'),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '*Commands:*',
            '• `status` — All projects at a glance',
            '• `status <project>` — Detailed view: milestones, stories, staging URL, costs',
            '• `new <name>` — Create a project and start an interactive seeding session',
            '• `seed <name>` — Resume a paused seeding session',
            '• `start <project>` — Start the autonomous build loop',
            '• `pause <project>` — Pause an active build',
            '• `resume <project>` — Resume after giving feedback',
            '• `ship <project>` — Approve for production deploy',
            '• `feedback <project> <text>` — Send guidance to a stuck project',
          ].join('\n'),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '*What notifications mean:*',
            '🔨 Building — Rouge is writing code for a story. No action needed.',
            '📋 Evaluating — Browser QA and code review running. No action needed.',
            '🧠 Analysing — Deciding whether to promote, deepen, or escalate.',
            '🚀 Shipping — Deploying to production. Almost done.',
            '⏸️ Escalation — *Action required.* Read the message, provide feedback.',
            '✅ Complete — Product shipped. Celebrate.',
            '',
            '*When Rouge escalates:* It will explain what happened, what it tried, and what it needs. Create a `feedback.json` in the project directory or use `feedback <project> <text>`, then click Resume.',
          ].join('\n'),
        },
      },
    ],
  };
}
```

**Step 2: Update showHelp in bot.js to use the new builder**

Replace both `showHelp()` and the `/rouge help` case to call `blockKit.helpMessage()`.

**Step 3: Commit**

```bash
git commit -m "feat(slack): comprehensive help — interaction modes, commands, notification guide"
```

---

## Phase 2: Screenshot Capture + Upload

### Task 5: Wire screenshot capture into launcher after milestone-check

**Files:**
- Modify: `src/launcher/rouge-loop.js` (in `advanceState`, after milestone-check PASS)

**Step 1: Add screenshot capture call**

In `advanceState`, when `milestone-check` passes (QA verdict === PASS), call `captureScreenshots()` before advancing to `analyzing`. Store the captured file paths in the checkpoint.

```javascript
// After QA PASS, before advancing to analyzing:
try {
  const { captureScreenshots } = require('./capture-screenshots');
  const screenshots = captureScreenshots(projectDir, state.cycle_number || 0);
  if (screenshots.length > 0) {
    log(`[${projectName}] Captured ${screenshots.length} screenshots`);
    // Store paths for Slack upload
    state._last_screenshots = screenshots.map(s => s.file);
    writeJson(stateFile, state);
  }
} catch (err) {
  log(`[${projectName}] Screenshot capture failed (non-blocking): ${(err.message || '').slice(0, 200)}`);
}
```

**Step 2: Commit**

```bash
git commit -m "feat(slack): wire screenshot capture into launcher after milestone evaluation"
```

---

### Task 6: Upload screenshots to Slack via files.upload

**Files:**
- Create: `src/slack/upload-screenshot.js`
- Modify: `src/launcher/notify-slack.js` (add `milestone-screenshots` type)

**Step 1: Create the upload module**

Slack `files.upload` requires the bot token (not just the webhook). This module uses `@slack/web-api` to upload a file and post it to a channel.

```javascript
// src/slack/upload-screenshot.js
const { WebClient } = require('@slack/web-api');
const fs = require('fs');

async function uploadScreenshot(filePath, channel, message) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log('No SLACK_BOT_TOKEN — cannot upload screenshot');
    return null;
  }
  if (!fs.existsSync(filePath)) {
    console.log(`Screenshot not found: ${filePath}`);
    return null;
  }

  const client = new WebClient(token);
  try {
    const result = await client.filesUploadV2({
      channel_id: channel,
      file: fs.createReadStream(filePath),
      filename: require('path').basename(filePath),
      initial_comment: message,
    });
    return result;
  } catch (err) {
    console.error(`Screenshot upload failed: ${(err.message || '').slice(0, 200)}`);
    return null;
  }
}

module.exports = { uploadScreenshot };
```

**Step 2: Add milestone-screenshots notification type to notify-slack.js**

```javascript
case 'milestone-screenshots': {
  // Upload the best screenshot as an image, not a link
  const { uploadScreenshot } = require('../slack/upload-screenshot');
  const channel = process.env.ROUGE_SLACK_CHANNEL;
  if (args.screenshots && args.screenshots.length > 0 && channel) {
    const best = args.screenshots[0]; // home screen is always first
    const msg = `📸 *${args.project}* — Milestone "${args.milestone}" evaluation complete. Here's what it looks like:`;
    await uploadScreenshot(best, channel, msg);
  }
  break;
}
```

**Step 3: Wire the notification into rouge-loop.js after screenshot capture**

After the screenshot capture in Task 5, add:

```javascript
notifyRich('milestone-screenshots', {
  project: projectName,
  milestone: state.current_milestone,
  screenshots: screenshots.map(s => s.file),
});
```

**Step 4: Check that @slack/web-api is in package.json** (it should be via @slack/bolt, but verify)

**Step 5: Commit**

```bash
git commit -m "feat(slack): upload milestone screenshots as images — not links"
```

---

### Task 7: Add deploy failure notification

**Files:**
- Modify: `src/slack/block-kit.js` (add `deployFailure` builder)
- Modify: `src/launcher/notify-slack.js` (add `deploy-failure` type)
- Modify: `src/launcher/rouge-loop.js` (fire notification on deploy blocking)

**Step 1: Add deployFailure block-kit builder**

```javascript
function deployFailure(projectName, attempts, reason) {
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `🚫 *${projectName}* — Staging deploy failed after ${attempts} attempts` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Reason:* ${reason || 'Unknown error'}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Milestone evaluation is blocked until deploy succeeds. The project will escalate.' }],
      },
    ],
  };
}
```

**Step 2: Wire into notify-slack.js and rouge-loop.js**

In rouge-loop.js, where deploy blocking fires the escalation (the `shouldBlockMilestoneCheck` branch), add:

```javascript
notifyRich('deploy-failure', {
  project: projectName,
  attempts: deployResult.attempts,
  reason: deployResult.reason,
});
```

**Step 3: Commit**

```bash
git commit -m "feat(slack): deploy failure notifications — immediate alert, not silent"
```

---

## Phase 3: Bot V3 Update

### Task 8: Update bot.js status command for V3

**Files:**
- Modify: `src/slack/bot.js`

**Step 1: Update formatProjectDetail to use V3 terminology**

Replace "feature areas" with milestones/stories. Read from `task_ledger.json` and `checkpoints.jsonl` for status. Show costs from checkpoints. Show promoted milestones.

Key changes in `formatProjectDetail`:
- Read `task_ledger.json` for milestones and stories
- Read latest checkpoint from `checkpoints.jsonl` for promoted milestones, costs, stories_executed
- Replace "Feature Areas" section with "Milestones" showing story progress per milestone
- Replace "Cycle" with cost summary
- Keep staging URL, confidence history, last action

**Step 2: Update status list view**

Replace `cycle ${state.cycle_number}` with milestone progress: `milestone 2/3, story 4/7`.

**Step 3: Update the seeding discipline list**

Line 1089: Add 'infrastructure' to `DM_DISCIPLINES` array (currently only 7).

**Step 4: Commit**

```bash
git commit -m "feat(slack): update bot status for V3 — milestones, stories, costs, promoted"
```

---

### Task 9: Add cost milestone notifications

**Files:**
- Modify: `src/slack/block-kit.js` (add `costAlert` builder)
- Modify: `src/launcher/notify-slack.js` (add `cost-alert` type)
- Modify: `src/launcher/rouge-loop.js` (fire at 50% and 80% of budget)

**Step 1: Add costAlert builder**

```javascript
function costAlert(projectName, currentUsd, budgetUsd, percentage) {
  const icon = percentage >= 80 ? '🔴' : '🟡';
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${icon} *${projectName}* — ${percentage}% of budget used ($${currentUsd.toFixed(2)} / $${budgetUsd})` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: percentage >= 80
          ? 'The project will escalate if the budget cap is reached.'
          : 'This is an informational alert. The build continues.' }],
      },
    ],
  };
}
```

**Step 2: Wire into rouge-loop.js**

After `trackPhaseCost`, check if cumulative cost crossed 50% or 80% thresholds and notify once per threshold (track in state as `_cost_alert_50` / `_cost_alert_80`).

**Step 3: Commit**

```bash
git commit -m "feat(slack): cost milestone notifications — alert at 50% and 80% of budget"
```

---

### Task 10: Update slack-setup.md with interaction guide

**Files:**
- Modify: `docs/slack-setup.md`

**Step 1: Add a "How to use" section at the end**

After the current setup instructions, add a section explaining the three interaction modes (@, /, DM), what notifications mean, and how to respond to escalations. This mirrors the help message (Task 4) but in documentation form, with more detail and examples.

**Step 2: Commit**

```bash
git commit -m "docs(slack): add interaction guide — @, /, DM modes, notification meanings"
```

---

## Summary

| Task | Phase | What | Files |
|------|-------|------|-------|
| 1 | Copy | Phase transition messages | block-kit.js |
| 2 | Copy | Escalation messages | block-kit.js |
| 3 | Copy | QA result + phase complete | block-kit.js |
| 4 | Copy | Help message | block-kit.js, bot.js |
| 5 | Screenshots | Wire capture into launcher | rouge-loop.js |
| 6 | Screenshots | Upload to Slack as images | upload-screenshot.js, notify-slack.js, rouge-loop.js |
| 7 | Deploy | Deploy failure notifications | block-kit.js, notify-slack.js, rouge-loop.js |
| 8 | Bot | Status command V3 update | bot.js |
| 9 | Bot | Cost milestone notifications | block-kit.js, notify-slack.js, rouge-loop.js |
| 10 | Docs | Slack interaction guide | slack-setup.md |

**Estimated effort:** 10 tasks, ~2-3 hours
