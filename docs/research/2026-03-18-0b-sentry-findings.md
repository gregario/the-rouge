# 0b Battle Test: Sentry CLI / API Findings

**Date:** 2026-03-18
**Tested with:** sentry-cli 3.3.3, Sentry API v0

## Verdict: Fully autonomous via API. CLI has no project creation — use REST API directly.

---

## Authentication

**Personal auth token** with scopes: `org:read`, `project:read`, `project:write`, `project:releases`.

Stored in `~/.sentryclirc`:
```ini
[auth]
token=sntrys_...
```

**For Rouge:** Extract token from `~/.sentryclirc` or use `SENTRY_AUTH_TOKEN` env var.

## CLI Limitations

`sentry-cli projects` only has `list` — no `create`. Project creation requires the REST API.

`sentry-cli` IS useful for:
- Source map upload: `sentry-cli sourcemaps upload`
- Release creation: `sentry-cli releases new <version>`
- Release finalization: `sentry-cli releases finalize <version>`

## Project Creation (REST API)

```bash
SENTRY_TOKEN=$(grep 'token=' ~/.sentryclirc | cut -d= -f2)

curl -s -X POST "https://sentry.io/api/0/teams/<org>/<team>/projects/" \
  -H "Authorization: Bearer $SENTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "<project-name>", "platform": "javascript-nextjs"}'
```

Returns JSON with `id`, `slug`, `name`, `platform`.

## DSN Retrieval (REST API)

```bash
curl -s "https://sentry.io/api/0/projects/<org>/<project-slug>/keys/" \
  -H "Authorization: Bearer $SENTRY_TOKEN"
```

Returns array of keys. DSN at `[0].dsn.public`.
Format: `https://<key>@o<org-id>.ingest.<region>.sentry.io/<project-id>`

## Project Deletion

Requires `org:admin` scope — NOT available with our token. Not needed for Rouge (projects persist, free tier has no project limit).

## Free Tier Limits

- 5K errors/month
- 10K performance transactions/month
- 10K replays/month
- 1 user
- No project count limit

## Org/Team Info

- Org slug: `your-sentry-org`
- Team slug: `your-sentry-org` (default team matches org)
- Region: `de` (Europe, based on DSN ingest URL)

## Rouge Integration Flow

1. During seeding: create Sentry project via API, get DSN
2. Store DSN in `cycle_context.json` under `infrastructure.sentry_dsn`
3. Building phase: configure `@sentry/cloudflare` with DSN
4. Ship phase: `sentry-cli releases new <version>` + `sentry-cli sourcemaps upload`
5. No cleanup needed — projects persist
