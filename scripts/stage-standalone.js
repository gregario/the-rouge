#!/usr/bin/env node
/**
 * stage-standalone.js — assemble the dashboard's standalone runtime.
 *
 * `next build` with output: 'standalone' emits dashboard/.next/standalone/
 * containing server.js + a traced subset of node_modules + compiled src.
 * By design it does NOT include public/ or .next/static/ — Next's docs
 * assume a CDN serves those. Worse, `.next/` is gitignored, which in turn
 * causes npm pack to drop the entire standalone even with the `files`
 * whitelist. So we copy the whole thing into dashboard/dist/ instead:
 * a path that isn't in any ignore file, with public/ and static/ merged in.
 *
 * Runs as the prepack hook before `npm publish`. Idempotent.
 */

const fs = require('node:fs');
const path = require('node:path');

const dashboard = path.join(__dirname, '..', 'dashboard');
const standalone = path.join(dashboard, '.next', 'standalone');
const dist = path.join(dashboard, 'dist');

// Without outputFileTracingRoot, server.js lands directly at
// .next/standalone/server.js and static/public go at .next/standalone/.next/static
// and .next/standalone/public respectively. Simpler layout, no absolute
// path leaks baked into required-server-files.json.
const staticSrc = path.join(dashboard, '.next', 'static');
const staticDst = path.join(dist, '.next', 'static');
const publicSrc = path.join(dashboard, 'public');
const publicDst = path.join(dist, 'public');

if (!fs.existsSync(standalone)) {
  console.error(
    `[stage-standalone] ${standalone} not found. Did \`next build\` run?`,
  );
  process.exit(1);
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true, dereference: false });
}

// Start fresh so removed files from a previous build don't linger.
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyDir(standalone, dist);
copyDir(staticSrc, staticDst);
copyDir(publicSrc, publicDst);

// Trim non-runtime artefacts that Next's tracer pulls in but the server
// doesn't need. Keeps the tarball small AND strips any author-flavoured
// docs/plans/ markdown that would otherwise leak.
const trimPaths = [
  path.join(dist, 'docs'),
  path.join(dist, 'AGENTS.md'),
  path.join(dist, 'CLAUDE.md'),
  path.join(dist, 'README.md'),
  path.join(dist, 'eslint.config.mjs'),
  path.join(dist, 'next.config.ts'),
  path.join(dist, 'package-lock.json'),
  path.join(dist, 'components.json'),
  path.join(dist, 'postcss.config.mjs'),
  path.join(dist, 'tsconfig.json'),
  path.join(dist, 'vitest.config.ts'),
  path.join(dist, 'next-env.d.ts'),
  path.join(dist, 'rouge-dashboard.config.json'),
];
for (const p of trimPaths) {
  fs.rmSync(p, { recursive: true, force: true });
}

// Marker so the launcher can tell prebuilt from source checkouts.
fs.writeFileSync(
  path.join(dist, 'ROUGE_STANDALONE'),
  JSON.stringify(
    {
      built_at: new Date().toISOString(),
      next_version: require('../dashboard/node_modules/next/package.json').version,
    },
    null,
    2,
  ) + '\n',
);

// Next 16 bakes the build-time absolute path of the dashboard package into
// required-server-files.json, server.js, and a handful of .next manifests
// (via `outputFileTracingRoot`, `turbopack.root`, `appDir`). Even when the
// tracing root is pinned to the package, those values serialize to the
// author's filesystem — shipping a home-directory path to every install.
// The standalone server resolves paths at runtime from its own __dirname,
// so these fields are effectively metadata. Scrub them to a neutral
// placeholder to avoid leaking build-host paths in the published tarball.
const buildRoot = path.join(__dirname, '..', 'dashboard');
const placeholder = '/__rouge_dashboard__';

function scrubFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }
  if (!content.includes(buildRoot)) return false;
  const scrubbed = content.split(buildRoot).join(placeholder);
  fs.writeFileSync(filePath, scrubbed);
  return true;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(js|json|cjs|mjs)$/.test(entry.name)) {
      scrubFile(full);
    }
  }
}
walk(dist);

console.log(
  `[stage-standalone] staged ${path.relative(process.cwd(), dist)}`,
);
