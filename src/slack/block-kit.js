/**
 * Block Kit message builders for Rouge notifications.
 */

// Unicode sparkline from confidence history array (0.0-1.0 values)
function sparkline(values) {
  if (!values || values.length === 0) return '';
  const blocks = ' ▁▂▃▄▅▆▇█';
  return values.map(v => {
    const idx = Math.round(Math.min(1, Math.max(0, v)) * 8);
    return blocks[idx];
  }).join('');
}

function confidenceTrend(history) {
  if (!history || history.length < 2) return '';
  const current = history[history.length - 1];
  const prev = history[history.length - 2];
  const delta = current - prev;
  const arrow = delta > 0.02 ? '↑' : delta < -0.02 ? '↓' : '→';
  return `${(current * 100).toFixed(0)}% ${arrow} ${sparkline(history)}`;
}

function phaseTransition(projectName, fromState, toState, details, confidenceHistory) {
  const descriptions = {
    'foundation': 'Building foundation — schema, auth, deploy pipeline',
    'foundation-eval': 'Evaluating foundation completeness',
    'story-building': 'Building a story',
    'story-diagnosis': 'Diagnosing a failing story',
    'milestone-check': 'Evaluating milestone — test integrity, code review, browser QA',
    'milestone-fix': 'Fixing quality gaps found during evaluation',
    'analyzing': 'Analysing evaluation results',
    'generating-change-spec': 'Generating fix stories',
    'vision-check': 'Checking alignment with original vision',
    'shipping': 'Shipping — version bump, changelog, PR, deploy',
    'final-review': 'Final customer walkthrough',
    'escalation': 'Needs your input',
    'complete': 'Done!',
  };

  const emojis = {
    'foundation': '🏗️', 'foundation-eval': '🔍', 'story-building': '🔨',
    'story-diagnosis': '🩺', 'milestone-check': '📋', 'milestone-fix': '🔧',
    'analyzing': '🧠', 'generating-change-spec': '📝', 'vision-check': '🔭',
    'shipping': '🚀', 'final-review': '👀', 'escalation': '⏸️', 'complete': '✅',
  };

  const icon = emojis[toState] || '❓';
  const desc = descriptions[toState] || toState;

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${icon} *${projectName}* — ${desc}`,
        },
      },
      ...(confidenceHistory && confidenceHistory.length > 0 ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `📊 Confidence: ${confidenceTrend(confidenceHistory)}` }],
      }] : []),
      ...(details ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: details }],
      }] : []),
    ],
  };
}

function phaseComplete(projectName, phase, duration, filesDelta, lastOutput, milestoneName, storyName) {
  let headline = `✅ *${projectName}*`;
  if (storyName && milestoneName) {
    headline += ` — Story '${storyName}' complete (milestone: ${milestoneName})`;
  } else if (storyName) {
    headline += ` — Story '${storyName}' complete`;
  } else if (milestoneName) {
    headline += ` — ${phase} complete (milestone: ${milestoneName})`;
  } else {
    headline += ` — ${phase} complete`;
  }

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: headline,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `⏱️ ${duration} | 📁 ${filesDelta} files changed` },
        ],
      },
      ...(lastOutput ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${lastOutput.slice(0, 200)}` },
      }] : []),
    ],
  };
}

function qaResult(projectName, verdict, healthScore, criteriaPass, criteriaTotal, milestoneName, failedCriteria) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${verdict === 'PASS' ? '✅' : '❌'} *${projectName}* — QA Gate: *${verdict}*${milestoneName ? ` (${milestoneName})` : ''}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Health Score*\n${healthScore}/100` },
        { type: 'mrkdwn', text: `*Criteria*\n${criteriaPass}/${criteriaTotal} pass` },
      ],
    },
  ];

  // Show failed criteria list (max 5)
  if (failedCriteria && failedCriteria.length > 0) {
    const shown = failedCriteria.slice(0, 5);
    const remaining = failedCriteria.length - shown.length;
    let failList = shown.map(c => `• ${c}`).join('\n');
    if (remaining > 0) {
      failList += `\n• ...and ${remaining} more`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Failed Criteria:*\n${failList}` },
    });
  }

  // Context note about next action
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: verdict === 'PASS'
        ? '🎉 Milestone promoted — moving to next phase'
        : '🔄 Generating fix stories for failed criteria',
    }],
  });

  return { blocks };
}

