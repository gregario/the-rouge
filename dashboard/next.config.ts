import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // `standalone` emits .next/standalone/server.js plus only the node_modules
  // and source files actually traced by @vercel/nft. The launcher runs that
  // server directly on global installs — no `next` CLI, no devDeps, ~2s cold
  // start instead of 30–60s with `next dev`.
  output: "standalone",

  // Pin NFT's tracing root to the dashboard package. Next 16 otherwise
  // auto-hoists the root when it sees a higher-level node_modules/ or
  // lockfile (the Rouge repo has both at the root level), which produces
  // a weird `.next/standalone/Projects/ClaudeCode/The-Rouge/` layout AND
  // bakes the absolute build path into required-server-files.json and
  // server.js — shipping the author's home-dir path to every install.
  outputFileTracingRoot: __dirname,

  // Keep required-server-files.json from serializing the absolute build
  // path. We resolve paths at runtime from the server.js location.
  experimental: {},
};

export default nextConfig;
