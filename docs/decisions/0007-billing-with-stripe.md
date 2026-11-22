# 0007. Tariffs paid by card through Stripe, in US dollars
Date: 2026-11-22
Status: accepted

## Context
The director asked for two tariffs, priced per user and billed monthly or yearly:
- «Стандарт» (without AI): $7 per user per month billed monthly, or $5 billed yearly;
- «Стандарт + AI»: $10 per user per month billed monthly, or $8 billed yearly.

Payment is by card through Stripe, and only directors manage it. There is one company per installation. An overdue payment should only trigger reminders. Atlas otherwise works only in UAH (deals, KPIs, reports).

## Decision
- **Stripe Billing:** four recurring per-unit Prices in USD, referenced by `STRIPE_PRICE_*`.
  - The first payment goes through Stripe Checkout.
  - Changes, cancellation, the card and invoices go through the Stripe Customer Portal.
  - Card data never reaches Atlas.
- **USD for billing only.** The UAH-only rule covers business data (deals and the like), not what the company pays for Atlas.
- **No Stripe SDK:** the REST API is called with `fetch` and form-encoded bodies, and the webhook signature is checked with Node's `crypto`.
- **State comes from Stripe's webhook** (signed, each event handled once) into `company_subscriptions`. Invoices are read live and never stored.
- **Seats** equal the active users. A change updates the quantity with `create_prorations`, so the difference lands on the next invoice. A scheduler step reconciles any drift.
- **AI features** (AI analysis and AI triage of problem reports) follow the tariff:
  - on before the first subscription;
  - on with «Стандарт + AI», even when overdue;
  - off with «Стандарт» or once a subscription has ended.
- **An overdue payment** only notifies directors, at once and every 3 days. Nothing is restricted.

## Consequences
- Without the Stripe variables, billing reports «not configured» and everything works as before, AI included.
- **Test and live modes:** atlas-dev must use Stripe test keys and test prices, production live ones.
- **Prices:** the screen reads the amounts from Stripe, so a price change in Stripe (as a new Price id) needs only new variables, not a release.
- **AI before the first payment:** AI stays free until the first subscription. If the company never subscribes, it keeps AI.
