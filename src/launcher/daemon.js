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

function resolveRougeCliJs() {
  // Always invoke rouge-cli.js by absolute path using the exact node binary
  // we're running under. Launch agents run with a minimal PATH that usually
  // doesn't include Homebrew's node, so `#!/usr/bin/env node` shebangs fail.
  // Two candidates:
  //   1. Our own __dirname + rouge-cli.js (works in source and global installs
  //      — the global install's `rouge` symlink points at this same file)
  return path.resolve(__dirname, 'rouge-cli.js');
}

function buildPlist() {
  const rougeCli = resolveRougeCliJs();
  const node = process.execPath;
  const logDir = path.join(os.homedir(), '.rouge', 'logs');
  // Extend PATH so rouge-cli.js subprocesses (git, jq, claude, npm, etc.)
  // can be found. Cover Homebrew (Apple Silicon + Intel), system dirs.
  const daemonPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${rougeCli}</string>
    <string>dashboard</string>
    <string>start</string>
    <string>--no-open</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${daemonPath}</string>
    <key>HOME</key>
    <string>${os.homedir()}</string>
  </dict>
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
