import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { statePath, writeStateJson } from "@/bridge/state-path";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const stateFile = statePath(join(projectsRoot, name));
  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
  raw.current_state = "waiting-for-human";
  writeStateJson(join(projectsRoot, name), raw);
  return NextResponse.json({ ok: true });
}
