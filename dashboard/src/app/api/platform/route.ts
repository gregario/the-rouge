import { NextResponse } from "next/server";
import { readPlatformData } from "@/bridge/platform-reader";
import { loadServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { projectsRoot } = loadServerConfig();
  return NextResponse.json(readPlatformData(projectsRoot));
}
