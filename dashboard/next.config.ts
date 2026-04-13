import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // `standalone` emits .next/standalone/server.js plus only the node_modules
  // and source files actually traced by @vercel/nft. The launcher runs that
  // server directly on global installs — no `next` CLI, no devDeps, ~2s cold
  // start instead of 30–60s with `next dev`.
  output: "standalone",

  // The dashboard lives inside the monorepo at <root>/dashboard. Without
  // this, NFT roots tracing at the dashboard package and misses workspace
  // hoists. Anchor at the repo root so traced files resolve correctly.
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
