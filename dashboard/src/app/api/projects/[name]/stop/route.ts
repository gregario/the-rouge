import { NextResponse } from "next/server";
import { stopBuild } from "@/bridge/build-runner";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const result = await stopBuild(projectsRoot, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true, killed: result.killed });
}
