import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readPhaseEvents } from "@/bridge/phase-events-reader";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const tailParam = new URL(request.url).searchParams.get("tail");
  const tail = tailParam
    ? Math.max(1, Math.min(500, parseInt(tailParam, 10) || 100))
    : 100;
  return NextResponse.json(readPhaseEvents(projectDir, tail));
}
