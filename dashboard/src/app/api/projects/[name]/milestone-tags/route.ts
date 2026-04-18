import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "@/lib/server-config";
import { guardMutation } from "@/lib/route-guards";
import { sanitizedErrorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

// Milestone tags — Rouge marks each shipped milestone with a git tag
// shaped `milestone/<slug>/<name>` (see single-branch strategy in
// CLAUDE.md). This endpoint surfaces the tags for a project so the
// build-tab timeline can badge milestones that actually shipped
// versus those still in progress.

interface MilestoneTag {
  name: string; // e.g. "auth-v1"
  ref: string; // full tag ref e.g. "milestone/my-product/auth-v1"
  sha: string; // short SHA
  date?: string; // tagger/committer date, ISO
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const guard = await guardMutation(name);
  if (!guard.ok) return guard.response;

  try {
    const { projectsRoot } = loadServerConfig();
    const projectDir = join(projectsRoot, name);
    if (!existsSync(projectDir) || !existsSync(join(projectDir, ".git"))) {
      return NextResponse.json({ tags: [] });
    }

    // `milestone/<slug>/<name>` pattern.
    let raw = "";
    try {
      raw = execSync(
        `git for-each-ref --format='%(refname:short)|%(objectname:short)|%(creatordate:iso-strict)' 'refs/tags/milestone/${name}/*'`,
        { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 },
      );
    } catch {
      return NextResponse.json({ tags: [] });
    }

    const tags: MilestoneTag[] = raw
      .split("\n")
      .map((line) => line.trim().replace(/^'|'$/g, ""))
      .filter(Boolean)
      .map((line) => {
        const [ref, sha, date] = line.split("|");
        // Strip "milestone/<slug>/" prefix to get bare milestone name
        const bareName = ref.replace(new RegExp(`^milestone/${name}/`), "");
        return { name: bareName, ref, sha, date };
      });

    return NextResponse.json({ tags });
  } catch (err) {
    return sanitizedErrorResponse(err, `projects/${name}/milestone-tags`);
  }
}
