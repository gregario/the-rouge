const fs = require('fs');

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
  return checkpoint;
}

function readLatestCheckpoint(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return null;
  const lines = content.split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function readAllCheckpoints(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function recoverFromCheckpoint(filePath, checkpointId) {
  const all = readAllCheckpoints(filePath);
  const idx = all.findIndex(cp => cp.id === checkpointId);
  if (idx === -1) throw new Error(`Checkpoint ${checkpointId} not found`);
  const kept = all.slice(0, idx + 1);
  fs.writeFileSync(filePath, kept.map(cp => JSON.stringify(cp)).join('\n') + '\n', 'utf8');
}

module.exports = { writeCheckpoint, readLatestCheckpoint, readAllCheckpoints, recoverFromCheckpoint };
