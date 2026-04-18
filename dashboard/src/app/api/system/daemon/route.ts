import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { requireLauncher } from "@/lib/launcher-bridge";
import { sanitizedErrorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

// GET /api/system/daemon
// Returns the launch-agent/daemon status. Localhost-only.
export async function GET() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const daemon = requireLauncher("daemon.js");
    return NextResponse.json(daemon.statusSummary());
  } catch (err) {
    return sanitizedErrorResponse(err, "system/daemon GET");
  }
}

// POST /api/system/daemon
// Installs the launch agent (macOS) / returns "not supported" otherwise.
// Localhost-only.
export async function POST() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const daemon = requireLauncher("daemon.js");
    const result = daemon.install();
    const status = result.ok ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (err) {
    return sanitizedErrorResponse(err, "system/daemon POST");
  }
}

// DELETE /api/system/daemon
// Unloads and removes the launch agent. Localhost-only.
export async function DELETE() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const daemon = requireLauncher("daemon.js");
    const result = daemon.uninstall();
    const status = result.ok ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (err) {
    return sanitizedErrorResponse(err, "system/daemon DELETE");
  }
}
