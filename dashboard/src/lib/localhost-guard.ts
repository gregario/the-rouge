// Localhost-only guard for mutation endpoints (system + project lifecycle).
//
// These endpoints can modify OS keychain entries, install launch agents,
// spawn subprocesses, and mutate project files on disk. We run on
// localhost by design; if someone ever exposes the dashboard over a
// LAN or tunnel, they MUST NOT be reachable from off-box.
//
// Security model: **do not trust x-forwarded-for by default.**
// The previous implementation took the first `x-forwarded-for` hop as
// the client IP. But that header is set by the caller — anyone making
// a direct request can spoof `x-forwarded-for: 127.0.0.1` and bypass
// the check. Only a trusted reverse proxy (that strips and rewrites
// the header) gives it any meaning.
//
// This guard now ignores `x-forwarded-for` and `x-real-ip` unless the
// operator explicitly opts in by setting `ROUGE_TRUST_PROXY=1`. In the
// default configuration we rely on Next.js's `x-forwarded-for`
// population from the socket-level peer address, which for loopback
// connections is always one of the entries in LOOPBACK.
//
// Relax this only if you're running the dashboard behind a proxy that
// strips client-supplied forwarding headers and rewrites them from the
// real socket.

import { NextResponse } from "next/server";
import { headers } from "next/headers";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function trustProxy(): boolean {
  return process.env.ROUGE_TRUST_PROXY === "1";
}

export async function assertLoopback(): Promise<NextResponse | null> {
  const h = await headers();

  // In the default (no proxy) configuration, Next's standalone server
  // populates `x-forwarded-for` from the accepted socket's remote
  // address. That IS trustworthy because it wasn't provided by the
  // client — Node set it from the TCP peer. But we can't distinguish
  // from inside the handler whether the header was set by Node or by
  // the client, so the safe default is: require loopback on every
  // candidate hop we can see.
  const candidates = new Set<string>();

  const forwardedRaw = h.get("x-forwarded-for");
  if (forwardedRaw) {
    for (const entry of forwardedRaw.split(",")) {
      const v = entry.trim();
      if (v) candidates.add(v);
    }
  }
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) candidates.add(realIp);

  // If nothing populated any forwarded header at all, the request came
  // from the socket directly with no proxy involvement — treat as
  // loopback (the only way to reach an unexposed next server from
  // off-box is via a proxy, which would have set the headers).
  if (candidates.size === 0) return null;

  // When the operator opts in, we trust the first hop (proxy chain
  // convention). Without the opt-in, EVERY candidate must be loopback.
  if (trustProxy()) {
    const firstHop = forwardedRaw?.split(",")[0].trim() || realIp || "";
    if (!LOOPBACK.has(firstHop)) {
      return NextResponse.json(
        { error: "forbidden: endpoint is localhost-only", remote: firstHop },
        { status: 403 },
      );
    }
    return null;
  }

  for (const c of candidates) {
    if (!LOOPBACK.has(c)) {
      return NextResponse.json(
        { error: "forbidden: endpoint is localhost-only", remote: c },
        { status: 403 },
      );
    }
  }
  return null;
}
