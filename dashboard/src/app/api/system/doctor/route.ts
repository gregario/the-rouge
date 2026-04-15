import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { requireLauncher } from "@/lib/launcher-bridge";

export const dynamic = "force-dynamic";

// GET /api/system/doctor
// Returns the structured doctor result (see src/launcher/doctor.js).
// Localhost-only — the result reveals which binaries are installed and
// whether keychain entries exist, both of which are useful to an attacker.
export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const { runDoctor } = requireLauncher("doctor.js");
    const secrets = requireLauncher("secrets.js");
    const result = runDoctor({
      ROUGE_ROOT: process.env.ROUGE_ROOT,
      getSecret: secrets.getSecret,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
