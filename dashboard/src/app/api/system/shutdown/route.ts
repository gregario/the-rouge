import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";

export const dynamic = "force-dynamic";

// POST /api/system/shutdown
// Responds 200, then exits the dashboard process on the next tick so the
// response actually flushes before the server dies. Called by the "Shut
// down Rouge" button in the top-right menu of the dashboard.
//
// Loopback-guarded: this kills the control plane and should only be
// invoked from the local UI. Without the guard, an unauthenticated
// browser tab, stray curl, or misconfigured reverse proxy can trigger
// DoS. Matches the pattern used by the other system mutation routes
// (`/secrets`, `/daemon`, `/doctor`).
export async function POST() {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;
  setTimeout(() => {
    process.exit(0);
  }, 100);
  return NextResponse.json({ ok: true, message: "Rouge is shutting down." });
}
