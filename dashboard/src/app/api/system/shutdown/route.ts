import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/system/shutdown
// Responds 200, then exits the dashboard process on the next tick so the
// response actually flushes before the server dies. Called by the "Shut
// down Rouge" button in the top-right menu of the dashboard.
export async function POST() {
  setTimeout(() => {
    process.exit(0);
  }, 100);
  return NextResponse.json({ ok: true, message: "Rouge is shutting down." });
}
