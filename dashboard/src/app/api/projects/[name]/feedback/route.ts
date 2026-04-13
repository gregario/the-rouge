import { NextResponse } from "next/server";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const { projectsRoot } = loadServerConfig();
  const body = await request.json().catch(() => ({}));
  const feedbackFile = join(projectsRoot, name, "feedback.json");
  writeFileSync(feedbackFile, JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true });
}
