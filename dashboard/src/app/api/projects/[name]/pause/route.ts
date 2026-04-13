import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const stateFile = join(projectsRoot, name, "state.json");
  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
  raw.current_state = "waiting-for-human";
  writeFileSync(stateFile, JSON.stringify(raw, null, 2));
  return NextResponse.json({ ok: true });
}
