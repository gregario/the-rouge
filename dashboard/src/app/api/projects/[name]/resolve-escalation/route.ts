import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { statePath } from "@/bridge/state-path";

export const dynamic = "force-dynamic";

const VALID_RESPONSE_TYPES = [
  "guidance",
  "manual-fix-applied",
  "dismiss-false-positive",
  "abort-story",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
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

  const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
  const escalation = (raw.escalations || []).find(
    (e: { id: string; status: string }) =>
      e.id === body.escalation_id && e.status === "pending",
  );
  if (!escalation) {
    return NextResponse.json(
      { error: `No pending escalation found with id "${body.escalation_id}"` },
      { status: 404 },
    );
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

  writeFileSync(stateFile, JSON.stringify(raw, null, 2));
  return NextResponse.json(raw);
}
