# Design: Tariffs and card payments (Stripe)

## Context
- **One installation, one company:** the company's directors pay. There is no platform-owner level.
- **AI today:**
  - `ai.ts analyzeWork` (OpenAI, with a rule fallback) serves `POST /ai/analyze`;
  - `automation/feedback.ts` triages problem reports when `llmConfigured()`.
  - Alerts are rule-based SQL (`automation/alerts.ts`) and are not AI.
- **Active users change in three places:** `routes/team.ts` (create, `INSERT INTO users`) and `routes/teamAdmin.ts` (disable: `status = 'DISABLED'`; enable: `status = 'ACTIVE'`).
- **Webhooks:** the Telegram webhook is mounted in `app.ts` before the limiters and authentication. `express.json()` is global, so a Stripe webhook needs its raw body and must be mounted before `express.json()`.
- **Background work:** `automation/scheduler.ts` steps run every `AUTOMATION_INTERVAL_MS` under an advisory lock.
- **Notifications:** `notify()` with templates (`apps/api/src/i18n`). `notifications.kind` is free text, so a new kind needs no migration.
- **Currency:** the «only UAH» rule in `AGENTS.md` and the sales spec is about deals. Billing is in USD on Stripe; an ADR records the distinction.

## Decisions

### D1. Stripe objects
- **Four recurring Prices in USD** are created once in the Stripe dashboard, on two Products, and referenced by environment variables:

  | Variable | Product / interval | unit_amount |
  |---|---|---|
  | `STRIPE_PRICE_STANDARD_MONTHLY` | Стандарт / month | 700 |
  | `STRIPE_PRICE_STANDARD_YEARLY` | Стандарт / year | 6000 |
  | `STRIPE_PRICE_AI_MONTHLY` | Стандарт + AI / month | 1000 |
  | `STRIPE_PRICE_AI_YEARLY` | Стандарт + AI / year | 9600 |

  All four are `per_unit`, and the quantity is the number of active users.
- **Other variables:**
  - `STRIPE_SECRET_KEY` (restricted key: Checkout, Customers, Subscriptions, Billing Portal, Invoices);
  - `STRIPE_WEBHOOK_SECRET`.

  Without the key and all four prices, billing reports `configured: false` (the adapter rule).
- **One Stripe Customer per company,** created at the first checkout with the company name and the director's email as the billing email. It is stored on the company.
- **First payment:** Stripe **Checkout** (`mode: subscription`, line item `{ price, quantity: activeUsers }`, `success_url` and `cancel_url` back to `/settings/billing?checkout=success|cancel`).
- **Changes:** Stripe **Customer Portal**, configured in the dashboard to allow switching between the four prices, cancelling at period end, updating the card and downloading invoices. Atlas opens a portal session; it never updates prices itself.
- **Seats:** `POST /v1/subscriptions/:id` with `items[0][quantity]` and `proration_behavior=create_prorations`, so the difference lands on the next invoice. Atlas never charges immediately.
- **No SDK:** Stripe's REST API is called with `fetch` and form-encoded bodies. The webhook signature (`Stripe-Signature: t=…,v1=…`, HMAC-SHA256 over `t.payload`, 5-minute tolerance, constant-time compare) is verified with Node `crypto`. This avoids a new dependency; the official `stripe` package is the alternative if approved.

### D2. Storage: migration `028_billing.sql`
It follows `027_company_branding.sql` if branding lands first; otherwise the two are renumbered at merge.
```sql
CREATE TABLE company_subscriptions (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  stripe_subscription_id text UNIQUE,
  plan text CHECK (plan IN ('STANDARD', 'STANDARD_AI')),
  period text CHECK (period IN ('MONTH', 'YEAR')),
  status text,                         -- Stripe status: active, past_due, unpaid, canceled, incomplete, …
  quantity integer,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  payment_failed_at timestamptz,       -- set by invoice.payment_failed, cleared by invoice.paid
  last_reminder_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stripe_events (
  id text PRIMARY KEY,                 -- Stripe event id, for idempotency
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
```
- No card data, emails or invoice contents are stored; invoices are read live from Stripe.

