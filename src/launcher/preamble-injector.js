/**
 * V3 Preamble injector — builds and injects the shared preamble for every phase prompt.
 * The preamble defines the I/O contract: what each phase can read, what it must write,
 * and what it must never touch.
 */

const fs = require('fs');
const path = require('path');

const PREAMBLE_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../prompts/loop/_preamble.md'), 'utf8'
);

function buildPreamble({ phaseName, phaseDescription, modelName, requiredOutputKeys, learningsContent }) {
  let preamble = PREAMBLE_TEMPLATE
    .replace('{{phase_name}}', phaseName)
    .replace('{{phase_description}}', phaseDescription)
    .replace('{{model_name}}', modelName);

  // Task ledger write permission — only generating-change-spec can write
  if (phaseName === 'generating-change-spec') {
    preamble = preamble.replace(
      '{{task_ledger_write_note}}',
      '- task_ledger.json (WRITE ALLOWED — this phase adds fix stories)'
    );
  } else {
    preamble = preamble.replace('{{task_ledger_write_note}}', '');
    // Add task_ledger to NEVER write list for non-change-spec phases
    preamble = preamble.replace(
      '- checkpoints.jsonl (launcher-only)',
      '- task_ledger.json (read-only — only generating-change-spec may write)\n- checkpoints.jsonl (launcher-only)'
    );
  }

  // Required output keys
  if (requiredOutputKeys.length > 0) {
    preamble = preamble.replace(
      '{{required_output_keys}}',
      requiredOutputKeys.map(k => `- ${k}`).join('\n')
    );
  } else {
    preamble = preamble.replace('{{required_output_keys}}', '(none specified)');
  }

  // Learnings
  if (learningsContent && learningsContent.trim()) {
    preamble = preamble.replace(
      '{{learnings_section}}',
      `### Project learnings\n${learningsContent.trim()}`
    );
  } else {
    preamble = preamble.replace('{{learnings_section}}', '');
  }

  return preamble.trim() + '\n';
}

function injectPreamble({ projectDir, phaseName, phaseDescription, modelName, requiredOutputKeys }) {
  // Read learnings.md if it exists
  let learningsContent = '';
  const learningsFile = path.join(projectDir, 'learnings.md');
  if (fs.existsSync(learningsFile)) {
    learningsContent = fs.readFileSync(learningsFile, 'utf8');
  }

  return buildPreamble({ phaseName, phaseDescription, modelName, requiredOutputKeys, learningsContent });
}

module.exports = { buildPreamble, injectPreamble };
