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
  const emoji = {
    'test-integrity': '🧪', 'qa-gate': '🔍', 'qa-fixing': '🔧',
    'po-review-journeys': '👀', 'po-review-screens': '👀', 'po-review-heuristics': '👀',
    'analyzing': '🧠', 'vision-checking': '🔭', 'promoting': '🚀',
    'building': '🔨', 'complete': '✅', 'waiting-for-human': '⏸️',
  };

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji[toState] || '❓'} *${projectName}*: \`${fromState}\` → \`${toState}\``,
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

function phaseComplete(projectName, phase, duration, filesDelta, lastOutput) {
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *${projectName}* — \`${phase}\` complete`,
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

function qaResult(projectName, verdict, healthScore, criteriaPass, criteriaTotal) {
  const color = verdict === 'PASS' ? '#36a64f' : '#dc2626';
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${verdict === 'PASS' ? '✅' : '❌'} *${projectName}* — QA Gate: *${verdict}*`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Health Score*\n${healthScore}/100` },
          { type: 'mrkdwn', text: `*Criteria*\n${criteriaPass}/${criteriaTotal} pass` },
        ],
      },
    ],
  };
}

function escalation(projectName, phase, reason, context) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *${projectName}* needs human input`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Phase \`${phase}\` escalated: ${reason}`,
      },
    },
  ];

  // Add cycle context summary if available
  if (context) {
    const lines = [];
    if (context.cycle != null) lines.push(`Cycle: ${context.cycle}`);
    if (context.featureArea) lines.push(`Feature area: ${context.featureArea}`);
    if (context.healthScore != null) lines.push(`QA health: ${context.healthScore}/100`);
    if (context.confidence != null) lines.push(`Confidence: ${(context.confidence * 100).toFixed(0)}%`);
    if (context.lastProgress) lines.push(`Last progress: ${context.lastProgress}`);
    if (context.completedPhases?.length) lines.push(`Completed: ${context.completedPhases.join(' → ')}`);

    if (lines.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: lines.join(' | ') }],
      });
    }
  }

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

function seedingComplete(projectName, featureCount, specCount) {
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `🌱 *${projectName}* seeding complete!` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Feature Areas*\n${featureCount}` },
          { type: 'mrkdwn', text: `*Spec Files*\n${specCount}` },
        ],
      },
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

module.exports = { sparkline, confidenceTrend, phaseTransition, phaseComplete, qaResult, escalation, morningBriefing, rollbackAlert, seedingComplete, poReviewScorecard };
