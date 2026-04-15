// Launcher bridge — imports CommonJS modules from The Rouge's `src/launcher/`
// into Next.js route handlers.
//
// The launcher lives outside the dashboard package (sibling in the monorepo).
// ROUGE_CLI env var is set by the launcher to the absolute path of
// rouge-cli.js — we walk up from there to find the launcher dir. Falls back
// to relative paths for dev mode.

import path from "node:path";
import { existsSync, realpathSync } from "node:fs";

function resolveLauncherDir(): string {
  const envCli = process.env.ROUGE_CLI;
  if (envCli && existsSync(envCli)) {
    // ROUGE_CLI is usually /opt/homebrew/bin/rouge — a symlink into
    // lib/node_modules/the-rouge/src/launcher/rouge-cli.js. Resolve it
    // before taking the dirname, otherwise we look for doctor.js next
    // to the symlink (which lives in /opt/homebrew/bin/).
    return path.dirname(realpathSync(envCli));
  }
  // Dev fallback: this file is at dashboard/src/lib/launcher-bridge.ts,
  // launcher is at ../../src/launcher/ relative to dashboard root.
  const devPath = path.resolve(__dirname, "../../../src/launcher");
  if (existsSync(devPath)) return devPath;
  // Standalone fallback: .next/standalone/dashboard/src/lib/ → ../../../../src/launcher
  const standalonePath = path.resolve(__dirname, "../../../../src/launcher");
  if (existsSync(standalonePath)) return standalonePath;
  throw new Error(
    `launcher-bridge: can't find Rouge launcher dir. ROUGE_CLI=${envCli ?? "(unset)"}`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requireLauncher(mod: string): any {
  const dir = resolveLauncherDir();
  const full = path.join(dir, mod);
  // Next bundles route handlers; we need a plain require to hit the real
  // launcher files at runtime, not a bundled copy. Use eval('require') so
  // the bundler leaves it alone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeRequire: NodeRequire = eval("require");
  return nodeRequire(full);
}

// Returns the src/ root alongside the launcher dir — e.g. for finding
// src/slack/manifest.yaml from a route handler.
export function rougeSrcDir(): string {
  // resolveLauncherDir() returns .../src/launcher; parent is src/.
  return path.resolve(resolveLauncherDir(), "..");
}
