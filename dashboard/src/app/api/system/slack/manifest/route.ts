import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { rougeSrcDir } from "@/lib/launcher-bridge";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// GET /api/system/slack/manifest
// Returns the Slack app manifest YAML for copy-paste into the Slack app
// creator. Sourced from src/slack/manifest.yaml — single source of truth.
export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const manifestPath = path.join(rougeSrcDir(), "slack", "manifest.yaml");
    if (!existsSync(manifestPath)) {
      return NextResponse.json({ error: "manifest.yaml not found", path: manifestPath }, { status: 500 });
    }
    const yaml = readFileSync(manifestPath, "utf-8");
    return NextResponse.json({ yaml, path: manifestPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
