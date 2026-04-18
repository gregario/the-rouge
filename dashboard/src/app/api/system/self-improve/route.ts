import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { assertLoopback } from "@/lib/localhost-guard";
import { sanitizedErrorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

// The launcher's F17 wiring drops self-improvement proposals as gh
// issues with the `self-improvement` label. This endpoint surfaces
// them in the dashboard so users can see Rouge's proposed changes to
// itself — a visible counter + the five most recent issues with
// titles + URLs.
//
// Cached in-process for 60s so rapid page refreshes don't pound the
// gh CLI. A zero-cost miss just means the card renders empty, which
// is fine for the "nothing yet" case.

interface ImproveIssue {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  state: string;
}

interface ImproveCache {
  at: number;
  data: { total: number; recent: ImproveIssue[] };
}

const g = globalThis as unknown as { __rougeImproveCache?: ImproveCache };
const CACHE_MS = 60_000;

function fetchIssues(): { total: number; recent: ImproveIssue[] } {
  try {
    const stdout = execSync(
      `gh issue list --label self-improvement --state all --limit 50 --json number,title,url,createdAt,state`,
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const all = JSON.parse(stdout) as ImproveIssue[];
    return {
      total: all.length,
      recent: all.slice(0, 5),
    };
  } catch (err) {
    // gh not authenticated, network down, or no issues — treat as empty.
    console.warn(
      `[self-improve] gh issue list failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    );
    return { total: 0, recent: [] };
  }
}

export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const cached = g.__rougeImproveCache;
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json(cached.data);
    }
    const data = fetchIssues();
    g.__rougeImproveCache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return sanitizedErrorResponse(err, "system/self-improve GET");
  }
}
