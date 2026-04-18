const fs = require('fs');
const { rotateJsonlIfNeeded } = require('./jsonl-rotation');

// Cap at 500 checkpoints — long-running builds otherwise grow this file
// without bound. 500 covers many milestones of history while keeping the
// file under a few MB; older entries roll off the front.
const MAX_CHECKPOINT_ENTRIES = 500;

function writeCheckpoint(filePath, { phase, state, costs }) {
  const checkpoint = {
    id: `cp-${new Date().toISOString()}-${phase}`,
    phase,
    timestamp: new Date().toISOString(),
    state: { ...state },
    costs: { ...costs }
  };
  const line = JSON.stringify(checkpoint) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
  rotateJsonlIfNeeded(filePath, MAX_CHECKPOINT_ENTRIES);
  return checkpoint;
}

function readLatestCheckpoint(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return null;
  // filter(Boolean) drops empty lines. Walk backwards looking for the
  // first parseable one — a partial/truncated final line (SIGKILL mid-
  // append, disk-full half-write) used to throw here and take the whole
  // checkpoint reader down. Audit F5.
  const lines = content.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      continue;
    }
  }
  return null;
}

function readAllCheckpoints(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  const out = [];
  for (const line of content.split('\n').filter(Boolean)) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // Skip malformed lines rather than aborting — one bad checkpoint
      // shouldn't hide the rest of the history.
    }
  }
  return out;
}

function recoverFromCheckpoint(filePath, checkpointId) {
  const all = readAllCheckpoints(filePath);
  const idx = all.findIndex(cp => cp.id === checkpointId);
  if (idx === -1) throw new Error(`Checkpoint ${checkpointId} not found`);
  const kept = all.slice(0, idx + 1);
  fs.writeFileSync(filePath, kept.map(cp => JSON.stringify(cp)).join('\n') + '\n', 'utf8');
}

module.exports = { writeCheckpoint, readLatestCheckpoint, readAllCheckpoints, recoverFromCheckpoint };
