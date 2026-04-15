import { NextResponse } from "next/server";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import {
  mergeSeedingProgress,
  readCheckpointSummary,
} from "@/lib/project-details";

export const dynamic = "force-dynamic";

// States in which a slug rename is safe (pre-build). Once the Loop starts,
// git history, deploy targets, and checkpoint filenames key on the slug,
// so we refuse to rename to avoid orphaning them.
const SLUG_RENAMEABLE_STATES = new Set([
  "seeding", "ready",
]);

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

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

// PATCH /api/projects/[name]
// Body: { displayName?: string, slug?: string }
// - displayName: updates state.json name field. Always safe.
// - slug: renames the project directory on disk. Only allowed in seeding
//   or ready states (pre-build). Response includes new slug for client
//   redirect.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  const stateFile = join(projectDir, "state.json");

  if (!existsSync(stateFile)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    slug?: string;
  };

  const state = JSON.parse(readFileSync(stateFile, "utf-8"));
  const currentState = state.current_state ?? state.state ?? "unknown";

  let slugChanged: string | null = null;

  // Slug rename (filesystem mv)
  if (body.slug && body.slug !== name) {
    if (!SLUG_RENAMEABLE_STATES.has(currentState)) {
      return NextResponse.json({
        error: `Slug rename not allowed in state "${currentState}". Rename only works during seeding or ready states, before the build loop starts.`,
      }, { status: 409 });
    }
    const newSlug = slugify(body.slug);
    if (!newSlug || !/^[a-z][a-z0-9-]*$/.test(newSlug)) {
      return NextResponse.json({
        error: "Slug must start with a lowercase letter and contain only lowercase letters, digits, and hyphens.",
      }, { status: 400 });
    }
    const newDir = join(projectsRoot, newSlug);
    if (existsSync(newDir)) {
      return NextResponse.json({ error: `A project at slug "${newSlug}" already exists.` }, { status: 409 });
    }
    try {
      renameSync(projectDir, newDir);
      slugChanged = newSlug;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // Display-name update
  if (body.displayName !== undefined) {
    const trimmed = body.displayName.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "displayName must not be empty" }, { status: 400 });
    }
    // Bridge mapper resolves display name from state.project ?? state.name ??
    // slug (bridge-mapper.ts:236). Write both so the rename wins regardless
    // of which field existing seeding output already populated.
    state.name = trimmed;
    state.project = trimmed;
    const targetDir = slugChanged ? join(projectsRoot, slugChanged) : projectDir;
    writeFileSync(join(targetDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
  }

  return NextResponse.json({
    ok: true,
    slug: slugChanged ?? name,
    slugChanged: !!slugChanged,
  });
}
