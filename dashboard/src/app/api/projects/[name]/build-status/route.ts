import { NextResponse } from "next/server";
import { join } from "node:path";
import { readBuildInfo } from "@/bridge/build-runner";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const info = readBuildInfo(join(projectsRoot, name));
  return NextResponse.json({
    running: !!info,
    pid: info?.pid,
    startedAt: info?.startedAt,
  });
}
