import { NextResponse } from "next/server";
import { startBuild } from "@/bridge/build-runner";
import { loadServerConfig } from "@/lib/server-config";
import { guardMutation } from "@/lib/route-guards";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  const { projectsRoot, rougeCli } = loadServerConfig();
  const result = await startBuild(projectsRoot, rougeCli, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, pid: result.pid });
}
