import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readStoryEnrichment } from "@/bridge/story-enrichment-reader";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(readStoryEnrichment(projectDir));
}
