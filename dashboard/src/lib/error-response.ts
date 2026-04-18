import { NextResponse } from "next/server";

/**
 * Sanitised error response for route handlers.
 *
 * Previously every system/* + mutation route returned `err.message` in
 * the 500 body. That leaks whatever implementation detail threw the
 * error — OS paths (`ENOENT: no such file or directory, open
 * '/Users/x/.rouge/...'`), module names, keychain framework errors.
 * The dashboard runs on localhost by default so exposure is limited,
 * but a tunnel / proxy misconfiguration could make these visible off-
 * box, and "attacker recon surface" is a bad default to ship.
 *
 * This helper:
 *   1. Logs the full error server-side, tagged with `context` so you
 *      can grep the log to find it.
 *   2. Returns a generic sanitised message to the client.
 *
 * Callers that intentionally want to surface a specific message (e.g.
 * 400s with validation hints) should continue to build the response
 * manually with their own message — this helper is for "I caught an
 * exception and don't know what it is" cases.
 */
export function sanitizedErrorResponse(
  err: unknown,
  context: string,
  opts: { status?: number; hint?: string } = {},
): NextResponse {
  const status = opts.status ?? 500;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${context}] ${status} — ${message}${stack ? `\n${stack}` : ""}`);
  return NextResponse.json(
    {
      error: opts.hint ?? "Request failed on the server. Check dashboard logs for details.",
    },
    { status },
  );
}
