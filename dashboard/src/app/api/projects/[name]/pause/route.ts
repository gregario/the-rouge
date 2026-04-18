import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { statePath, writeStateJson } from "@/bridge/state-path";
import { withStateLock } from "@/bridge/state-lock";
import { guardMutation } from "@/lib/route-guards";

export const dynamic = "force-dynamic";

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
  await withStateLock(projectDir, () => {
    const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
    raw.current_state = "waiting-for-human";
    writeStateJson(projectDir, raw);
  });
  return NextResponse.json({ ok: true });
}
