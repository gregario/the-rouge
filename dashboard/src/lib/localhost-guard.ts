// Localhost-only guard for /api/system/* endpoints.
//
// The system endpoints (doctor, secrets write, daemon install, shutdown)
// can modify OS keychain entries and install launch agents. We run on
// localhost by design, but if someone ever exposes the dashboard over a
// LAN or tunnel, these endpoints MUST NOT be reachable.
//
// Check the remote address from headers set by Next.js. Refuse anything
// that isn't IPv4 loopback (127.0.0.1), IPv6 loopback (::1), or the
// IPv4-mapped IPv6 form (::ffff:127.0.0.1).

import { NextResponse } from "next/server";
import { headers } from "next/headers";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function assertLoopback(): Promise<NextResponse | null> {
  const h = await headers();
  // Next standalone server exposes the remote via `x-forwarded-for` when
  // behind a proxy; locally, `x-forwarded-host` / direct conn is loopback.
  // Prefer the first hop in x-forwarded-for if set, else the socket addr.
  const forwarded = h.get("x-forwarded-for")?.split(",")[0].trim();
  const remote = forwarded || h.get("x-real-ip") || "127.0.0.1";

  if (!LOOPBACK.has(remote)) {
    return NextResponse.json(
      { error: "forbidden: system endpoints are localhost-only", remote },
      { status: 403 },
    );
  }
  return null;
}
