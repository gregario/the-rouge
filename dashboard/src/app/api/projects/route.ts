import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanProjects } from "@/bridge/scanner";
import { writeSeedingState } from "@/bridge/seeding-state";
import { statePathForWrite } from "@/bridge/state-path";
import { loadServerConfig } from "@/lib/server-config";
import { resolveRougeConfigPath } from "@/lib/rouge-config";

// Pull the global default cap from rouge.config.json. Falls back to 100
// if the file isn't found (matches the live default).
function readDefaultBudgetCap(): number {
  const p = resolveRougeConfigPath();
  if (!p) return 100;
  try {
    const cfg = JSON.parse(readFileSync(p, "utf-8")) as { budget_cap_usd?: number };
    if (typeof cfg.budget_cap_usd === "number") return cfg.budget_cap_usd;
  } catch { /* fall through */ }
  return 100;
}

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
    // Per-project cap copied from the global default at creation. Users
    // can override this from the project page or promote-to-build
    // confirmation.
    budget_cap_usd: readDefaultBudgetCap(),
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
    statePathForWrite(projectDir),
    JSON.stringify(initialState, null, 2),
  );
  writeSeedingState(projectDir, {
    session_id: null,
    status: "not-started",
    started_at: new Date().toISOString(),
  });

  // We used to fire `startSeedingSession` here as a fire-and-forget so
  // Rouge would greet the user before they typed anything. That raced
  // with the inline title editor: the orchestrator's `claude -p` takes
  // 15–30s, during which the auto-slug rename (#137) moves the project
  // directory out from under it and the background call dies with
  // ENOENT on the stale path — no orchestrator context ever reaches
  // Claude and the first real message gets a generic response.
  //
  // The init now runs inside `handleSeedMessage` on the first user
  // message instead, so any rename has already happened by the time we
  // resolve the prompt path.
  return NextResponse.json({ ok: true, slug });
}
