/**
 * Block Kit message builders for Rouge notifications.
 */

function phaseTransition(projectName, fromState, toState, details) {
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

function escalation(projectName, phase, reason) {
  return {
    blocks: [
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
        ],
      },
    ],
  };
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

module.exports = { phaseTransition, phaseComplete, qaResult, escalation, morningBriefing };
