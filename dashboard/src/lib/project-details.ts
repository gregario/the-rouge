// Helpers lifted from bridge/server.ts. Keep them as pure functions so
// the project-detail route handler stays thin and so tests can cover
// them independent of the HTTP layer.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DISCIPLINE_SEQUENCE } from "@/bridge/types";
import { readSeedingState } from "@/bridge/seeding-state";

/**
 * Merge milestones from `task_ledger.json` into the raw state when
 * `state.json.milestones` is empty or missing.
 *
 * Background: V3 architecture uses `task_ledger.json` as the canonical
 * task-tracking ledger (per README + CLAUDE.md). `state.json.milestones`
 * is a legacy field that the orchestrator is supposed to populate on
 * seeding approval — but during a seeding crash or an interrupted
 * approval step, state.json can end up in states like "foundation"
 * with an empty milestones array while task_ledger.json holds the
 * full 7-milestone, 33-story decomposition. The dashboard UI's Build
 * tab renders nothing when `state.milestones` is empty, so this
 * fallback keeps the tab functional for V3 projects that completed
 * spec decomposition but never made it through the approval
 * handshake cleanly.
 *
 * Idempotent — a no-op when state.milestones is already populated.
 */
export function mergeMilestonesFromLedger(
  projectDir: string,
  rawState: Record<string, unknown>,
): Record<string, unknown> {
  const existing = rawState.milestones
  if (Array.isArray(existing) && existing.length > 0) return rawState

  const ledgerPath = join(projectDir, "task_ledger.json")
  if (!existsSync(ledgerPath)) return rawState

  try {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8")) as {
      milestones?: unknown[]
    }
    if (!Array.isArray(ledger.milestones) || ledger.milestones.length === 0) {
      return rawState
    }
    return { ...rawState, milestones: ledger.milestones }
  } catch {
    // Malformed ledger — leave state as-is rather than crashing the
    // dashboard; UI will render empty milestones which surfaces the
    // symptom without breaking other tabs.
    return rawState
  }
}

export function mergeSeedingProgress(
  projectDir: string,
  rawState: Record<string, unknown>,
): Record<string, unknown> {
  if (rawState.seedingProgress) return rawState;

  const seedState = readSeedingState(projectDir);
  if (seedState.status === "not-started" && !seedState.disciplines_complete) {
    return rawState;
  }

  const complete = new Set(seedState.disciplines_complete ?? []);
  const disciplines = DISCIPLINE_SEQUENCE.map((d) => ({
    discipline: d,
    status: complete.has(d) ? "complete" : "pending",
  }));
  return {
    ...rawState,
    seedingProgress: {
      disciplines,
      completedCount: complete.size,
      totalCount: DISCIPLINE_SEQUENCE.length,
      currentDiscipline: seedState.current_discipline,
    },
  };
}

/**
 * Resolve the project's staging and production URLs from the two
 * sources Rouge writes them to:
 *   - `cycle_context.json.infrastructure.deploy_history[-1].url` —
 *     per-cycle deploy endpoints appended by deploy-to-staging.js
 *   - `infrastructure_manifest.json.staging_url` /
 *     `infrastructure_manifest.json.production_url` — declared
 *     targets from the infrastructure seeding discipline
 *
 * Preference order: cycle_context's latest successful deploy wins
 * (it's the freshest truth about where the build is actually
 * reachable). Falls back to the manifest for projects that haven't
 * deployed yet.
 */
export function readDeployUrls(projectDir: string): {
  stagingUrl?: string
  productionUrl?: string
} {
  let stagingUrl: string | undefined
  let productionUrl: string | undefined

  try {
    const ctxPath = join(projectDir, 'cycle_context.json')
    if (existsSync(ctxPath)) {
      const ctx = JSON.parse(readFileSync(ctxPath, 'utf-8')) as {
        infrastructure?: {
          staging_url?: string
          production_url?: string
          deploy_history?: Array<{ url?: string; timestamp?: string }>
        }
      }
      stagingUrl = ctx.infrastructure?.staging_url
      productionUrl = ctx.infrastructure?.production_url
      if (!stagingUrl && ctx.infrastructure?.deploy_history?.length) {
        const latest = ctx.infrastructure.deploy_history[
          ctx.infrastructure.deploy_history.length - 1
        ]
        stagingUrl = latest?.url
      }
    }
  } catch {
    // malformed — fall through to manifest
  }

  if (!stagingUrl || !productionUrl) {
    try {
      const manifestPath = join(projectDir, 'infrastructure_manifest.json')
      if (existsSync(manifestPath)) {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
          staging_url?: string
          production_url?: string
        }
        if (!stagingUrl) stagingUrl = m.staging_url
        if (!productionUrl) productionUrl = m.production_url
      }
    } catch {
      // ignore
    }
  }

  return { stagingUrl, productionUrl }
}

