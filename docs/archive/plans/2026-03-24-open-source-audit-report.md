# Open Source Audit Report — The Rouge

**Date:** 2026-03-24
**Repo:** /Users/gregario/Projects/ClaudeCode/The-Rouge
**Commits:** 325
**Tracked files:** 509

---

## 1. CRITICAL — Must Fix Before Going Public

### 1a. Supabase Anon Key + URL Committed in Build Artifacts (fruit-and-veg project)

The `projects/fruit-and-veg/.open-next/` directory contains compiled build artifacts with a **hardcoded Supabase anon key (JWT)** and **Supabase project URL** baked directly into the JavaScript:

- `projects/fruit-and-veg/.open-next/cloudflare/next-env.mjs` — lines 1-2, plaintext `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `projects/fruit-and-veg/.open-next/middleware/handler.mjs` — line 7652, same key
- `projects/fruit-and-veg/.open-next/server-functions/default/handler.mjs` — multiple lines
- `projects/fruit-and-veg/.open-next/assets/_next/static/chunks/95004c956cef301c.js` — bundled client JS

Supabase project ref: `mnasglmapdsrysmrozbh`
Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uYXNnbG1hcGRzcnlzbXJvemJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDc1OTksImV4cCI6MjA4OTYyMzU5OX0.88EMIYIWhluoY5258N4HAuWHkAt5bnO0x_cYX7fSKVc`

While anon keys are designed to be public (client-side), the entire `.open-next/` build directory should not be committed. It's 65 tracked files of compiled output.

**Action:** Remove `projects/` entirely from tracking (see section 4). If the Supabase project is real, verify RLS policies are properly configured since the anon key is now in git history permanently.

### 1b. Entire `projects/` Directory Is Tracked (330 files)

The `projects/` directory contains two complete product codebases (`countdowntimer` and `fruit-and-veg`) with:
- Full source code, tests, and build artifacts
- `cycle_context.json` files with deployment URLs, infrastructure state, and Supabase connection strings
- `.snapshots/` directories with historical state
- `seeding-state.json` files with full seeding session data
- `wrangler.toml` configs
- Marketing copy, screenshots, changelogs
- `package-lock.json` files

This is the **single biggest issue**. These are real product codebases that were never meant to be part of Rouge's public repo.

**Action:** Add `projects/` to `.gitignore` and remove from tracking. Use `git rm -r --cached projects/` then commit. The git history will still contain these files; consider history rewriting (see section on git history).

---

## 2. HIGH — Should Fix Before Going Public

### 2a. Hardcoded Sentry Org Slug

**File:** `src/launcher/provision-infrastructure.js` (lines 361-362)
```js
const sentryOrg = 'greg-j';
const sentryTeam = 'greg-j';
```

**Action:** Replace with environment variable or config file reference (e.g., `process.env.SENTRY_ORG || 'my-org'`).

### 2b. Hardcoded Personal Cloudflare Worker URLs in Docs

Multiple files reference `gregj64.workers.dev`:
- `docs/how-rouge-works.md` — line 245
- `docs/how-rouge-works-v2.md` — line 221
- `docs/research/2026-03-18-0b-battle-test-report.md`
- `docs/research/2026-03-18-0b-browse-findings.md`

**Action:** Replace with placeholder URLs like `<your-project>.workers.dev` or `example.workers.dev`.

### 2c. Hardcoded `/Users/gregario` Paths in Docs

Found in:
- `docs/plans/2026-03-18-0b-infrastructure-battle-testing.md` (lines 164, 524)
- `docs/plans/2026-03-18-0c-launcher-and-slack.md` (line 27)
- `docs/plans/2026-03-24-gstack-migration.md` (lines 11, 1046)
- `docs/plans/2026-03-24-open-source-launch.md` (line 26)
- Various files inside `projects/fruit-and-veg/.open-next/` (build artifacts)

**Action:** Replace with relative paths or `$ROUGE_ROOT` / `~/rouge` placeholders. Many of these are in `docs/plans/` which should be gitignored anyway (see section 4).

### 2d. `github.com/sponsors/gregario` in Prompt Templates

**File:** `src/prompts/seeding/07-marketing.md` (line 136)

This is part of a prompt that instructs Claude to add sponsor badges to product READMEs. While it's reasonable for The Rouge to reference the author's sponsor page, it hardcodes a personal GitHub username into the system.

**Action:** Make configurable via a config file (e.g., `rouge.config.json` with a `github_username` field).

### 2e. `.calibration.json` Is Tracked

This file contains personal calibration data (phase timing, waste multiplier). It's specific to the user's machine and usage patterns.

**Action:** Add to `.gitignore` and `git rm --cached .calibration.json`.

### 2f. `library/personal/` Files Are Tracked

Three files with personal learning data:
- `library/personal/phase-timing.json`
- `library/personal/process-observations.json`
- `library/personal/quality-patterns.json`

These contain project-specific observations. Only `.gitkeep` should be committed.

**Action:** Add `library/personal/*.json` to `.gitignore` (keep the `.gitkeep`). Run `git rm --cached library/personal/*.json`.

### 2g. `docs/plans/` Contains Internal Working Documents

12 tracked plan files including implementation details, migration plans, fix priority lists, and the launch plan itself. These are internal working documents, not public documentation.

**Action:** Add `docs/plans/` to `.gitignore` and `git rm -r --cached docs/plans/`.

