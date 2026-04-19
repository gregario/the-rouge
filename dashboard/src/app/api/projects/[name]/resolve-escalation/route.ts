import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { statePath, writeStateJson } from "@/bridge/state-path";
import { withStateLock } from "@/bridge/state-lock";
import { readBuildInfo, startBuild } from "@/bridge/build-runner";
import { guardMutation } from "@/lib/route-guards";

export const dynamic = "force-dynamic";

const VALID_RESPONSE_TYPES = [
  "guidance",
  "manual-fix-applied",
  "dismiss-false-positive",
  "abort-story",
  // Hand-off to direct Claude Code session. User runs
  // `rouge resume-escalation <slug>` and works in their terminal.
  // Launcher parks the project until `resume-after-handoff` arrives.
  "hand-off",
  // User finished the hand-off session. Launcher captures git
  // commits since the hand-off started and resumes the phase.
  "resume-after-handoff",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  const { projectsRoot, rougeCli } = loadServerConfig();
  const stateFile = statePath(join(projectsRoot, name));
  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    escalation_id?: string;
    response_type?: string;
    text?: string;
  };

  if (!body?.escalation_id || !body?.response_type) {
    return NextResponse.json(
      { error: "escalation_id and response_type are required" },
      { status: 400 },
    );
  }
  if (!VALID_RESPONSE_TYPES.includes(body.response_type as (typeof VALID_RESPONSE_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid response_type. Must be one of: ${VALID_RESPONSE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const projectDir = join(projectsRoot, name);
  const result = await withStateLock(projectDir, () => {
    const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
    const escalation = (raw.escalations || []).find(
      (e: { id: string; status: string }) =>
        e.id === body.escalation_id && e.status === "pending",
    );
    if (!escalation) {
      return { notFound: true, raw: null };
    }

    escalation.human_response = {
      type: body.response_type,
      text: body.text || "",
      submitted_at: new Date().toISOString(),
    };
    raw.consecutive_failures = 0;
    if (raw.paused_from_state) {
      raw.current_state = raw.paused_from_state;
      delete raw.paused_from_state;
    }

    writeStateJson(projectDir, raw);
    return { notFound: false, raw };
  });

  if (result.notFound) {
    return NextResponse.json(
      { error: `No pending escalation found with id "${body.escalation_id}"` },
      { status: 404 },
    );
  }

  // Writing human_response is inert unless rouge-loop is alive to read
  // it on the next tick. If the loop is dead (user stopped the build,
  // process crashed, dashboard opened fresh), the resolution sits in
  // state.json forever. Auto-spawn so the user's action always leads
  // to progress. startBuild is idempotent — if the loop is already
  // running, it returns { alreadyRunning: true } without re-spawning.
  let loopStarted = false;
  if (!readBuildInfo(projectDir)) {
    try {
      const spawn = await startBuild(projectsRoot, rougeCli, name);
      loopStarted = spawn.ok && !("alreadyRunning" in spawn && spawn.alreadyRunning);
    } catch {
      // Non-fatal — the resolution is persisted. Surface a hint so the
      // user knows to click Start/Resume if needed.
    }
  }

  return NextResponse.json({ ...result.raw, loopStarted });
}
