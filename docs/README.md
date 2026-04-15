# The Rouge — Documentation

Docs follow the [Diátaxis](https://diataxis.fr/) framework. Four purposes, four folders:

## [Tutorials](./tutorials/) — learn by doing

Step-by-step guides that take a new user from nothing to a working skill. Start here if it's your first time.

- [Quick start](./tutorials/quickstart.md) — zero to running dashboard
- [Your first product](./tutorials/your-first-product.md) — end-to-end build
- [Seeding example](./tutorials/seeding-example.md) — what the seeding flow looks like

## [How-to guides](./how-to/) — task recipes

Goal-oriented recipes for users who know what they want to do.

- [Setup guide](./how-to/setup.md) — install + configure
- [Slack setup](./how-to/slack-setup.md) — notifications + remote commands (experimental)
- [Troubleshooting](./how-to/troubleshooting.md) — common problems

## [Reference](./reference/) — information lookup

Dry, complete, accurate. Consult when you need a specific detail.

- [CLI reference](./reference/cli.md) — every `rouge` command (auto-generated)
- [Field name mapping](./reference/field-names.md)
- [Rate limits](./reference/rate-limits.md)

## [Explanation](./explanation/) — understanding

Background and context. Read when you want to understand *why*.

- [Architecture](./explanation/architecture.md)
- [How Rouge works (v3)](./explanation/how-rouge-works-v3.md) — current model
- [How Rouge works (v2)](./explanation/how-rouge-works-v2.md), [v1](./explanation/how-rouge-works-v1.md) — history
- [Anthology](./explanation/anthology.md)

---

**For the Golden Path to a first product**, open the dashboard (`rouge setup` then `rouge dashboard`) and click through the setup wizard. The dashboard is the canonical onboarding surface — the docs here are for depth and reference.

See [`../VISION.md`](../VISION.md) for what Rouge is and [`../CLAUDE.md`](../CLAUDE.md) for contributor guidance.