function escalation(projectName, phase, reason, context) {
  const phaseExplanations = {
    'story-building': 'Rouge was building a story and got stuck',
    'story-diagnosis': 'Rouge was diagnosing a failing story and couldn\'t resolve it',
    'milestone-check': 'Rouge evaluated a milestone and found issues it couldn\'t fix',
    'milestone-fix': 'Rouge tried to fix quality gaps but couldn\'t resolve them',
    'foundation': 'Foundation setup hit a blocker',
    'foundation-eval': 'Foundation evaluation found issues that need your judgment',
    'final-review': 'The final review flagged issues that need your judgment',
    'vision-check': 'Vision alignment check found a divergence that needs your call',
    'shipping': 'The shipping process hit a blocker',
    'analyzing': 'Analysis found issues that need your input',
    'generating-change-spec': 'Rouge couldn\'t generate a fix story automatically',
  };

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `⏸️ ${projectName} needs your input` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*What happened:*\n${phaseExplanations[phase] || `Phase \`${phase}\` hit an issue`}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Why it escalated:*\n${reason}`,
      },
    },
  ];

  // Add context fields if available
  if (context) {
    const fields = [];
    if (context.milestone) fields.push({ type: 'mrkdwn', text: `*Milestone*\n${context.milestone}` });
    if (context.story) fields.push({ type: 'mrkdwn', text: `*Story*\n${context.story}` });
    if (context.healthScore != null) fields.push({ type: 'mrkdwn', text: `*Health Score*\n${context.healthScore}/100` });
    if (context.confidence != null) fields.push({ type: 'mrkdwn', text: `*Confidence*\n${(context.confidence * 100).toFixed(0)}%` });
    if (context.consecutiveFailures != null) fields.push({ type: 'mrkdwn', text: `*Consecutive Failures*\n${context.consecutiveFailures}` });
    if (context.costSoFar != null) fields.push({ type: 'mrkdwn', text: `*Cost So Far*\n$${context.costSoFar.toFixed(2)}` });

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields,
      });
    }
  }

  blocks.push({ type: 'divider' });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*What to do:*\nDrop a `feedback.json` in the project directory, or reply in this thread with instructions. Then hit Resume.',
    },
  });

  blocks.push({
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
        text: { type: 'plain_text', text: '⏭️ Skip Phase' },
        action_id: `skip_${projectName}`,
        value: projectName,
      },
    ],
  });

  return { blocks };
}

function morningBriefing(projects) {
  const projectBlocks = projects.map(({ name, state, cycle }) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `• *${name}*: \`${state}\` (cycle ${cycle})`,
    },
  }));

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '☀️ Morning Briefing' },
      },
      { type: 'divider' },
      ...projectBlocks,
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `_${new Date().toLocaleDateString()}_` },
        ],
      },
    ],
  };
}

function rollbackAlert(projectName, reason) {
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `⏪ *${projectName}* rolled back` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: reason },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔍 Investigate' },
            action_id: `investigate_${projectName}`,
            value: projectName,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '▶️ Retry' },
            action_id: `resume_${projectName}`,
            value: projectName,
            style: 'primary',
          },
        ],
      },
    ],
  };
}

// FIX #91: accepts the richer stats shape returned by generateCycleContext().
// stats = { schemaVersion, milestones, stories, acceptanceCriteria, featureAreas, specFiles }
function seedingComplete(projectName, stats) {
  const s = stats || {};
  const fields = s.schemaVersion === 'v3'
    ? [
        { type: 'mrkdwn', text: `*Milestones*\n${s.milestones || 0}` },
        { type: 'mrkdwn', text: `*Stories*\n${s.stories || 0}` },
        ...(s.acceptanceCriteria > 0
          ? [{ type: 'mrkdwn', text: `*Acceptance Criteria*\n${s.acceptanceCriteria}` }]
          : []),
      ]
    : [
        { type: 'mrkdwn', text: `*Feature Areas*\n${s.featureAreas || 0}` },
        { type: 'mrkdwn', text: `*Spec Files*\n${s.specFiles || 0}` },
      ];
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `🌱 *${projectName}* seeding complete!` },
      },
      { type: 'section', fields },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🚀 Start Building' },
            action_id: `start_${projectName}`,
            value: projectName,
            style: 'primary',
          },
        ],
      },
    ],
  };
}

