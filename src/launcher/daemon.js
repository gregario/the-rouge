/**
 * Daemon install/uninstall — keeps the Rouge dashboard running at login.
 *
 * Phase 2.5a: macOS (launch agent) only. Linux/Windows return "not supported"
 * and will be filled in by Phase 2.5b (systemd --user unit / Scheduled Task).
 *
 * User-facing contract:
 *   - `rouge setup` asks "Keep Rouge running in the background at login? [Y/n]"
 *   - `rouge uninstall` removes the daemon as part of cleanup
 *   - `rouge status` reports whether the daemon is installed and loaded
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const AGENT_LABEL = 'com.rouge.dashboard';
const AGENT_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);

function platform() {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'windows';
  return 'unsupported';
}

function resolveRougeBin() {
  // Prefer the globally installed `rouge` on PATH; fall back to this script's
  // sibling rouge-cli.js so daemon works from source checkouts too.
  try {
    const found = execSync('command -v rouge', { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch { /* not on PATH — fall through */ }
  return path.resolve(__dirname, 'rouge-cli.js');
}

function buildPlist() {
  const bin = resolveRougeBin();
  const logDir = path.join(os.homedir(), '.rouge', 'logs');
  const node = process.execPath;
  // If we fell back to rouge-cli.js, we need node to launch it.
  const programArgs = bin.endsWith('.js')
    ? `    <string>${node}</string>\n    <string>${bin}</string>`
    : `    <string>${bin}</string>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
    <string>dashboard</string>
    <string>start</string>
    <string>--no-open</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${logDir}/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/daemon.log</string>
</dict>
</plist>
`;
}

function isInstalled() {
  if (platform() !== 'macos') return false;
  return fs.existsSync(AGENT_PLIST);
}

function isLoaded() {
  if (platform() !== 'macos') return false;
  try {
    const out = execSync(`launchctl list | grep ${AGENT_LABEL}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function install() {
  const p = platform();
  if (p !== 'macos') {
    return { ok: false, reason: `Daemon install not yet supported on ${p} (planned for Phase 2.5b). \`rouge dashboard start\` still works manually.` };
  }

  const logDir = path.join(os.homedir(), '.rouge', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
  fs.writeFileSync(AGENT_PLIST, buildPlist(), { mode: 0o644 });

  // Unload first in case a stale version exists, then load.
  spawnSync('launchctl', ['unload', AGENT_PLIST], { stdio: 'ignore' });
  const loadResult = spawnSync('launchctl', ['load', AGENT_PLIST], { stdio: 'pipe', encoding: 'utf8' });
  if (loadResult.status !== 0) {
    return { ok: false, reason: `launchctl load failed: ${(loadResult.stderr || '').trim()}` };
  }

  return { ok: true, path: AGENT_PLIST };
}

function uninstall() {
  const p = platform();
  if (p !== 'macos') {
    // Nothing to uninstall on unsupported platforms; treat as success.
    return { ok: true, removed: false };
  }
  if (!fs.existsSync(AGENT_PLIST)) {
    return { ok: true, removed: false };
  }
  spawnSync('launchctl', ['unload', AGENT_PLIST], { stdio: 'ignore' });
  try {
    fs.unlinkSync(AGENT_PLIST);
  } catch (err) {
    return { ok: false, reason: `Failed to remove ${AGENT_PLIST}: ${err.message}` };
  }
  return { ok: true, removed: true };
}

function statusSummary() {
  const p = platform();
  if (p !== 'macos') {
    return { platform: p, supported: false, installed: false, loaded: false };
  }
  return {
    platform: p,
    supported: true,
    installed: isInstalled(),
    loaded: isLoaded(),
    path: AGENT_PLIST,
  };
}

module.exports = {
  AGENT_LABEL,
  AGENT_PLIST,
  platform,
  isInstalled,
  isLoaded,
  install,
  uninstall,
  statusSummary,
};
