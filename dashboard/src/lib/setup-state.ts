// Server-side helpers for reading the ~/.rouge/setup-complete marker
// without going through HTTP. Used by the root page for first-time redirect.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface SetupMarker {
  completedAt: string;
  skipped: boolean;
  version: number;
}

export function setupMarkerPath(): string {
  const home = process.env.ROUGE_HOME ?? path.join(homedir(), ".rouge");
  return path.join(home, "setup-complete");
}

export function isSetupComplete(): boolean {
  const p = setupMarkerPath();
  if (!existsSync(p)) return false;
  try {
    JSON.parse(readFileSync(p, "utf-8"));
    return true;
  } catch {
    return false;
  }
}
