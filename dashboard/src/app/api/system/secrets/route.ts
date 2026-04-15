import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { requireLauncher } from "@/lib/launcher-bridge";

export const dynamic = "force-dynamic";

// GET /api/system/secrets
// Returns which integrations have which keys stored. NEVER returns values —
// only presence. Localhost-only.
export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const secrets = requireLauncher("secrets.js");
    const integrations: Record<string, Record<string, boolean>> = {};
    for (const [integration, keys] of Object.entries(secrets.INTEGRATION_KEYS) as [string, string[]][]) {
      integrations[integration] = {};
      for (const key of keys) {
        integrations[integration][key] = !!secrets.getSecret(integration, key);
      }
    }
    return NextResponse.json({ integrations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/system/secrets
// Body: { integration: 'stripe', key: 'STRIPE_SECRET_KEY', value: 'sk_...' }
// Writes to the OS keychain via the launcher's secrets backend. Localhost-only.
export async function POST(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const body = (await request.json()) as { integration?: string; key?: string; value?: string };
    if (!body.integration || !body.key || typeof body.value !== "string") {
      return NextResponse.json({ error: "integration, key, and value are required" }, { status: 400 });
    }
    const secrets = requireLauncher("secrets.js");
    const allowedKeys = (secrets.INTEGRATION_KEYS[body.integration] ?? []) as string[];
    if (!allowedKeys.includes(body.key)) {
      return NextResponse.json({ error: `Unknown key ${body.key} for integration ${body.integration}` }, { status: 400 });
    }
    // Refuse empty strings — users hit "Save" with a blank field by accident.
    if (body.value.length === 0) {
      return NextResponse.json({ error: "value must not be empty (use DELETE to clear)" }, { status: 400 });
    }
    secrets.storeSecret(body.integration, body.key, body.value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/system/secrets?integration=...&key=...
// Removes a single keychain entry. Localhost-only.
export async function DELETE(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const url = new URL(request.url);
    const integration = url.searchParams.get("integration");
    const key = url.searchParams.get("key");
    if (!integration || !key) {
      return NextResponse.json({ error: "integration and key are required query params" }, { status: 400 });
    }
    const secrets = requireLauncher("secrets.js");
    const removed = secrets.deleteSecret(integration, key);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
