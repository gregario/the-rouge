import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { guardMutation } from "@/lib/route-guards";
import { sanitizedErrorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

// Spec diff — file-level changes to seed_spec/, vision.json, and
// product_standard.json since a reference commit. Powers the Spec
// tab's "What's changed" section when the user is in Revise mode.
//
// Returns { files: Array<{ path, status, additions?, deletions? }>,
//           base: string, head: string }.
// Status follows `git diff --name-status`: M (modified), A (added),
// D (deleted), R (renamed), C (copied).
//
// Scope: intentionally file-level, not line-by-line. A proper diff
// viewer is a bigger feature; this covers 80% of the "what changed"
// question with 20% of the complexity. Full unified-diff rendering
// is a follow-up if users ask for it.

const SPEC_PATHS = ["seed_spec", "vision.json", "product_standard.json"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  try {
    const { projectsRoot } = loadServerConfig();
    const projectDir = join(projectsRoot, name);
    if (!existsSync(projectDir)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!existsSync(join(projectDir, ".git"))) {
      // Not every project is under git yet. That's fine — just return
      // an empty diff so the UI can render a "nothing tracked yet" hint.
      return NextResponse.json({ files: [], base: null, head: null });
    }

    const url = new URL(request.url);
    // Default base: HEAD~1. Override with ?since=<ref>.
    const since = url.searchParams.get("since") || "HEAD~1";

    // Resolve head + base SHAs for display.
    let head = "HEAD";
    let base = since;
    try {
      head = execSync(`git rev-parse HEAD`, {
        cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      }).trim().slice(0, 7);
      base = execSync(`git rev-parse ${since}`, {
        cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      }).trim().slice(0, 7);
    } catch {
      // Ref doesn't resolve (shallow clone, missing parent) — that's
      // fine, just return empty.
      return NextResponse.json({ files: [], base: null, head: null });
    }

    // Diff name-status, scoped to spec paths only. --numstat adds
    // insertion/deletion counts per file.
    let raw = "";
    try {
      raw = execSync(
        `git diff --numstat --diff-filter=ACDMR ${since}..HEAD -- ${SPEC_PATHS.map((p) => `'${p}'`).join(" ")}`,
        { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 },
      );
    } catch {
      return NextResponse.json({ files: [], base, head });
    }

    const files = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // numstat: "<add>\t<del>\t<path>" (- - for binary)
        const [addStr, delStr, path] = line.split("\t");
        const additions = addStr === "-" ? null : Number(addStr);
        const deletions = delStr === "-" ? null : Number(delStr);
        return { path, additions, deletions };
      });

    return NextResponse.json({ files, base, head });
  } catch (err) {
    return sanitizedErrorResponse(err, `projects/${name}/spec-diff`);
  }
}
