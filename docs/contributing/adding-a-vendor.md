# Adding a vendor to The Rouge

A vendor is any cloud provider Rouge orchestrates on the user's behalf: Vercel, Supabase, Cloudflare, GitHub, Fly, Neon, etc. Vendors are loaded by convention — drop one directory into `library/vendors/` and the launcher picks it up at startup.

## Contract

Every vendor is one directory containing exactly two files:

```
library/vendors/<name>/
  manifest.json   # declarative configuration
  handler.js     # intent implementations + ownership verification
```

`<name>` must be lowercase kebab-case (e.g. `fly`, `cloudflare-workers`) and must equal the `name` field in `manifest.json`.

## `manifest.json`

Validated against `schemas/vendor-manifest.json` at launcher startup. Invalid manifests abort boot — fail loud, not mid-build.

Required fields: `name`, `version`, `intents`, `ownership_fence`. Typical structure:

```json
{
  "name": "fly",
  "version": 1,
  "description": "Fly.io app deploys via flyctl",
  "deny_patterns": [
    "Bash(flyctl *)",
    "Bash(fly *)"
  ],
  "intents": [
    { "name": "deploy-staging", "handler": "deployStaging" },
    { "name": "deploy-production", "handler": "deployProduction" },
    { "name": "rollback-production", "handler": "rollbackProduction" }
  ],
  "ownership_fence": {
    "manifest_field": "fly_app_id",
    "verify": "verifyOwnership",
    "pre_foundation_snapshot": "listExistingApps"
  },
  "escalations": [
    "infrastructure-ownership-ambiguity",
    "vendor-auth-expired"
  ]
}
```

Loader: `src/launcher/vendors.js`. Handler auto-wiring into `INFRA_ACTION_HANDLERS` lands in a follow-up; PR (b) only merges `deny_patterns` into `--disallowedTools`.

## `handler.js`

Exports the functions named in the manifest. Handlers are called by `processInfraAction()` in `src/launcher/rouge-loop.js` after a phase writes `pending-action.json`.

```js
// library/vendors/fly/handler.js

export async function deployStaging(action, context) {
  // action: the parsed pending-action.json body
  // context: { projectDir, manifest, state, logger }
  // Return: { success: true, details: {...} } or { success: false, error: "..." }
}

export async function verifyOwnership(expectedId, liveResource) {
  // Called before every infra callback fires.
  // Return: { matches: true } or { matches: false, reason: "..." }
}

export async function listExistingApps(context) {
  // Optional. Populates state.json:existing_external_resources before foundation.
  // Return: array of { id, name, created_at } for resources already in the user's account.
}
```

## Rules

- **Never shell out to the vendor CLI from a prompt.** The `deny_patterns` you declare are enforced against every Claude subprocess. If the handler needs to call `flyctl`, call it from `handler.js` (launcher-side) — not from a phase prompt.
- **Never allow force-push or destructive defaults.** If your vendor has destructive operations (drop, destroy, purge), require a second confirmation via the escalation contract.
- **Ownership fence is mandatory.** Every vendor must declare `ownership_fence`. The launcher refuses to dispatch any intent for a vendor whose `verifyOwnership` returns `matches: false`. This is the mechanism that prevents the #103 class of incident.
- **Secrets.** Never read secrets from `process.env` directly in `handler.js`. Use `src/launcher/secrets.js` — it enforces the keychain backend and audit log.

## Testing

Every vendor must ship with `test/vendors/<name>.test.js` covering:

1. Schema validation of the manifest.
2. Each declared intent handler called with a valid action — asserts `success: true`.
3. Each handler called with an invalid action (missing field, wrong type) — asserts graceful failure, not throw.
4. `verifyOwnership` — positive and negative cases.
5. `pre_foundation_snapshot` if declared — mock the provider API, assert snapshot shape matches `schemas/state.json` `existing_external_resources` field.

The launcher test harness exposes `mockVendorContext()` — use it. See `test/vendors/_template.test.js`.

## Checklist before opening a PR

- [ ] `manifest.json` validates against `schemas/vendor-manifest.json`
- [ ] Every declared intent has a matching export in `handler.js`
- [ ] `verifyOwnership` export exists and is wired to `ownership_fence.verify`
- [ ] `deny_patterns` cover the vendor's CLI (including `npx <cli>` form if applicable)
- [ ] No secrets read directly from `process.env`
- [ ] Tests cover intents, ownership, and snapshot (if declared)
- [ ] `docs/design/phase-tool-surface.md` updated if the vendor adds new Rouge-core patterns (rare)
- [ ] PR description lists every intent introduced and links the escalation classifications
