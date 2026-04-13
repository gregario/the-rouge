import { NextResponse } from "next/server";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanProjects } from "@/bridge/scanner";
import { writeSeedingState } from "@/bridge/seeding-state";
import { startSeedingSession } from "@/bridge/seed-handler";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { projectsRoot } = loadServerConfig();
  return NextResponse.json(scanProjects(projectsRoot));
}

export async function POST(request: Request) {
  const { projectsRoot } = loadServerConfig();
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    name?: string;
  };
  const slug = (body?.slug ?? "").trim();
  const name = (body?.name ?? "").trim() || slug;

  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return NextResponse.json(
      { error: "Invalid slug — use lowercase letters, numbers, and hyphens only" },
      { status: 400 },
    );
  }

  const projectDir = join(projectsRoot, slug);
  if (existsSync(projectDir)) {
    return NextResponse.json(
      { error: `Project "${slug}" already exists` },
      { status: 409 },
    );
  }

  mkdirSync(projectDir, { recursive: true });
  const initialState = {
    project: slug,
    name,
    current_state: "seeding",
    milestones: [],
    escalations: [],
    seedingProgress: {
      disciplines: [
        { discipline: "brainstorming", status: "pending" },
        { discipline: "competition", status: "pending" },
        { discipline: "taste", status: "pending" },
        { discipline: "spec", status: "pending" },
        { discipline: "infrastructure", status: "pending" },
        { discipline: "design", status: "pending" },
        { discipline: "legal-privacy", status: "pending" },
        { discipline: "marketing", status: "pending" },
      ],
      completedCount: 0,
      totalCount: 8,
    },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    join(projectDir, "state.json"),
    JSON.stringify(initialState, null, 2),
  );
  writeSeedingState(projectDir, {
    session_id: null,
    status: "not-started",
    started_at: new Date().toISOString(),
  });

  startSeedingSession(projectDir, name).catch((err) => {
    console.error(`[seeding] Initial call failed for ${slug}:`, err);
  });

  return NextResponse.json({ ok: true, slug });
}
