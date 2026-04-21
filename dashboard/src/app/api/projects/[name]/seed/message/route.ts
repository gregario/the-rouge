import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { handleSeedMessageRouted } from "@/bridge/seed-handler";
import { loadServerConfig } from "@/lib/server-config";
import { guardMutation } from "@/lib/route-guards";

export const dynamic = "force-dynamic";

// Seed message bodies are small — a few KB of text at most. Cap at 64 KB
// to match feedback; anything larger is almost certainly abuse.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Payload too large (max ${MAX_BODY_BYTES} bytes)` },
      { status: 413 },
    );
  }
  let body: { text?: string };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  // Routed variant: delegates to the detached daemon when
  // ROUGE_USE_SEED_DAEMON=1, else runs the existing inline path.
  // See docs/plans/2026-04-19-seed-loop-architecture.md Phase 1.
  const result = await handleSeedMessageRouted(projectDir, text);
  return NextResponse.json(result, { status: result.status });
}