### D3. API
`routes/billing.ts`. The webhook lives in `billing/webhook.ts`, mounted before `express.json`.

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/v1/billing` | DIRECTOR | `{ configured, activeUsers, plans: [{ plan, period, unitAmount, currency }], subscription: Subscription \| null }`. `plans` come from Stripe's Prices (cached 1 h), so what is shown is what is charged. |
| `POST /api/v1/billing/checkout` | DIRECTOR | `{ plan, period }` → `{ url }` of a Checkout Session. 409 `BILLING_ALREADY_SUBSCRIBED` when a live subscription exists (use the portal). |
| `POST /api/v1/billing/portal` | DIRECTOR | → `{ url }` of a portal session. 409 `BILLING_NO_CUSTOMER` before the first payment. |
| `GET /api/v1/billing/invoices` | DIRECTOR | the last 12 invoices: `{ number, periodStart, periodEnd, amountDue, amountPaid, currency, status, hostedUrl, pdfUrl }`. |
| `POST /api/stripe/webhook` | Stripe, by signature | raw body; 400 on a bad signature. |
| `GET /api/v1/billing/features` | any signed-in user | `{ ai: boolean }`, for the AI dialog. |

- **Access:**
  - DIRECTOR for everything under `/billing` except `features`;
  - MANAGER and EMPLOYEE get 403 `DIRECTOR_ONLY`, audited as denied;
  - the webhook has no user and trusts only the signature.
- **Webhook events handled** (idempotent by `stripe_events.id`; anything else is acknowledged and ignored):
  - `checkout.session.completed`: link the subscription id to the company (`client_reference_id` = company id);
  - `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`: upsert plan (mapped from the price id), period, status, quantity, `current_period_end` and `cancel_at_period_end`;
  - `invoice.payment_failed`: set `payment_failed_at` and notify directors (D5);
  - `invoice.paid`: clear `payment_failed_at`.
- **Audit:**
  - for requests: `BILLING_CHECKOUT_STARTED { plan, period }` and `BILLING_PORTAL_OPENED`;
  - from the webhook, through `writeAutomationAudit`: `BILLING_SUBSCRIPTION_CHANGED { plan, period, status, quantity }` and `BILLING_PAYMENT_FAILED { invoiceId }`;
  - from the seat sync: `BILLING_SEATS_UPDATED { from, to }`.
- **Realtime:** a change emits `billing:changed` to the company's directors, so an open «Тариф і оплата» refreshes after returning from Stripe.

```ts
// apps/api/src/billing/stripe.ts
export function billingConfigured(): boolean;
export async function stripeRequest<T>(method: "GET" | "POST", path: string, form?: Record<string, string | number>): Promise<T>;
export function verifyStripeSignature(payload: Buffer, header: string | undefined, secret: string, now?: Date): boolean;
export function planOfPrice(priceId: string): { plan: Plan; period: Period } | null;
// apps/api/src/billing/subscription.ts
export type Plan = "STANDARD" | "STANDARD_AI"; export type Period = "MONTH" | "YEAR";
export interface Subscription { plan: Plan; period: Period; status: string; quantity: number; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; paymentFailedAt: string | null }
export async function subscriptionOf(companyId: string): Promise<Subscription | null>;
export async function aiIncluded(companyId: string): Promise<boolean>;
export async function activeUserCount(companyId: string): Promise<number>;
export async function syncSeats(companyId: string): Promise<void>;
export async function remindOverduePayments(now?: Date): Promise<number>;
```

### D4. Features per tariff
`aiIncluded(companyId)` returns:
- true when there is no subscription row, or no `stripe_subscription_id` (never subscribed);
- true when the plan is `STANDARD_AI` and the status is not `canceled` or `incomplete_expired`. `past_due` and `unpaid` keep their features: reminders only.
- false otherwise: «Стандарт», or an ended subscription.

It is used in:
- `POST /ai/analyze`: 403 `PLAN_AI_REQUIRED` before any model call. `GET /ai/analyses` is unchanged.
- `automation/feedback.ts`: `canTriage` becomes `llmConfigured() && await aiIncluded(report.company_id)`; reports simply wait.
- Billing not configured means no rows, so AI works as today.

### D5. Seats and reminders
- **Seats:**
  - after a user is created, disabled or enabled, the route calls `void syncSeats(companyId)` without waiting, logging errors;
  - `syncSeats` compares `activeUserCount` with the stored quantity and updates Stripe only when they differ;
  - a scheduler step `billing` also runs `syncSeats` for every subscribed company, as a safety net for missed calls and Stripe outages. This keeps the spec's «within a minute» at the default interval.
- **Reminders:** the same `billing` step runs `remindOverduePayments`. For a company with `payment_failed_at` set and `last_reminder_at` older than 3 days (or null), it notifies directors and sets `last_reminder_at`.
  - The webhook's first failure notifies at once.
  - The notification is kind `BILLING_PAYMENT_FAILED`, group `alerts`, link `/settings/billing`, with server templates `billing.failedTitle` («Оплата не пройшла») and `billing.failedBody` («Оновіть картку в «Тариф і оплата», щоб продовжити {plan}.»).

### D6. Web
- **Route:** `/settings/billing` (`RoleGate roles={['DIRECTOR']}`) with `pages/BillingPage.tsx`; nav item «Тариф і оплата» (`CreditCard`), director-only.
- **Cards** (the settings screen pattern for a single object):
  1. **Summary:**
     - the tariff name with badges for period and status («Активний», «Оплата прострочена», «Не буде продовжено»);
     - «Користувачів: 21», the next charge date and estimated amount;
     - the actions «Керувати оплатою» (portal) and «Змінити тариф» (portal).
  2. **«Оберіть тариф»**, shown before the first payment: four options in a 2×2 grid with a monthly/yearly toggle. Each shows the per-user price and the total for the current active users, with «Оплатити» opening Checkout.
  3. **«Рахунки»:** read-only rows (period, amount, status, «PDF»).
- **Return from Stripe:** `?checkout=success` shows «Оплату отримано, оновлюємо статус…» and refreshes on `billing:changed`, or polls `GET /billing` every 3 s for 30 s. `?checkout=cancel` shows «Оплату не завершено».
- **Unconfigured:** the screen says «Оплату не налаштовано на сервері» with no actions.
- **AI dialog:** `AiAnalysisDialog` reads `GET /billing/features`. When AI isn't included, «Сформувати» is replaced with the tariff hint (and a link for directors).
- **Dashboard:** directors with no subscription and billing configured see a dismissible prompt «Оберіть тариф» (dismissal is remembered in `localStorage`, a per-browser convenience).
- **Demo mode:** `lib/billing.ts` has a demo backend in memory: «Стандарт + AI», yearly, active, 6 users, two sample invoices; Checkout and portal show a notice instead of redirecting.
- **Translations:** a `billing` namespace in uk, ru and en; `shell:nav.billing`; `ai:planRequired`.
- **Money:** amounts are shown with `Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })`. The UAH formatter is not reused.

## Files

| File | Change |
|---|---|
| `database/028_billing.sql` | tables (D2) |
| `apps/api/src/config.ts` | `STRIPE_*` variables |
| `apps/api/src/billing/stripe.ts` | REST client, signature, price mapping |
| `apps/api/src/billing/subscription.ts` | state, `aiIncluded`, seats, reminders |
| `apps/api/src/billing/webhook.ts` | event handling |
| `apps/api/src/routes/billing.ts` | director endpoints, features |
| `apps/api/src/app.ts` | the raw webhook before `express.json`; the billing router |
| `apps/api/src/routes/team.ts`, `routes/teamAdmin.ts` | `syncSeats` after create, disable and enable |
| `apps/api/src/routes/ai.ts` | `PLAN_AI_REQUIRED` |
| `apps/api/src/automation/feedback.ts` | triage only with AI |
| `apps/api/src/automation/scheduler.ts` | the `billing` step |
| `apps/api/src/notifications/notify.ts` | kind `BILLING_PAYMENT_FAILED` → `alerts` |
| `apps/api/src/i18n/{uk,ru,en}.ts` | reminder templates |
| `apps/web/src/lib/billing.ts` | API client, demo backend, plan maths |
| `apps/web/src/pages/BillingPage.tsx` | the screen |
| `apps/web/src/components/AiAnalysisDialog.tsx` | tariff hint |
| `apps/web/src/pages/DashboardPage.tsx` | director prompt |
| `apps/web/src/components/AppShell.tsx`, `App.tsx` | nav item, route |
| `apps/web/src/i18n/{uk,ru,en}/billing.ts` and others | texts |
| `docs/decisions/0007-billing-with-stripe.md` | USD billing via Stripe, no SDK, reminders only |
| `docs/external/README.md`, `docs/OPERATIONS.md` | variable names, Stripe dashboard setup (prices, portal, webhook URL and events) |

## Call stacks
- **First payment:** `BillingPage` «Оплатити» → `POST /billing/checkout`:
  1. `requireRoles("DIRECTOR")`;
  2. `billingConfigured()`;
  3. a Customer is created if missing;
  4. `POST /v1/checkout/sessions` (`client_reference_id` = company, `subscription_data.metadata.companyId`, quantity = `activeUserCount`);
  5. audit;
  6. `{ url }` → `window.location.assign(url)`.

  Then: Stripe → `POST /api/stripe/webhook` → `verifyStripeSignature` → `stripe_events` insert (or skip as a duplicate) → `checkout.session.completed` / `customer.subscription.created` → upsert `company_subscriptions` → automation audit → emit `billing:changed` → `BillingPage` refreshes.
- **Adding an employee:** `POST /team` → the user is inserted → `void syncSeats(company)` → quantity 20 ≠ 21 → `POST /v1/subscriptions/:id` (quantity 21, `create_prorations`) → stored quantity → audit `BILLING_SEATS_UPDATED`.
- **Failed renewal:** webhook `invoice.payment_failed` → `payment_failed_at` → `notify(directors, BILLING_PAYMENT_FAILED)`. Every automation tick runs `remindOverduePayments`, which notifies again after 3 days. `invoice.paid` clears it.
- **AI analysis on «Стандарт»:** `POST /ai/analyze` → `aiIncluded` is false → 403 `PLAN_AI_REQUIRED`, and the model is not called.

## Test plan
- **API unit (`billing/stripe.test.ts`):**
  - «accepts a valid signature, rejects a changed body, a wrong secret and a timestamp older than 5 minutes»;
  - «maps each configured price id to plan and period».
- **API integration (`routes/billing.integration.test.ts`; Stripe faked with a replaceable request function, as `setPushSender`):**
  - «reports billing as not configured without keys, and AI stays available»;
  - «gives a director the plans from Stripe and a checkout URL with the active-user quantity»;
  - «refuses a manager and an employee with 403 and audits it»;
  - «stores the subscription from webhook events once, even when an event is delivered twice»;
  - «rejects a webhook with a bad signature without changing anything»;
  - «updates the seat count when a user is added, disabled and re-enabled»;
  - «refuses a new AI analysis on Стандарт with PLAN_AI_REQUIRED without calling the model, keeps old analyses readable»;
  - «leaves problem reports untriaged on Стандарт»;
  - «notifies directors at a failed payment and again after 3 days, and stops after invoice.paid»;
  - «keeps AI on while a Стандарт + AI payment is overdue».
- **Web (`BillingPage.test.tsx`, demo mode and a mocked API):**
  - «shows the four prices and the totals for the active users»;
  - «sends the director to Stripe with the chosen tariff and period»;
  - «shows the overdue warning and the manage-payment action»;
  - «says payments are not configured»;
  - «a manager has no item and is redirected»;
  - «the AI dialog on Стандарт shows the tariff hint instead of Сформувати».
- **i18n:** the dictionaries test covers the `billing` namespace.

## Risks / Trade-offs
- **Webhook delivery:** the subscription row lags Stripe by seconds. The success return polls, and a missed webhook is retried by Stripe for days.
- **Seat sync race:** two quick user changes could both send updates; the last write wins, and the safety-net step reconciles. Stripe accepts setting a quantity idempotently.
- **Test vs live keys:** atlas-dev must use Stripe **test** keys and prices; production uses live ones. This is documented in `OPERATIONS.md`.
- **Security:**
  - the secret key never reaches the web;
  - the webhook trusts only the signature;
  - Checkout and portal URLs are short-lived and fetched per click.

## Migration Plan
- 028 adds tables only. Deploy with billing unconfigured (no change for users), set the Stripe variables, then the director subscribes.
- Rollback: remove the variables; AI and everything else work as before.

## Least confident decisions
1. **«$5/user yearly» is read as $5 per user per month, charged $60 per user per year** (likewise $8 → $96). If you meant $5 per user per *year*, the yearly prices change in Stripe only, not in code.
2. **AI stays on until the first subscription.** This keeps today's behaviour and the overdue rule («reminders only»), but means AI is free if nobody ever subscribes. The alternative is AI off until a «Стандарт + AI» payment.
3. **Proration on the next invoice** (`create_prorations`) rather than charging the extra seats immediately. It's gentler, but a large mid-year team growth on a yearly plan is paid only at the next invoice.
4. **Plan changes only through Stripe's portal.** Less UI to build, but the director leaves Atlas to change tariffs.
5. **No Stripe SDK.** Fewer dependencies, but the signature check and form encoding are ours to maintain.
6. **Problem-report AI translation follows the customer's tariff,** though those reports serve the development team. Kept because you asked for all AI features.
