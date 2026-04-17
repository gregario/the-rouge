/**
 * Resolves the path to a project's state.json.
 *
 * State lives at `.rouge/state.json` inside each project. The dotdir keeps
 * it out of the agent's working-directory listing so phase prompts don't
 * auto-ingest it and start narrating Rouge's pipeline back at the user
 * (issue #135).
 *
 * Reads fall back to the legacy `state.json` at project root so unmigrated
 * projects keep working until the migration script runs.
 */

const fs = require('fs');
const path = require('path');

const ROUGE_DIR = '.rouge';
const STATE_FILE = 'state.json';

function statePath(projectDir) {
  const newPath = path.join(projectDir, ROUGE_DIR, STATE_FILE);
  if (fs.existsSync(newPath)) return newPath;
  const oldPath = path.join(projectDir, STATE_FILE);
  if (fs.existsSync(oldPath)) return oldPath;
  return newPath;
}

function statePathForWrite(projectDir) {
  const dir = path.join(projectDir, ROUGE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, STATE_FILE);
}

function hasStateFile(projectDir) {
  return (
    fs.existsSync(path.join(projectDir, ROUGE_DIR, STATE_FILE)) ||
    fs.existsSync(path.join(projectDir, STATE_FILE))
  );
}

module.exports = {
  statePath,
  statePathForWrite,
  hasStateFile,
  ROUGE_DIR,
  STATE_FILE,
};
