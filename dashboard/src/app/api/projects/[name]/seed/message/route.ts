import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { handleSeedMessage } from "@/bridge/seed-handler";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const result = await handleSeedMessage(projectDir, text);
  return NextResponse.json(result, { status: result.status });
}
