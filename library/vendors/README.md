# Vendors

Each subdirectory here is one infrastructure vendor Rouge can orchestrate — Vercel, Supabase, Cloudflare, GitHub, Fly, etc.

The launcher auto-discovers every `library/vendors/<name>/manifest.yaml` at startup, validates it against `schemas/vendor-manifest.json`, and wires the declared intents into `INFRA_ACTION_HANDLERS` + the declared `deny_patterns` into the spawn-time `--allowedTools` list.

**To add a vendor:** read `docs/contributing/adding-a-vendor.md`. One manifest, one handler, one test file. No edits to `rouge-loop.js`, prompts, or `.claude/settings.json`.

**Existing vendor support** currently lives inline in `src/launcher/rouge-loop.js` (Layer 4 Phase 1 shipped `deploy-staging`, `deploy-production`, `db-migrate`, `db-seed`, `git-push`, `git-tag`). Migration of those into per-vendor manifests happens in PR (b) of #103.
