import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import {
  mergeSeedingProgress,
  readCheckpointSummary,
} from "@/lib/project-details";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  const stateFile = join(projectDir, "state.json");

  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const raw = JSON.parse(readFileSync(stateFile, "utf-8"));
  const merged = mergeSeedingProgress(projectDir, raw);
  const checkpoint = readCheckpointSummary(projectDir);

  return NextResponse.json({
    slug: name,
    ...merged,
    costUsd: checkpoint.costUsd,
    lastCheckpointAt: checkpoint.lastCheckpointAt,
    lastPhase: checkpoint.lastPhase,
    checkpointCount: checkpoint.checkpointCount,
  });
}
