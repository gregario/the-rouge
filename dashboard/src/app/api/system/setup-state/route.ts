import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { sanitizedErrorResponse } from "@/lib/error-response";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";

// ~/.rouge/setup-complete is written by the wizard's "Finish" step.
// The file is JSON: { completedAt, skipped, version }. Root layout
// reads it to decide whether to auto-redirect to /setup.
function markerPath(): string {
  const home = process.env.ROUGE_HOME ?? path.join(homedir(), ".rouge");
  return path.join(home, "setup-complete");
}

interface MarkerContent {
  completedAt: string;
  skipped: boolean;
  version: number;
}

// GET /api/system/setup-state
// Returns { complete: boolean, marker?: MarkerContent }.
export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  const p = markerPath();
  if (!existsSync(p)) return NextResponse.json({ complete: false });

  try {
    const marker = JSON.parse(readFileSync(p, "utf-8")) as MarkerContent;
    return NextResponse.json({ complete: true, marker });
  } catch {
    // Malformed marker — treat as not set so user can redo setup.
    return NextResponse.json({ complete: false });
  }
}

// POST /api/system/setup-state
// Body: { skipped?: boolean } — writes the marker.
export async function POST(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const body = (await request.json().catch(() => ({}))) as { skipped?: boolean };
    const p = markerPath();
    mkdirSync(path.dirname(p), { recursive: true });
    const content: MarkerContent = {
      completedAt: new Date().toISOString(),
      skipped: !!body.skipped,
      version: 1,
    };
    writeFileSync(p, JSON.stringify(content, null, 2) + "\n", { mode: 0o644 });
    return NextResponse.json({ ok: true, marker: content });
  } catch (err) {
    return sanitizedErrorResponse(err, "system/setup-state");
  }
}

// DELETE /api/system/setup-state
// Removes the marker (re-enters first-time mode). Useful for testing and
// for a future "Redo setup" action.
export async function DELETE() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const p = markerPath();
    if (existsSync(p)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(p);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return sanitizedErrorResponse(err, "system/setup-state");
  }
}
