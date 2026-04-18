import { NextResponse } from "next/server";
import { assertLoopback } from "./localhost-guard";

// Standard slug shape across all routes. Must start with a lowercase
// letter or digit; only lowercase letters, digits, and hyphens after
// that. Rejects path traversal (`..`), null bytes, absolute paths,
// uppercase, whitespace, etc.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Gate a mutation route: require loopback and a valid slug.
 *
 * Every mutation endpoint (POST/PATCH/DELETE) must be callable only
 * from loopback and must validate the slug before touching any
 * filesystem path. This helper gives every route the same baseline so
 * one forgotten call site can't be the whole back door. Returns
 * { ok: true } on success or { ok: false, response } with the
 * appropriate error response ready to return to the caller.
 */
export async function guardMutation(slug: string): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  const forbidden = await assertLoopback();
  if (forbidden) return { ok: false, response: forbidden };
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid project name" },
        { status: 400 },
      ),
    };
  }
  return { ok: true };
}
