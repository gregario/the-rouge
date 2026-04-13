// Server-side config for Next route handlers.
//
// Resolves the projects root and rouge CLI path from one of:
//   1. ROUGE_PROJECTS_DIR / ROUGE_CLI env vars (set by the launcher)
//   2. <repo-root>/rouge-dashboard.config.json (legacy, dev convenience)
//   3. Sensible defaults under the user's home dir
//
// The legacy bridge had its own config loader that hard-required the JSON
// file and would crash if it was missing. That works for the original
// "spawn the bridge inside the repo" model but breaks the moment the
// dashboard ships standalone in an npm tarball without that file. Env vars
// always win so the launcher can plumb explicit paths in.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface ServerConfig {
  projectsRoot: string;
  rougeCli: string;
}

// No caching — env vars can change between test runs, and resolving once
// per request is cheap (a couple of fs.existsSync + maybe one JSON.parse).
export function loadServerConfig(): ServerConfig {
  const envProjects = process.env.ROUGE_PROJECTS_DIR;
  const envCli = process.env.ROUGE_CLI;

  let fileCfg: { projects_root?: string; rouge_cli?: string } = {};
  // Look in cwd first (dev), then in the repo root relative to this file
  // (works when the standalone server.js is run from .next/standalone/).
  const candidates = [
    path.join(process.cwd(), "rouge-dashboard.config.json"),
    path.resolve(__dirname, "../../../rouge-dashboard.config.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        fileCfg = JSON.parse(readFileSync(candidate, "utf-8"));
        break;
      } catch {
        // ignore parse error; fall through to defaults
      }
    }
  }

  const home = homedir();
  return {
    projectsRoot:
      envProjects ||
      fileCfg.projects_root ||
      path.join(home, ".rouge", "projects"),
    rougeCli:
      envCli ||
      fileCfg.rouge_cli ||
      path.join(home, ".rouge", "bin", "rouge"),
  };
}
