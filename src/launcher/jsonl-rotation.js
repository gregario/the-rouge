const fs = require('fs');
const { randomUUID } = require('crypto');

// Skip the read+count step until the file passes this size. JSONL append
// is hot path — counting lines on every write would be wasteful for the
// 99% case where we're nowhere near the cap. 256 KB ≈ a few hundred chat
// messages or a few thousand checkpoints, well below either cap.
const PROBE_BYTES = 256 * 1024;

/**
 * Trim a JSONL file to its last `maxEntries` lines, atomically.
 *
 * Why: chat logs and checkpoint logs are both append-only and were
 * unbounded. Long-running builds eventually make every read O(history).
 * A simple cap keeps reads bounded without losing recent context.
 *
 * Atomic via tmp + rename so a concurrent reader never sees a half-
 * truncated file.
 */
function rotateJsonlIfNeeded(filePath, maxEntries) {
  if (!fs.existsSync(filePath)) return;
  let size;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return;
  }
  if (size < PROBE_BYTES) return;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const lines = raw.split('\n').filter((l) => l.length > 0);
  if (lines.length <= maxEntries) return;

  const kept = lines.slice(lines.length - maxEntries);
  const tmp = `${filePath}.${randomUUID()}.rotate`;
  try {
    fs.writeFileSync(tmp, kept.join('\n') + '\n');
    fs.renameSync(tmp, filePath);
  } catch {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    // Best-effort. A failed rotation just means the file keeps growing —
    // it'll be retried on the next append.
  }
}

module.exports = { rotateJsonlIfNeeded };
