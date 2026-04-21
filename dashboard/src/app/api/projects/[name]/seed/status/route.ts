import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSeedingState } from "@/bridge/seeding-state";
import { readSeedPid } from "@/bridge/seed-daemon-pid";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

// Daemon heartbeat file written by seed-daemon.ts on every tick. Small,
// fast to read. Surfacing it here means the client can render a
// "Rouge working — last tick Xs ago" indicator from a single endpoint.
const HEARTBEAT_FILENAME = 'seed-heartbeat.json';

interface DaemonStatus {
  /** True if .seed-pid exists and the tracked PID is alive. */
  alive: boolean;
  /** Whether the daemon reports it's actively processing a message
   *  (vs. idling between turns). From the heartbeat file. */
  activity: 'processing' | 'idle' | null;
  /** ISO timestamp of the daemon's last tick, or null if no heartbeat
   *  file exists yet. */
  lastTickAt: string | null;
  /** Current turn id the daemon is processing, if any. */
  lastTurnId: string | null;
}

function readDaemonStatus(projectDir: string): DaemonStatus {
  const pid = readSeedPid(projectDir);
  const alive = pid !== null;
  let activity: DaemonStatus['activity'] = null;
  let lastTickAt: string | null = null;
  let lastTurnId: string | null = null;
  try {
    const hbPath = join(projectDir, '.rouge', HEARTBEAT_FILENAME);
    if (existsSync(hbPath)) {
      const hb = JSON.parse(readFileSync(hbPath, 'utf-8')) as {
        status?: string;
        lastTickAt?: string;
        lastTurnId?: string | null;
      };
      activity = hb.status === 'processing' ? 'processing' : 'idle';
      lastTickAt = typeof hb.lastTickAt === 'string' ? hb.lastTickAt : null;
      lastTurnId = typeof hb.lastTurnId === 'string' ? hb.lastTurnId : null;
    }
  } catch {
    // Malformed heartbeat — treat as no signal rather than failing.
  }
  return { alive, activity, lastTickAt, lastTurnId };
}

// Seeding liveness status — exposes the bits the dashboard needs to
// render the gated-autonomy traffic-light chip and know whether Rouge
// is waiting on the user or working. Phase 2 of the seed-loop plan
// also surfaces daemon liveness here so the UI can show a "working /
// idle / stalled" indicator without a separate fetch.
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
  const daemon = readDaemonStatus(projectDir);
  return NextResponse.json({
    mode: state.mode ?? 'running_autonomous',
    pending_gate: state.pending_gate ?? null,
    last_heartbeat_at: state.last_heartbeat_at ?? null,
    current_discipline: state.current_discipline ?? null,
    status: state.status,
    daemon,
  });
}
