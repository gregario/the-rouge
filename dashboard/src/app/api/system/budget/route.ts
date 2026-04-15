import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function resolveRougeConfigPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "rouge.config.json"),
    path.resolve(process.env.ROUGE_CLI ? path.dirname(process.env.ROUGE_CLI) : "", "..", "..", "rouge.config.json"),
    path.resolve(__dirname, "../../../../../../rouge.config.json"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function projectsRoot(): string {
  return process.env.ROUGE_PROJECTS_DIR ?? path.join(process.env.HOME ?? "/tmp", ".rouge", "projects");
}

function readTotalSpend(): { total: number; byProject: Record<string, number> } {
  const root = projectsRoot();
  const byProject: Record<string, number> = {};
  let total = 0;
  if (!existsSync(root)) return { total, byProject };
  try {
    for (const name of readdirSync(root)) {
      const dir = path.join(root, name);
      if (!statSync(dir).isDirectory()) continue;
      // Rouge writes cumulative spend into state.json.costs.cumulative_cost_usd
      const statePath = path.join(dir, "state.json");
      if (!existsSync(statePath)) continue;
      try {
        const state = JSON.parse(readFileSync(statePath, "utf-8")) as { costs?: { cumulative_cost_usd?: number } };
        const n = Number(state.costs?.cumulative_cost_usd ?? 0);
        if (n > 0) {
          byProject[name] = n;
          total += n;
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* fall through */ }
  return { total, byProject };
}

// GET /api/system/budget → { cap: number, spend: { total, byProject } }
export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  const cfgPath = resolveRougeConfigPath();
  const cfg = cfgPath ? JSON.parse(readFileSync(cfgPath, "utf-8")) as { budget_cap_usd?: number } : {};
  const cap = Number(cfg.budget_cap_usd ?? 50);
  const spend = readTotalSpend();
  return NextResponse.json({ cap, spend, configPath: cfgPath });
}

// PUT /api/system/budget → body: { cap: number }
export async function PUT(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const { cap } = (await request.json()) as { cap?: number };
    const n = Number(cap);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "cap must be a non-negative number" }, { status: 400 });
    }
    const cfgPath = resolveRougeConfigPath();
    if (!cfgPath) return NextResponse.json({ error: "rouge.config.json not found" }, { status: 500 });
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    cfg.budget_cap_usd = n;
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    return NextResponse.json({ ok: true, cap: n });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
