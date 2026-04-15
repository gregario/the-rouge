# FAQ & Troubleshooting

Quick answers to common questions and fixes for common problems. For the full walkthrough, see [your-first-product.md](../tutorials/your-first-product.md). For Slack-specific issues, see the [Slack setup troubleshooting section](slack-setup.md#troubleshooting).

---

## General FAQ

**How much does it cost?**
Depends on product size. See the [Economics section](../README.md#economics) in the README for estimates.

**Does it work on Linux?**
GStack (used for browser QA) is macOS only. Everything else works on Linux. Playwright fallback for evaluation is on the roadmap.

**Can I use my own framework or stack?**
Currently Next.js on Cloudflare with Supabase. The architecture is stack-agnostic -- what Rouge can build depends on what's in the integration catalogue. New stacks are added via catalogue contributions.

**Can I use it commercially?**
PolyForm Noncommercial for personal use. [$100/month Commercial tier](https://github.com/sponsors/gregario) for business use.

**How do I contribute?**
See [CONTRIBUTING.md](../../CONTRIBUTING.md).

**Can I use Rouge without Slack?**
Yes. You lose notifications and the control plane (start, pause, feedback from your phone). Without Slack, you monitor via `rouge status` and stop/start from the terminal.

---

## Build loop

**A phase times out.**
State is checkpointed after every phase. Nothing is lost. Run `rouge build <project>` to resume from the last checkpoint.

**Evaluation keeps failing on the same gap.**
After 3 consecutive failures, the circuit breaker fires. The analysing phase runs a diagnostic first. If it still can't resolve the issue, Rouge escalates to Slack with context, what it tried, and options. Create a `feedback.json` in the project directory with your guidance, and it resumes. See also [common situations](../tutorials/your-first-product.md#common-situations).

**Rate limited.**
Rouge has built-in backoff with reset time parsing. It usually resolves itself within a few minutes. If it persists across multiple cycles, wait for your rate limit window to reset and run `rouge build` again.

**Claude Code session runs out.**
Same as any interruption. State is on disk. Resume tomorrow with `rouge build <project>`. No progress is lost.

**Build produces no changes (no-op).**
Rouge detected nothing to do for this story. Spin detection tracks zero-delta stories — if 3+ stories produce no code changes, the loop escalates rather than spinning. Occasional no-ops are normal; repeated ones indicate a problem.

**Foundation cycle won't pass.**
Run `rouge status <project>` and read the evaluation report. The most common cause is a missing integration setup. Run `rouge setup <service>` for whatever's missing, then resume.

---

## Intervention

**I want to change direction mid-build.**
Create a `feedback.json` in the project directory with your guidance. Rouge reads it on the next escalation resolution. For big direction changes, stop the loop, edit `vision.json` directly, and restart with `rouge build`.

**I want to skip a story.**
Mark the story as `done` in `task_ledger.json`. The story deduplication system will skip it on the next cycle.

**Rouge deployed something broken.**
Staging only, by default. Safety hooks prevent production deploys without the full evaluation pipeline passing. If staging is broken, the next build cycle will detect and fix it. You can also give explicit feedback to speed up the fix.

**I want to start over.**
Delete the project directory and run `rouge init <project>` again. Clean slate.

---

## Integration issues

**`rouge setup` says the key is invalid.**
Check you copied the full key with no trailing whitespace. For Stripe specifically: test keys start with `sk_test_`, not `sk_live_`. Rouge only works with test/sandbox keys.

**Integration escalation blocked the build.**
Rouge needs an integration pattern that doesn't exist in the catalogue. Check Slack for details on what's missing. Either set up the service with `rouge setup <service>` or provide an alternative approach via feedback.

---

## Files and paths

**Where are my projects stored?**
`~/.rouge/projects/` for a global npm install. `projects/` relative to the repo for a git clone. Override with the `ROUGE_PROJECTS_DIR` environment variable.

**Where are logs?**
`~/.rouge/logs/` for global install, `logs/` for git clone. Same pattern as projects.

**Can I run multiple products at once?**
Yes. The loop iterates through all projects in the projects directory, one phase per project per iteration.