### 2h. Generated PDFs Are Tracked

- `docs/how-rouge-works.pdf`
- `docs/how-rouge-works-v2.pdf`
- `docs/how-rouge-works-v3.pdf`

**Action:** Add `docs/*.pdf` to `.gitignore` and `git rm --cached docs/*.pdf`. Users can generate these themselves from the markdown source + `docs/pdf-style.css`.

---

## 3. LOW — Nice to Fix

### 3a. `src/slack/.env.example` Has Generic Placeholder Tokens

The file has `xoxb-your-bot-token` and `xapp-your-app-token` which is correct (placeholder format). No action needed — this is fine.

### 3b. README Needs Rewrite for Public Audience

Current README is 15 lines and references `docs/plans/` for design vision. Needs:
- Proper project description
- Installation and setup instructions
- Architecture overview
- Badge pills
- Contributing guidelines

### 3c. No CONTRIBUTING.md

Standard for open source projects. Should cover: how to set up the dev environment, how to run tests, PR process, code style.

### 3d. `docs/setup.md` and `docs/slack-setup.md` Use Placeholder Patterns

Both use `xoxb-...`, `xapp-...`, `https://hooks.slack.com/services/...` as examples. This is correct documentation practice. No secrets leaked.

### 3e. `docs/research/` Files Reference Personal Infrastructure

Files in `docs/research/` discuss findings from personal Sentry, Stripe, Supabase, Cloudflare, and Lighthouse investigations. They reference `sk_test_...` (truncated placeholder), `<ref>` placeholders, and generic API patterns. **No actual secrets**, but they reveal infrastructure choices specific to the author's setup.

**Action:** Consider whether these belong in the public repo. They're useful research artifacts but may confuse users. Could move to a wiki or remove.

### 3f. `projects/.gitkeep` Implies Projects Are Expected in This Repo

Once `projects/` is gitignored, the `.gitkeep` still signals that projects live inside the Rouge repo. This is the intended architecture (Rouge clones/creates projects inside itself), so `.gitkeep` should stay, but the README should explain this.

---

## 4. Recommended `.gitignore` Additions

Current `.gitignore`:
```
node_modules/
dist/
.env
.env.local
*.log
logs/
.DS_Store
.context/
docs/drafts/
.gstack/
```

**Add these lines:**
```gitignore
# Project data (each project is its own repo, cloned into projects/)
projects/*/

# Personal library data (keep .gitkeep, ignore learned data)
library/personal/*.json

# Cost calibration (machine-specific)
.calibration.json

# Internal planning docs (not public)
docs/plans/

# Generated PDFs
docs/*.pdf
```

After updating `.gitignore`, run:
```bash
git rm -r --cached projects/
git rm --cached .calibration.json
git rm --cached library/personal/phase-timing.json library/personal/process-observations.json library/personal/quality-patterns.json
git rm -r --cached docs/plans/
git rm --cached docs/how-rouge-works.pdf docs/how-rouge-works-v2.pdf docs/how-rouge-works-v3.pdf
```

---

## 5. Git History Concerns

### Committed Secrets in History

The Supabase anon key and project URL are in git history via the `projects/fruit-and-veg/` files. While anon keys are designed to be public (used client-side), the git history also contains:
- `cycle_context.json` files with deployment URLs and Supabase connection strings
- Build artifacts with embedded keys
- Personal Cloudflare Worker URLs

**No `xoxb-` or `xapp-` actual tokens were found in history** — only placeholder patterns in docs and plan files.

**No `phc_` PostHog tokens found in history.**

**No real `.env` files were committed** (only `.env.example`).

### Recommendation

**Minimum:** Remove tracked files from HEAD (via `git rm --cached`), update `.gitignore`, and commit. This stops new clones from seeing the data but it remains in history.

**Thorough:** Use `git filter-repo` or BFG Repo Cleaner to rewrite history, removing:
- `projects/` directory entirely
- `.calibration.json`
- `library/personal/*.json`
- `docs/plans/`
- `docs/*.pdf`

Since there are only 325 commits and this is pre-public, history rewriting is safe. Force-push to origin before making the repo public.

---

## 6. Source Code Fixes Required

### Files Needing Edits (do not edit now — list only)

| File | Issue | Fix |
|------|-------|-----|
| `src/launcher/provision-infrastructure.js:361-362` | Hardcoded `greg-j` Sentry org/team | Use env var `SENTRY_ORG` |
| `src/prompts/seeding/07-marketing.md:136` | Hardcoded `gregario` sponsor badge | Make configurable |
| `docs/how-rouge-works.md:245` | `gregj64.workers.dev` URL | Use placeholder |
| `docs/how-rouge-works-v2.md:221` | `gregj64.workers.dev` URL | Use placeholder |

---

## 7. Summary

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 2 | Supabase key in build artifacts; entire `projects/` dir tracked (330 files of real product code) |
| HIGH | 8 | Hardcoded Sentry org, personal worker URLs, `/Users/gregario` paths, personal sponsor link, `.calibration.json`, `library/personal/`, `docs/plans/`, generated PDFs |
| LOW | 6 | README rewrite, CONTRIBUTING.md, research docs with personal infra references |

**Estimated effort:** 1-2 hours to fix all CRITICAL and HIGH items. The main blocker is deciding whether to rewrite git history (recommended given the repo is pre-public).
