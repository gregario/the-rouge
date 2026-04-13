import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readProjectActivity } from "@/bridge/activity-reader";
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
  const verbose =
    new URL(request.url).searchParams.get("verbose") === "true";
  return NextResponse.json(readProjectActivity(projectDir, { verbose }));
}
