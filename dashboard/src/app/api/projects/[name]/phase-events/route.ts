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
  const url = new URL(request.url);
  const tailParam = url.searchParams.get("tail");
  const tail = tailParam
    ? Math.max(1, Math.min(500, parseInt(tailParam, 10) || 100))
    : 100;
  // `story_id` filter: scopes the feed to events stamped with a
  // specific current_story at phase-start. Used by the in-story feed
  // inside the active story card so each card shows only its own
  // tool calls — project-level phases (foundation, analyzing) don't
  // leak into story cards.
  const storyId = url.searchParams.get("story_id") ?? undefined;
  return NextResponse.json(readPhaseEvents(projectDir, { tailCount: tail, storyId }));
}
