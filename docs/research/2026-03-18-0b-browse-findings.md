# 0b Battle Test: GStack Browse Findings

**Date:** 2026-03-18
**Tested with:** GStack browse binary at `~/.claude/skills/gstack/browse/dist/browse`

## Verdict: Works perfectly against deployed URLs. Fast and token-efficient.

---

## Commands Tested

| Command | Output | Latency |
|---------|--------|---------|
| `$B goto <url>` | "Navigated to <url> (200)" | ~200ms |
| `$B snapshot` | Semantic tree with @e refs | ~50ms |
| `$B snapshot -i` | Interactive elements only | ~50ms |
| `$B console --errors` | "(no console errors)" or error list | ~20ms |
| `$B perf` | dns/tcp/ssl/ttfb/dom/load timing breakdown | ~20ms |
| `$B js "<expression>"` | JS evaluation result | ~30ms |

Total page load + full inspection: ~370ms.

## Key Finding: `$B` is Not a Shell Alias

In `claude -p` mode, `$B` resolves to nothing. Phase prompts MUST either:

1. Set `B=~/.claude/skills/gstack/browse/dist/browse` at the start of execution
2. Or use the full path in every command

**Recommended:** Add to the autonomous-mode partial or each phase prompt's preamble:
```bash
export B=~/.claude/skills/gstack/browse/dist/browse
```

## Performance Against Deployed URL

Tested against `https://rouge-testbed-staging.gregj64.workers.dev/`:
- DNS resolution: 10ms
- TCP connect: 70ms
- SSL handshake: 60ms
- Time to first byte: 47ms
- DOM parse: 104ms
- DOM ready: 250ms
- Full load: 370ms

No CORS or CSP issues. No connectivity problems. Headless Chromium daemon persists between commands.

## Snapshot Output Format

```
@e1 [main]
  @e2 [heading] "Rouge Testbed" [level=1]
  @e3 [paragraph]: Infrastructure battle-testing
  @e4 [text]: "Status: OK"
```

Semantic tree with `@e` references usable in subsequent `$B click @eN` or `$B fill @eN` commands. Plain text format — most token-efficient option for LLM context.
