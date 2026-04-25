import { NextResponse } from "next/server";
import { existsSync, readFileSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { statePath, writeStateJson } from "@/bridge/state-path";
import { withStateLock } from "@/bridge/state-lock";
import { readBuildInfo } from "@/bridge/build-runner";
import { safeReadJson } from "@/lib/safe-read-json";
import { guardMutation } from "@/lib/route-guards";
import { sanitizedErrorResponse } from "@/lib/error-response";
import { isPlaceholderSlug, slugify, uniqueSlug } from "@/bridge/slug";
import {
  mergeSeedingProgress,
  mergeMilestonesFromLedger,
  readCheckpointSummary,
  readDeployUrls,
  readProviders,
} from "@/lib/project-details";
import { repairProjectState } from "@/bridge/state-repair";

export const dynamic = "force-dynamic";

// States in which a slug rename is safe (pre-build). Once the Loop starts,
// git history, deploy targets, and checkpoint filenames key on the slug,
// so we refuse to rename to avoid orphaning them.
const SLUG_RENAMEABLE_STATES = new Set([
  "seeding", "ready",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  const stateFile = statePath(projectDir);

  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Run state-repair before reading, same pattern the scanner uses on
  // the home page. Without this, opening a project detail directly
  // (bypassing the home page) could render against a zombie state —
  // the user's "three boxes" / "stuck at escalation with no drawer"
  // bug was a consequence of this path being unrepaired.
  try {
    const report = await repairProjectState(projectDir);
    if (report.fixes.length > 0) {
      console.log(`[state-repair] ${name} (detail): ${report.fixes.join('; ')}`);
    }
  } catch (err) {
    console.warn(`[state-repair] ${name} (detail) threw:`, err instanceof Error ? err.message : err);
  }

  const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
  // Pull milestones from task_ledger.json when state.json.milestones is
  // empty — the Build tab's story timeline renders from this field.
  // V3 projects that completed spec decomposition but not the
  // approval-handshake step end up with state.milestones=[] while
  // task_ledger.json holds the full decomposition.
  const withMilestones = mergeMilestonesFromLedger(projectDir, raw);
  const merged = mergeSeedingProgress(projectDir, withMilestones);
  const checkpoint = readCheckpointSummary(projectDir);
  const deploy = readDeployUrls(projectDir);
  // Read build PID info so the client doesn't need a second
  // round-trip to /build-status just to render the Stop button or
  // the "Build started" banner. `readBuildInfo` cleans up stale PIDs
  // itself; `null` means nothing is running. See audit E9.
  const build = readBuildInfo(projectDir);

  // Gated-autonomy signals from seeding-state so the detail page can
  // surface a "Rouge is waiting on X" indicator without needing a
  // second fetch. Matches the shape the scanner already exposes for
  // project cards.
  const seeding = safeReadJson<{
    mode?: string;
    pending_gate?: { discipline?: string };
    last_heartbeat_at?: string;
  } | null>(join(projectDir, "seeding-state.json"), null, {
    context: `detail:gated-autonomy:${name}`,
  });

  // Derive real providers from cycle_context.infrastructure so the
  // header's stack area, the "Live on X" badge on complete projects,
  // and the project-card icons all reflect reality. Previously the
  // mapper hardcoded providers: [] which meant none of those ever
  // rendered — dead UI on every project.
  const providers = readProviders(projectDir);

  return NextResponse.json({
    slug: name,
    ...merged,
    providers,
    costUsd: checkpoint.costUsd,
    lastCheckpointAt: checkpoint.lastCheckpointAt,
    lastPhase: checkpoint.lastPhase,
    checkpointCount: checkpoint.checkpointCount,
    stagingUrl: deploy.stagingUrl,
    productionUrl: deploy.productionUrl,
    buildRunning: !!build,
    buildPid: build?.pid,
    buildStartedAt: build?.startedAt,
    awaitingGate: seeding?.mode === "awaiting_gate",
    pendingGateDiscipline: seeding?.pending_gate?.discipline,
    lastHeartbeatAt: seeding?.last_heartbeat_at,
  });
}

// PATCH /api/projects/[name]
// Body: { displayName?: string, slug?: string }
// - displayName: updates state.json name field. Always safe.
// - slug: renames the project directory on disk. Only allowed in seeding
//   or ready states (pre-build). Response includes new slug for client
//   redirect.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  const stateFile = statePath(projectDir);

  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    slug?: string;
    archived?: boolean;
    budgetCap?: number;
  };

  // Read, validate, and mutate inside a critical section so two
  // concurrent PATCHes (e.g. rapid display-name + archive toggles) don't
  // race on state.json. The filesystem rename below happens inside the
  // lock window too — once we commit to the new slug the original path
  // no longer exists, and we write against the post-rename directory.
  const patchResult = await withStateLock(projectDir, async () => {
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    const currentState = state.current_state ?? state.state ?? "unknown";

    let slugChanged: string | null = null;

    if (
      body.displayName !== undefined &&
      body.slug === undefined &&
      isPlaceholderSlug(name) &&
      SLUG_RENAMEABLE_STATES.has(currentState)
    ) {
      const derived = slugify(body.displayName);
      if (derived && /^[a-z][a-z0-9-]*$/.test(derived)) {
        const unique = uniqueSlug(derived, projectsRoot, name);
        if (unique && unique !== name) {
          body.slug = unique;
        }
      }
    }

    if (body.slug && body.slug !== name) {
      if (!SLUG_RENAMEABLE_STATES.has(currentState)) {
        return {
          status: 409 as const,
          error: `Slug rename not allowed in state "${currentState}". Rename only works during seeding or ready states, before the build loop starts.`,
        };
      }
      const newSlug = slugify(body.slug);
      if (!newSlug || !/^[a-z][a-z0-9-]*$/.test(newSlug)) {
        return {
          status: 400 as const,
          error: "Slug must start with a lowercase letter and contain only lowercase letters, digits, and hyphens.",
        };
      }
      const newDir = join(projectsRoot, newSlug);
      if (existsSync(newDir)) {
        return { status: 409 as const, error: `A project at slug "${newSlug}" already exists.` };
      }
      try {
        renameSync(projectDir, newDir);
        slugChanged = newSlug;
        // The lockfile we're holding lived at `projectDir/.rouge/state.lock`
        // and got moved to `newDir/.rouge/state.lock` by the rename above.
        // `release()` on the original path will silently no-op (file is
        // gone); the stray lockfile at the new path would otherwise
        // survive ~30s before stale-eviction. Clear it here so a follow-up
        // PATCH against the new slug isn't blocked by our own leftover.
        try {
          unlinkSync(join(newDir, ".rouge", "state.lock"));
        } catch {
          /* best-effort */
        }
      } catch (err) {
        console.error(`[projects/${name} PATCH rename] ${err instanceof Error ? err.stack : err}`);
        return { status: 500 as const, error: "Failed to rename project directory. Check dashboard logs for details." };
      }
    }

    if (body.archived !== undefined) {
      if (body.archived === true && (currentState === 'foundation' || currentState === 'foundation-eval' ||
          currentState === 'story-building' || currentState === 'milestone-check' ||
          currentState === 'milestone-fix')) {
        return {
          status: 409 as const,
          error: `Stop the build before archiving (current state: ${currentState}).`,
        };
      }
      state.archived = body.archived;
      state.archivedAt = body.archived ? new Date().toISOString() : undefined;
    }

    if (body.displayName !== undefined) {
      const trimmed = body.displayName.trim();
      if (trimmed.length === 0) {
        return { status: 400 as const, error: "displayName must not be empty" };
      }
      state.name = trimmed;
      state.project = trimmed;
    }

    if (body.budgetCap !== undefined) {
      const n = Number(body.budgetCap);
      if (!Number.isFinite(n) || n < 0) {
        return { status: 400 as const, error: "budgetCap must be a non-negative number" };
      }
      state.budget_cap_usd = n;
      delete state._cost_alert_80;
      delete state._cost_alert_50;
    }

    if (body.displayName !== undefined || body.archived !== undefined || body.budgetCap !== undefined) {
      const targetDir = slugChanged ? join(projectsRoot, slugChanged) : projectDir;
      await writeStateJson(targetDir, state);
    }

    return { status: 200 as const, slugChanged };
  });

  if (patchResult.status !== 200) {
    return NextResponse.json({ error: patchResult.error }, { status: patchResult.status });
  }

  return NextResponse.json({
    ok: true,
    slug: patchResult.slugChanged ?? name,
    slugChanged: !!patchResult.slugChanged,
  });
}

// DELETE /api/projects/[name]
// Hard-deletes the project directory. Scoped to pre-build states
// (seeding / ready) — anything past that has git history, checkpoints,
// and deploys attached and should be archived rather than deleted.
// The client is responsible for confirming when messageCount > 0.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  const stateFile = statePath(projectDir);

  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let currentState = "unknown";
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    currentState = state.current_state ?? state.state ?? "unknown";
  } catch {
    // Malformed state.json — still let the user clean up.
  }

  const preBuildStates = new Set(["seeding", "ready"]);
  if (!preBuildStates.has(currentState)) {
    return NextResponse.json({
      error: `Cannot delete a project in state "${currentState}". Archive it instead — only pre-build specs can be hard-deleted.`,
    }, { status: 409 });
  }

  try {
    rmSync(projectDir, { recursive: true, force: true });
  } catch (err) {
    return sanitizedErrorResponse(err, `projects/${name} DELETE`);
  }

  return NextResponse.json({ ok: true });
}
