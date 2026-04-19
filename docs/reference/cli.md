# CLI Reference

**Auto-generated from `rouge` help output.** Do not edit by hand —
run `node scripts/generate-cli-reference.js` to regenerate.

The dashboard is Rouge's primary control surface. Most users only need the
SETUP & LIFECYCLE commands. Everything else is power-user territory.

```
The Rouge CLI

  The dashboard is the primary control surface. Most users only need the
  commands under SETUP — everything else is power-user / automation territory.

  SETUP & LIFECYCLE
    rouge setup [--yes|--no-daemon] One-time setup (prereqs, deps, projects dir, daemon)
    rouge setup <integration>       Store credentials for an integration
    rouge doctor                    Check prerequisites and dependencies
    rouge dashboard                 Open the dashboard (foreground, auto-opens browser)
    rouge start                     Start the dashboard in the background
    rouge stop                      Stop the dashboard
    rouge status                    Show system + project status
    rouge uninstall                 Remove Rouge files, launch agent, and keychain entries
    rouge dashboard restart         Restart background dashboard
    rouge dashboard install         Install dev deps (source checkouts only)

  ADVANCED / AUTOMATION
    rouge status <name>             Show state for a single project
    rouge cost <name> [--actual]    Show cost estimate or actuals
    rouge secrets list              List stored secret names
    rouge secrets check <dir>       Check project against stored secrets
    rouge secrets validate <target> Validate keys against API endpoints
    rouge secrets expiry [days]     Show secrets expiring within N days
    rouge secrets expiry set <s/K> <date>  Set expiry for a secret
    rouge feasibility <description> Assess feasibility of a proposed change
    rouge contribute <path>         Contribute a draft integration pattern via PR
    rouge resume-escalation <slug>  Prime a direct Claude Code session for an
                                    escalation hand-off. Parks the project,
                                    prints the claude command + context.
    rouge improve                   Run one self-improvement iteration
    rouge improve --max-iterations 5  Run up to 5 iterations
    rouge improve --explore         Enable exploration when no issues remain
    rouge improve --dry-run         Show what would be done without doing it

  EXPERIMENTAL (no longer the recommended path — use the dashboard instead)
    rouge init <name>               Create a new project directory
    rouge seed <name>                Start interactive seeding via claude -p
    rouge build [name]              Start the Karpathy Loop
    rouge slack setup               Print Slack setup guide
    rouge slack start               Start the Slack bot
    rouge slack test                Send a test webhook message

  Integrations: stripe, supabase, sentry, slack, cloudflare, vercel, llm

  Suppress experimental warnings: ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1
```

## Environment variables

- `ROUGE_DASHBOARD_PORT` — override the default dashboard port (3001)
- `ROUGE_PROJECTS_DIR` — override the projects directory (default: `~/.rouge/projects` globally, `./projects` in source checkouts)
- `ROUGE_HOME` — override the Rouge home dir (default: `~/.rouge`)
- `ROUGE_CLI` — absolute path to `rouge-cli.js` (set automatically by the launcher; consumed by the dashboard)
- `ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1` — silence `--experimental` warnings on demoted CLI verbs (useful for automation)

## Exit codes

- `0` — success
- `1` — blocker (e.g., `doctor` found missing prereqs, `setup` failed, invalid args)

Commands marked `EXPERIMENTAL` in the help output still work but are no
longer the recommended path — the dashboard is the primary control surface.
They print a warning on use; suppress with `ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1`.
