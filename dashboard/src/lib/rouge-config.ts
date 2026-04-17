// Locate `rouge.config.json` (the launcher's safety/budget config).
//
// History: route handlers were each doing their own `path.resolve(__dirname,
// "../../../../../../rouge.config.json")` walk. Under Turbopack (Next 16
// dev), `__dirname` resolves to a compiled-bundle path under `.next/` and
// the relative climb lands somewhere meaningless. The handlers fell back to
// `cwd + rouge.config.json`, which works only when the dashboard is run
// from the repo root.
//
// This helper centralises resolution and replaces the unreliable
// __dirname climb with two reliable signals:
//   1. ROUGE_CONFIG / ROUGE_CLI env vars (set by the launcher)
//   2. Walk up from `process.cwd()` looking for `rouge.config.json` next
//      to a `.git` directory — that's the repo root by definition

import { existsSync } from "node:fs";
import path from "node:path";

const CONFIG_FILE = "rouge.config.json";

export function resolveRougeConfigPath(): string | null {
  if (process.env.ROUGE_CONFIG) {
    return existsSync(process.env.ROUGE_CONFIG) ? process.env.ROUGE_CONFIG : null;
  }

  // ROUGE_CLI typically points at `<repo>/src/launcher/rouge-cli.js` —
  // climb up to find the sibling rouge.config.json.
  if (process.env.ROUGE_CLI) {
    const fromCli = path.resolve(path.dirname(process.env.ROUGE_CLI), "..", "..", CONFIG_FILE);
    if (existsSync(fromCli)) return fromCli;
  }

  // Walk up from cwd. Stops at the filesystem root. We accept the first
  // rouge.config.json we find — repo roots almost always sit at or above
  // cwd in the dashboard's process tree (npm run dev / start runs from
  // dashboard/ or the repo root).
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
