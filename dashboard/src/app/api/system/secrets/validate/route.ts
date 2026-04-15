import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { requireLauncher } from "@/lib/launcher-bridge";

export const dynamic = "force-dynamic";

// POST /api/system/secrets/validate
// Body: { integration: string }
// Runs validateIntegration from secrets.js, which hits each key's live
// validation endpoint (Stripe, Supabase, Sentry, Vercel, etc.) and returns
// per-key status. Returns [] for unknown integrations.
export async function POST(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const { integration } = (await request.json()) as { integration?: string };
    if (!integration) {
      return NextResponse.json({ error: "integration is required" }, { status: 400 });
    }
    const secrets = requireLauncher("secrets.js");
    const results = await Promise.resolve(secrets.validateIntegration(integration));
    return NextResponse.json({ integration, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
