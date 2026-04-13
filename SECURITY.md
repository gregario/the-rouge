# Security

## Reporting a vulnerability

Please report suspected security issues privately — **do not open a public GitHub issue.**

Open a [GitHub Security Advisory](https://github.com/gregario/the-rouge/security/advisories/new)
in this repository. That's the preferred channel; it's private by default and lets us
coordinate a fix before disclosure.

You should get an acknowledgement within 7 days.

## What's in scope

Rouge is an autonomous product-development system that runs Claude Code with
`--dangerously-skip-permissions` and manages real cloud infrastructure
(Vercel, Cloudflare, Supabase, GitHub). The threat surface includes:

- **The launcher** (`src/launcher/`) — safety hooks, deploy blocking, secrets handling.
- **Safety hooks** (`src/launcher/rouge-safety-check.sh`) — the PreToolUse/PostToolUse
  hook that blocks dangerous commands.
- **Secrets backend** (`src/launcher/secrets.js`) — cross-platform credential store integration.
- **Slack bot** (`src/slack/`) — if you run the Slack control plane.
- **Dashboard** (`dashboard/`) — the Next.js control plane, its API routes, and SSE transport.
- **Integration catalogue** (`library/integrations/`) — the patterns Rouge draws from.

## What's out of scope

- **Products Rouge builds for you.** Their security is their own concern — they get
  their own repos, deploy targets, secret scopes.
- **Claude Code itself.** Report those to Anthropic.
- **`--dangerously-skip-permissions`.** This is a deliberate product choice, documented
  in the README. The safety hooks + deploy blocking are the defence, not the permission
  prompt.
- **The host machine.** Rouge assumes it runs on a dedicated machine or VM. Data exposure
  caused by running Rouge on a shared box is not a Rouge vulnerability.

## Non-goals

Rouge is **not** a hardened multi-tenant system. It's designed for a single developer
(or small team) running it against their own Claude subscription and cloud accounts.

## Acknowledgements

Reporters who follow responsible disclosure are credited in the release notes of the
version that contains the fix, unless they request otherwise.
