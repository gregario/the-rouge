# 0b Battle Test: Stripe CLI Findings

**Date:** 2026-03-18
**Tested with:** Stripe CLI 1.37.8, test/sandbox mode

## Verdict: Fully autonomous in test mode after one-time browser auth.

---

## Authentication

`stripe login` opens browser for OAuth pairing. One-time setup.

**Credentials stored in:** `~/.config/stripe/config.toml`
**Key expiry:** 90 days from login. Current expiry: 2026-06-16.

**IMPORTANT for Rouge launcher:** Track key expiry. Notify user 7 days before expiration via Slack. The launcher should check `test_mode_key_expires_at` from the config file on startup.

**Alternative auth:** `STRIPE_API_KEY=sk_test_...` env var bypasses CLI login entirely.

## Sandbox Constraint

Rouge must ONLY use Stripe test/sandbox mode keys. Never production keys.
Config confirms: `test_mode_api_key = sk_test_...`, no live keys present.
All API responses include `"livemode": false` for verification.

## Product Creation

```bash
stripe products create --name="Name" --description="Desc"
```

Returns JSON with `id`, `active`, `livemode`. All fields parseable.

## Price Creation

```bash
stripe prices create --product=<product-id> --unit-amount=999 --currency=usd -d "recurring[interval]=month"
```

Returns JSON with `id`, `recurring.interval`, `unit_amount`. Note: recurring params use `-d` flag syntax.

## Event Triggering

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

All three succeeded. Output: "Trigger succeeded! Check dashboard for event details."

## Webhook Listener (not tested — needs running server)

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

Returns webhook signing secret (`whsec_...`) on start. Forwards events to local endpoint.

For Rouge: the building phase would start `stripe listen` in the background, capture the `whsec_` secret, set it as an env var, then run the dev server.

## Cleanup

```bash
stripe products update <product-id> --active=false
```

Products can be deactivated but not deleted via CLI (Stripe API limitation — test mode products persist).

## JSON Output

All Stripe CLI commands output JSON by default. Parseable with `jq` or Python's `json` module. Key fields are consistent (`id`, `object`, `livemode`, etc.).

## Key Expiry Tracking for Rouge Launcher

The launcher should read `~/.config/stripe/config.toml` on startup and check:
```bash
grep "test_mode_key_expires_at" ~/.config/stripe/config.toml
```

If within 7 days of expiry → send Slack notification: "Stripe CLI key expires on <date>. Run `stripe login` to renew."