/**
 * Derive the list of providers this project actually uses from
 * cycle_context.infrastructure. Mirrors the scanner's logic (same
 * file at dashboard/src/bridge/scanner.ts) so the detail API and the
 * home-page card agree on which badges to show. Previously the
 * detail mapper hardcoded `providers: []` which meant the "Live on
 * Cloudflare" badge and stack icons never appeared even for projects
 * deployed to real infrastructure.
 */
export function readProviders(projectDir: string): string[] {
  const providers: string[] = []
  try {
    const ctxPath = join(projectDir, 'cycle_context.json')
    if (!existsSync(ctxPath)) return providers
    const ctx = JSON.parse(readFileSync(ctxPath, 'utf-8')) as {
      vision?: { infrastructure?: { deployment_target?: string } }
      infrastructure?: {
        staging_url?: string
        production_url?: string
        supabase_url?: string
        supabase_ref?: string
        sentry_dsn?: string
        readiness?: { posthog?: boolean }
      }
    }
    const infra = ctx.infrastructure ?? {}
    const urls = [infra.staging_url, infra.production_url]
      .filter(Boolean)
      .join(' ')
    if (urls.includes('.vercel.app')) providers.push('vercel')
    if (urls.includes('.pages.dev') || urls.includes('.workers.dev')) providers.push('cloudflare')
    // GitHub Pages doesn't go through a Rouge-provisioned cloud account,
    // so there's no env var or DSN to detect. Use two signals: the
    // deployment target declared in vision, or a *.github.io staging/prod
    // URL. Either tells us the project is Pages-deployed.
    const target = ctx.vision?.infrastructure?.deployment_target
    if (target === 'github-pages' || target === 'gh-pages' || urls.includes('.github.io')) {
      providers.push('github-pages')
    }
    if (infra.supabase_url && infra.supabase_ref) providers.push('supabase')
    if (infra.sentry_dsn) providers.push('sentry')
    if (infra.readiness?.posthog === true) providers.push('posthog')
  } catch {
    // malformed cycle_context — silent empty list
  }
  return providers
}

export interface CheckpointSummary {
  costUsd: number | null;
  lastCheckpointAt: string | null;
  lastPhase: string | null;
  checkpointCount: number;
}

export function readCheckpointSummary(projectDir: string): CheckpointSummary {
  const empty: CheckpointSummary = {
    costUsd: null,
    lastCheckpointAt: null,
    lastPhase: null,
    checkpointCount: 0,
  };
  const path = join(projectDir, "checkpoints.jsonl");
  if (!existsSync(path)) return empty;
  try {
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return empty;
    const lines = raw.split("\n").filter(Boolean);
    let costUsd: number | null = null;
    let lastCheckpointAt: string | null = null;
    let lastPhase: string | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const cp = JSON.parse(lines[i]);
        if (lastCheckpointAt === null && typeof cp?.timestamp === "string") {
          lastCheckpointAt = cp.timestamp;
          if (typeof cp?.phase === "string") lastPhase = cp.phase;
        }
        if (
          costUsd === null &&
          typeof cp?.costs?.cumulative_cost_usd === "number"
        ) {
          costUsd = cp.costs.cumulative_cost_usd;
        }
        if (costUsd !== null && lastCheckpointAt !== null) break;
      } catch {
        continue;
      }
    }
    return { costUsd, lastCheckpointAt, lastPhase, checkpointCount: lines.length };
  } catch {
    return empty;
  }
}
