# Addendum — Phase 5 (Billing) Shipped, First Pass

**Supersedes the "Phase 5 Scope Locked" addendum's tier-model section.**
Final call: **Haiku for both trial and the paid tier** — no Sonnet/Opus
differentiation at launch. The `plans` table still exists so a future
tier is a new row, but the model column is Haiku everywhere for now.

## What actually shipped

- **Trial:** 10 lifetime generations, no card. Reuses the existing
  `world_config.generation_count` + `check_and_increment_generation_count`
  machinery from the original beta cap — just re-pointed at 10 instead
  of 25 (`TRIAL_CAP` in `lib/billingRepo.js`).
- **Paid plan:** `chronicled_monthly`, $5/month, 25 generations/month,
  resets each Stripe billing cycle.
- **Credits:** $2 per 5-generation pack, buyable in the Settings page
  dropdown (5/10/20/50 credits = 1/2/4/10 packs). Roll over indefinitely
  — a ledger (`credit_ledger`), not an expiring balance.
- **Spend order:** monthly quota first, then credits — one atomic
  Postgres function (`check_and_spend_subscription_generation`) handles
  both, row-locked the same way the original beta cap RPC was.
- **Lapsed subscriptions:** `past_due` (failed payment) and `canceled`
  both drop effective monthly quota to 0 but leave the credit balance
  spendable — they paid for those directly. This was an open question in
  the scope-locked addendum; built with that default, not re-confirmed
  with Austin.
- **Stripe integration:** Checkout Sessions for both subscribe and
  credit-pack purchase, a webhook route handling
  `checkout.session.completed` / `invoice.payment_succeeded` /
  `customer.subscription.updated` / `.deleted` / `invoice.payment_failed`,
  and a Customer Portal link for self-serve cancel/card update.
- **Settings page:** rebuilt "Beta Usage" section into "Billing & Usage"
  — shows trial or subscribed state, a Subscribe button, credit purchase
  dropdown, and (once subscribed) a Manage Billing button.

## Explicitly NOT built this pass (still open)

- **Real end-to-end test against live Stripe test-mode checkout.** Code
  is syntax-checked and internally consistent with the repo's actual
  field names/patterns, but has not been run against a real Checkout
  Session → webhook → DB round trip yet. Do this before announcing
  pricing to any tester.
- **Migration hasn't been run against the live Supabase DB.** Austin
  needs to run `migrations/012_billing.sql` himself (same as every prior
  migration in this repo).
- **The `plans` table's `stripe_price_id` placeholder** needs a real
  UPDATE once the migration runs — the INSERT ships with
  `'REPLACE_WITH_STRIPE_PRICE_ID'`, not the real Price ID, since the SQL
  file shouldn't hardcode a value that lives in Stripe's dashboard.
- **Dunning grace period / exact past_due UX copy** — built as "quota
  drops to 0 immediately on payment_failed," no grace window. Worth a
  real look once there's a real paying subscriber to see how Stripe's
  own retry schedule plays against this in practice.

## Deployment checklist (Austin, before this goes live)

1. Run `migrations/012_billing.sql` against Supabase.
2. `UPDATE plans SET stripe_price_id = 'price_1U0icFBEuCXCzgIocq6DaJ1s' WHERE id = 'chronicled_monthly';`
3. Render env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_CREDIT_PRICE_ID` (`price_1U0icgBEuCXCzgIoKR8ofDOI`),
   `APP_BASE_URL` (`https://app.chronicled.world`). `STRIPE_WEBHOOK_SECRET`
   comes after step 4.
4. Create the webhook endpoint in Stripe's dashboard pointing at
   `https://app.chronicled.world/api/webhooks/stripe`, select the 5
   event types listed in `routes/stripeWebhook.js`'s header comment,
   copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Deploy (package.json now includes the `stripe` dependency — Render's
   build step will `npm install` it automatically).
6. Smoke-test one subscribe flow and one credit-pack flow in Stripe test
   mode before switching keys to live.
