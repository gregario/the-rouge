import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readBuildLog, phaseLogPath } from "@/bridge/build-log-reader";
import { statePath } from "@/bridge/state-path";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

// Phase states that produce real Claude output in logs/<slug>-<state>.log.
// When current_state is one of these, we tail the phase log instead of the
// (mostly banner-only) build.log.
const PHASE_STATES = new Set([
  "foundation",
  "foundation-eval",
  "story-building",
  "milestone-check",
  "milestone-fix",
  "analyzing",
  "generating-change-spec",
  "vision-check",
  "shipping",
  "final-review",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot, rougeLogDir } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const tailParam = new URL(request.url).searchParams.get("tail");
  const tail = tailParam
    ? Math.max(1, Math.min(500, parseInt(tailParam, 10) || 50))
    : 50;

  // Peek at current_state so we can tail the right phase log when a phase
  // is actively running. Falls through cleanly to build.log on any read
  // error — this is a display-only enrichment, not a correctness path.
  let phasePath: string | null = null;
  try {
    const stateFile = statePath(projectDir);
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    const cs: string | undefined = state?.current_state;
    if (cs && PHASE_STATES.has(cs)) {
      phasePath = phaseLogPath(rougeLogDir, name, cs);
    }
  } catch {
    // ignore — no state.json yet, or malformed
  }

  return NextResponse.json(readBuildLog(projectDir, tail, phasePath));
}
