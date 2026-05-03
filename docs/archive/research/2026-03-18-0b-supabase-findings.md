# 0b Battle Test: Supabase Findings

**Date:** 2026-03-18
**Tested with:** supabase CLI 2.78.1, Management API v1

## Verdict: Fully autonomous with CLI + Management API. No dashboard needed.

---

## Project Creation (CLI)

```bash
supabase projects create "name" \
  --org-id <org-slug> \
  --db-password "$(openssl rand -base64 24)" \
  --region eu-west-1
```

- Fully non-interactive
- Returns table with ORG_ID, REFERENCE_ID, NAME, REGION, CREATED_AT
- Fails with clear error at 2-slot limit: "pause or upgrade one or more of these projects"

## API Keys (CLI)

```bash
supabase projects api-keys --project-ref <ref> -o json
```

Returns 4 keys: anon (legacy), service_role (legacy), publishable, secret.

## Project Delete (CLI)

```bash
supabase projects delete <ref> --yes
```

**Gotcha:** Positional arg, NOT `--project-ref` flag.

## Pause (Management API — no CLI support)

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/<ref>/pause" \
  -H "Authorization: Bearer $TOKEN"
```

Status progression: ACTIVE_HEALTHY → PAUSING → INACTIVE (30-60s)

## Restore (Management API)

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/<ref>/restore" \
  -H "Authorization: Bearer $TOKEN"
```

Status progression: INACTIVE → COMING_UP → ACTIVE_HEALTHY (60-120s)
Returns 400 if already restoring (idempotent, safe to retry).
Data fully preserved.

## Token Extraction (macOS)

The Supabase CLI stores its access token in the macOS keychain:
```bash
security find-generic-password -s "Supabase CLI" -w
```
Returns base64-encoded token with `go-keyring-base64:` prefix. Decode:
```bash
echo "<value>" | base64 -d
```

## Slot Rotation (verified E2E)

1. Pause project A (API) → wait for INACTIVE
2. Create project B (CLI) → succeeds
3. Use project B
4. Delete project B (CLI)
5. Restore project A (API) → wait for ACTIVE_HEALTHY

Total rotation time: ~3-4 minutes (dominated by pause + restore wait times).

## Implications for Rouge Launcher

- Launcher must extract token from macOS keychain for Management API calls
- Poll status every 10s during pause/restore (don't assume instant)
- Track active project refs in state to know which to rotate
- On V2 (Docker/Linux), token will be in env var instead of keychain
