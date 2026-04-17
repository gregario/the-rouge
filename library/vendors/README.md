# Vendors

Each subdirectory here is one infrastructure vendor Rouge can orchestrate — Vercel, Supabase, Cloudflare, GitHub, Fly, etc.

The launcher auto-discovers every `library/vendors/<name>/manifest.json` at startup (`src/launcher/vendors.js`), validates it against `schemas/vendor-manifest.json`, and merges the declared `deny_patterns` into the spawn-time `--disallowedTools` list. Auto-wiring of declared intents into `INFRA_ACTION_HANDLERS` is a follow-up to #103 PR (b).

**To add a vendor:** read `docs/contributing/adding-a-vendor.md`. One manifest, one handler, one test file. No edits to `rouge-loop.js`, prompts, or `.claude/settings.json`.

**Existing vendor support** currently lives inline in `src/launcher/rouge-loop.js` (Layer 4 Phase 1 shipped `deploy-staging`, `deploy-production`, `db-migrate`, `db-seed`, `git-push`, `git-tag`). Migration of those into per-vendor manifests happens in PR (b) of #103.
