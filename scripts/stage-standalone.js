#!/usr/bin/env node
/**
 * stage-standalone.js — assemble the dashboard's standalone runtime.
 *
 * `next build` with output: 'standalone' emits dashboard/.next/standalone/
 * containing server.js + a traced subset of node_modules + compiled src.
 * By design it does NOT include public/ or .next/static/ — Next's docs
 * assume a CDN serves those. We need a single self-contained folder the
 * launcher can run with `node server.js`, so copy them in.
 *
 * Runs as the prepack hook before `npm publish`. Idempotent: safe to run
 * repeatedly.
 */

const fs = require('node:fs');
const path = require('node:path');

const dashboard = path.join(__dirname, '..', 'dashboard');
const standalone = path.join(dashboard, '.next', 'standalone');

// With outputFileTracingRoot pointing at the repo root, Next mirrors the
// monorepo layout inside .next/standalone/, so server.js lands at
// .next/standalone/dashboard/server.js and static assets must sit
// alongside it — not at the top of standalone/.
const pkgInStandalone = path.join(standalone, 'dashboard');
const staticSrc = path.join(dashboard, '.next', 'static');
const staticDst = path.join(pkgInStandalone, '.next', 'static');
const publicSrc = path.join(dashboard, 'public');
const publicDst = path.join(pkgInStandalone, 'public');

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

copyDir(staticSrc, staticDst);
copyDir(publicSrc, publicDst);

// Marker so the launcher can tell prebuilt from source checkouts without
// rummaging through .next/ internals.
fs.writeFileSync(
  path.join(standalone, 'ROUGE_STANDALONE'),
  JSON.stringify(
    {
      built_at: new Date().toISOString(),
      next_version: require('../dashboard/node_modules/next/package.json').version,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  `[stage-standalone] staged ${path.relative(process.cwd(), standalone)}`,
);