function poReviewScorecard(projectName, report) {
  const verdict = report.verdict || 'UNKNOWN';
  const confidence = report.confidence || 0;
  const verdictEmoji = { PRODUCTION_READY: '✅', NEEDS_IMPROVEMENT: '🟡', NOT_READY: '❌' };

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${verdictEmoji[verdict] || '❓'} PO Review: ${projectName}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Verdict*\n${verdict}` },
        { type: 'mrkdwn', text: `*Confidence*\n${(confidence * 100).toFixed(0)}%` },
      ],
    },
  ];

  // Journey quality summary
  if (report.journey_quality && report.journey_quality.length > 0) {
    const jVerdicts = report.journey_quality.map(j => {
      const emoji = j.verdict === 'production-ready' ? '✅' : j.verdict === 'acceptable-with-improvements' ? '🟡' : '❌';
      return `${emoji} ${j.journey_name}`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Journey Quality*\n${jVerdicts.join('\n')}` },
    });
  }

  // Screen quality summary
  if (report.screen_quality && report.screen_quality.length > 0) {
    const screens = report.screen_quality.map(s => {
      const dims = ['hierarchy', 'layout', 'consistency', 'density', 'mobile'];
      const issues = dims.filter(d => s[d] === 'needs-work' || s[d] === 'failing');
      const emoji = issues.length === 0 ? '✅' : '🟡';
      return `${emoji} ${s.screen_url}${issues.length > 0 ? ` (${issues.join(', ')})` : ''}`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Screen Quality*\n${screens.join('\n')}` },
    });
  }

  // Heuristic pass rate
  if (report.heuristic_results) {
    const hr = report.heuristic_results;
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Heuristics*\n${hr.passed}/${hr.total} pass (${hr.pass_rate_pct?.toFixed(0) || '?'}%)` },
        { type: 'mrkdwn', text: `*Action*\n${report.recommended_action || 'n/a'}` },
      ],
    });
  }

  return { blocks };
}

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
          text: '*Three ways to interact:*\n• *@Rouge in a channel* — public commands, status updates, notifications\n• */rouge (slash command)* — private ephemeral responses, only you see them\n• *DM Rouge* — seeding sessions only; talk naturally to build out a new project brief',
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Commands:*\n• `status` — List all projects with current phase\n• `status <project>` — Detailed view: cycle, milestones, confidence\n• `new <name>` — Create a new project and start a seeding session\n• `seed <name>` — Resume a paused seeding session\n• `start <project>` — Start building a seeded (ready) project\n• `pause <project>` — Pause an active project\n• `resume <project>` — Resume a paused project\n• `ship <project>` — Approve a project in final-review for production\n• `feedback <project> <text>` — Send feedback to a project waiting for input',
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*What notifications mean:*\n🔨 *Building* — Rouge is writing code for a story\n📋 *Evaluating* — Milestone check: tests, code review, browser QA\n🧠 *Analysing* — Deciding next action based on evaluation results\n🚀 *Shipping* — Bumping version, writing changelog, opening PR\n⏸️ *Escalation* — Rouge is stuck and needs your input\n✅ *Complete* — Project shipped and production-ready\n\n*When Rouge escalates:* Read the reason in the notification, then either drop a `feedback.json` in the project directory or reply in thread with instructions. Hit *Resume* when ready.',
        },
      },
    ],
  };
}

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
          : 'Informational alert. The build continues.' }],
      },
    ],
  };
}

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

module.exports = { sparkline, confidenceTrend, phaseTransition, phaseComplete, qaResult, escalation, morningBriefing, rollbackAlert, seedingComplete, poReviewScorecard, helpMessage, deployFailure, costAlert };
