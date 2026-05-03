# The Rouge — Documentation

> ⚠️ **Open source, experimental, runs with `--dangerously-skip-permissions`.** Rouge gives Claude Code full filesystem access. It can wipe your filesystem, force-push over your git history, and run up thousands of dollars in API charges in a single session. `budget_cap_usd`, dedicated-machine isolation, and frequent commits reduce risk but **don't guarantee** safety — bugs in the cap path and other mitigations have shipped before. Read the safety section in the [README](../README.md#safety) first.

Docs follow the [Diátaxis](https://diataxis.fr/) framework. Four purposes, four folders:

## [Tutorials](./tutorials/) — learn by doing

Step-by-step guides that take a new user from nothing to a working skill. Start here if it's your first time.

- [Quick start](./tutorials/quickstart.md) — zero to running dashboard
- [Your first product](./tutorials/your-first-product.md) — end-to-end build
- [Seeding example](./tutorials/seeding-example.md) — what the seeding flow looks like

## [How-to guides](./how-to/) — task recipes

Goal-oriented recipes for users who know what they want to do.

- [Setup guide](./how-to/setup.md) — install + configure
- [Slack setup](./how-to/slack-setup.md) — notifications-only sidecar (legacy, opt-in)
- [Troubleshooting](./how-to/troubleshooting.md) — common problems

## [Reference](./reference/) — information lookup

Dry, complete, accurate. Consult when you need a specific detail.

- [CLI reference](./reference/cli.md) — every `rouge` command (auto-generated)
- [Field name mapping](./reference/field-names.md)
- [Rate limits](./reference/rate-limits.md)

## [Explanation](./explanation/) — understanding

Background and context. Read when you want to understand *why*.

- [How Rouge works](./explanation/how-rouge-works.md) — the user-facing story
- [Architecture](./explanation/architecture.md) — the contributor-facing story
- [Anthology](./explanation/anthology.md) — selected long-form essays

For deeper architectural reading: the four boundary docs (`docs/design/{self-improve,mcp-vs-cli,determination-vs-judgment,entry-vs-core}-boundary.md`), the [state-machine-v3-transitions](./design/state-machine-v3-transitions.md) map, and the [grand unified reconciliation](./design/grand-unified-reconciliation.md) plan that produced the current shape.

---

**For the Golden Path to a first product**, open the dashboard (`rouge setup` then `rouge dashboard`) and click through the setup wizard. The dashboard is the canonical onboarding surface — the docs here are for depth and reference.

Historical planning docs, research, and earlier explanations live in [./archive/](./archive/) for the audit trail. They're not part of the user-facing path.

See [`../VISION.md`](../VISION.md) for what Rouge is and [`../CLAUDE.md`](../CLAUDE.md) for contributor guidance.
