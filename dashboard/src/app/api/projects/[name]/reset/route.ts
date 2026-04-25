import { NextResponse } from "next/server";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { statePath, writeStateJson } from "@/bridge/state-path";
import { withStateLock } from "@/bridge/state-lock";
import { readBuildInfo } from "@/bridge/build-runner";
import { guardMutation } from "@/lib/route-guards";

export const dynamic = "force-dynamic";

// States Reset refuses to touch — nothing useful would come of flipping
// these to Ready, and doing so would hide real work from the user.
const UNSAFE_FOR_RESET = new Set(["complete", "seeding"]);

/**
 * POST /api/projects/[name]/reset
 *
 * Forces state.current_state back to "ready" when the project is stuck
 * mid-phase with no live rouge-loop subprocess. Existing commits,
 * milestones, and cycle_context are preserved on disk — a subsequent
 * Start runs foundation again, which detects the already-in-place work
 * and moves forward quickly.
 *
 * Refuses when a build PID is alive: the user should Stop cleanly
 * first. The old path was "Stop button that did nothing for
 * foundation-eval / analyzing / vision-check etc. because the internal
 * rollback allowlist only covered foundation + story-building" — see
 * build-runner.ts rollbackZombieBuildState.
 */
export async function POST(
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

  const info = readBuildInfo(projectDir);
  if (info) {
    return NextResponse.json(
      {
        error:
          "Build subprocess is still running — stop it before resetting.",
      },
      { status: 409 },
    );
  }

  // Clean up a stale .build-pid if readBuildInfo already hasn't. It
  // normally does, but defensive — a second-old stale file on the way
  // out of a crashed loop wouldn't surprise anyone.
  const pidPath = join(projectDir, ".build-pid");
  if (existsSync(pidPath)) {
    try { unlinkSync(pidPath); } catch { /* best effort */ }
  }

  let priorState: string | null = null;
  await withStateLock(projectDir, async () => {
    try {
      const state = JSON.parse(readFileSync(stateFile, "utf-8"));
      priorState = state.current_state ?? null;
      if (UNSAFE_FOR_RESET.has(state.current_state)) return;
      state.current_state = "ready";
      await writeStateJson(projectDir, state);
    } catch {
      // malformed state.json — leave it for the user to inspect
    }
  });

  if (priorState && UNSAFE_FOR_RESET.has(priorState)) {
    return NextResponse.json(
      { error: `Reset refuses to touch state="${priorState}"` },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, priorState });
}
