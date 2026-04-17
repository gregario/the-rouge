import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSeedingState } from "@/bridge/seeding-state";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

// Seeding liveness status — exposes the bits the dashboard needs to
// render the gated-autonomy traffic-light chip and know whether Rouge
// is waiting on the user or working.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const state = readSeedingState(projectDir);
  return NextResponse.json({
    mode: state.mode ?? 'running_autonomous',
    pending_gate: state.pending_gate ?? null,
    last_heartbeat_at: state.last_heartbeat_at ?? null,
    current_discipline: state.current_discipline ?? null,
    status: state.status,
  });
}
