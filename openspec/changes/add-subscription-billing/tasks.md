# Tasks

## 1. Tracer bullet: see the tariffs and pay once

- [x] 1.1 Migration `028_billing.sql`, `STRIPE_*` config with `billingConfigured()`, the `stripeRequest` client, and `GET /billing` (plans from Stripe) plus `POST /billing/checkout` (director-only, audited). A minimal «Тариф і оплата» screen: the unconfigured message, the four tariff options with totals for the active users, and «Оплатити» redirecting to Checkout. Navigation item and route, in uk, ru and en, with a demo-mode backend. Verify these tests:
  - «reports billing as not configured without keys»;
  - «gives a director the plans from Stripe and a checkout URL with the active-user quantity»;
  - the manager/employee 403 with audit;
  - «shows the four prices and the totals»;
  - «sends the director to Stripe»;
  - «a manager has no item and is redirected».

  Commit.

## 2. Subscription state from Stripe

- [x] 2.1 Webhook `POST /api/stripe/webhook` (raw body before `express.json`, signature check, idempotent `stripe_events`) for checkout and subscription events. Upsert `company_subscriptions`, automation audit, `billing:changed`. The summary card with status badges, and the `?checkout=success|cancel` return with refresh. Verify these tests:
  - signature (valid, changed body, wrong secret, old timestamp);
  - «stores the subscription from webhook events once, even when delivered twice»;
  - bad signature changes nothing;
  - the web shows «Стандарт + AI», yearly, active after the success return.

  Commit.
- [x] 2.2 `POST /billing/portal` and `GET /billing/invoices`; «Керувати оплатою», «Змінити тариф» and the «Рахунки» card; cancel-at-period-end shown as «Активний до …, не буде продовжено». Verify: tests for the portal URL (409 before the first payment), the invoice list mapping, and the cancelled state on screen. Commit.

## 3. Seats follow the team

- [x] 3.1 `activeUserCount`, `syncSeats` after create, disable and enable (non-blocking), and the `billing` scheduler step reconciling quantities, audited `BILLING_SEATS_UPDATED`. Verify: «updates the seat count when a user is added, disabled and re-enabled», and that the scheduler step fixes a quantity that drifted. Commit.

## 4. The AI tariff

- [x] 4.1 Add `aiIncluded` and `GET /billing/features`.
  - `POST /ai/analyze` answers 403 `PLAN_AI_REQUIRED`.
  - Feedback triage only with AI.
  - The AI dialog shows the tariff hint, with a link for directors.

  Verify these tests:
  - «refuses a new AI analysis on Стандарт without calling the model, keeps old analyses readable»;
  - «leaves problem reports untriaged on Стандарт»;
  - «keeps AI on while a Стандарт + AI payment is overdue»;
  - AI on when never subscribed;
  - the web dialog hint.

  Commit.

## 5. Failed payments

- [x] 5.1 `invoice.payment_failed` and `invoice.paid` handling; `BILLING_PAYMENT_FAILED` notifications in uk, ru and en; `remindOverduePayments` every 3 days; the overdue warning on the screen; the dashboard «Оберіть тариф» prompt for directors without a subscription. Verify: «notifies directors at a failed payment and again after 3 days, and stops after invoice.paid», and web tests for the overdue warning and the dashboard prompt. Commit.

## 6. Docs and checks

- [x] 6.1 ADR `0007-billing-with-stripe.md`. Variable names in `docs/external/README.md`. Stripe dashboard setup in `docs/OPERATIONS.md`: products and prices, portal settings, webhook URL and events, test vs live keys. Update `docs/ARCHITECTURE.md` and `STATUS.md`. Commit.
- [ ] 6.2 Run `make check`, `npm run build` and `npx openspec validate add-subscription-billing --strict`. On atlas-dev with Stripe test keys, run a test-card checkout, add a user, then use a declining test card. Verify that everything passes and that the subscription, quantity and reminder behave as specified.
