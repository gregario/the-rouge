import { NextResponse } from "next/server";
import { stopBuild } from "@/bridge/build-runner";
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

  const { projectsRoot } = loadServerConfig();
  const result = await stopBuild(projectsRoot, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  // Discriminate on alreadyStopped so the `killed` / `stateRolledBack`
  // narrowing works without an unsound cast.
  if ('alreadyStopped' in result) {
    return NextResponse.json({
      ok: true,
      alreadyStopped: true,
      stateRolledBack: result.stateRolledBack ?? false,
    });
  }
  return NextResponse.json({ ok: true, killed: result.killed });
}
