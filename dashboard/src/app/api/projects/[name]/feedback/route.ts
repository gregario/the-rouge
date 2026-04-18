import { NextResponse } from "next/server";
import { existsSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { assertLoopback } from "@/lib/localhost-guard";

export const dynamic = "force-dynamic";

// Slug must match the same shape we accept at project creation
// (/^[a-z0-9][a-z0-9-]*$/). Rejecting anything else prevents directory
// traversal via `..`, null bytes, absolute paths, etc.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// Feedback payloads are small by design (a few fields of free text).
// Cap at 64 KB — anything larger is almost certainly abuse or a bug,
// and we'd rather reject fast than write megabytes to disk.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  const { name } = await params;
  if (!SLUG_RE.test(name)) {
    return NextResponse.json(
      { error: "Invalid project name" },
      { status: 400 },
    );
  }

  // Read raw body and cap size before parsing. We can't trust
  // request.json() to bound the payload — it'll happily parse 100 MB.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Payload too large (max ${MAX_BODY_BYTES} bytes)` },
      { status: 413 },
    );
  }
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { projectsRoot } = loadServerConfig();
  const projectDir = join(projectsRoot, name);

  if (!existsSync(projectDir)) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 },
    );
  }

  // Defence against symlinks: resolve the project dir's real path and
  // confirm it's still inside projectsRoot. A symlink like
  // `projectsRoot/foo → /etc` would otherwise let a request write
  // arbitrary files even with a valid-looking slug.
  let realProjectDir: string;
  let realProjectsRoot: string;
  try {
    realProjectDir = realpathSync(projectDir);
    realProjectsRoot = realpathSync(projectsRoot);
  } catch {
    return NextResponse.json(
      { error: "Project path could not be resolved" },
      { status: 500 },
    );
  }
  const rootWithSep = realProjectsRoot.endsWith("/")
    ? realProjectsRoot
    : realProjectsRoot + "/";
  if (!(realProjectDir + "/").startsWith(rootWithSep)) {
    return NextResponse.json(
      { error: "Project path escapes projects root" },
      { status: 400 },
    );
  }

  // statSync confirms it's a directory (not a file named like a slug).
  try {
    if (!statSync(realProjectDir).isDirectory()) {
      return NextResponse.json(
        { error: "Project path is not a directory" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Project directory stat failed" },
      { status: 500 },
    );
  }

  const feedbackFile = resolve(realProjectDir, "feedback.json");
  // Final belt-and-braces check: the resolved file must sit inside the
  // real project dir. (resolve() is enough given the inputs we control,
  // but cheap to verify.)
  if (!feedbackFile.startsWith(realProjectDir + "/")) {
    return NextResponse.json(
      { error: "Feedback path escapes project dir" },
      { status: 400 },
    );
  }

  try {
    writeFileSync(feedbackFile, JSON.stringify(body, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[feedback] write failed for ${name}:`, msg);
    return NextResponse.json(
      { error: "Failed to write feedback" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
