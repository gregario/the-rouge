import { NextResponse } from "next/server";
import { startBuild } from "@/bridge/build-runner";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot, rougeCli } = loadServerConfig();
  const result = startBuild(projectsRoot, rougeCli, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, pid: result.pid });
}
