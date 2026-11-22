# Proposal: Tariffs and card payments (Stripe)

## Problem
«I need to create tariffs, available for the director only. $5 per user for yearly billing and $7 per user for monthly payments for the regular tariff without AI, and $8 per user yearly and $10 per user monthly for the tariff with AI. Via the Stripe API.» Today Atlas has no notion of a paid plan: every feature, AI included, is always on, and there is no way to pay for it inside the app.

## Evidence
- The director's request in the working session on 2026-11-22 (no inbox report).
- AI analysis runs on OpenAI and costs money per request (`docs/external/README.md`); today nothing ties that cost to what the company pays.

## Success metric
The company has an active, paid Stripe subscription within two weeks of release, and its charged quantity equals the number of active users on every invoice. Measured from the stored subscription and Stripe invoices.

## Why
Paying by card from inside Atlas, with the price following the number of people actually using it, removes manual invoicing. Tying AI to its own tariff lets the company decide whether the AI features are worth their extra price.

## What Changes
- **Two tariffs, each billed monthly or yearly, priced per active user per month** (USD, charged by Stripe):

  | | Billed monthly | Billed yearly |
  |---|---|---|
  | «Стандарт» (without AI) | $7 / user / month | $5 / user / month ($60 / user / year) |
  | «Стандарт + AI» | $10 / user / month | $8 / user / month ($96 / user / year) |

- **A director-only «Тариф і оплата» screen** shows:
  - the current tariff, billing period and status;
  - the number of paid users;
  - the next charge date and amount;
  - the card on file and past invoices.

  From there the director can:
  - choose or change a tariff and period, paying on Stripe's secure page;
  - update the card, or download invoices and receipts;
  - cancel, which keeps the tariff until the end of the paid period.
- **Seats follow the team:** adding, disabling or re-enabling an employee changes the paid quantity. Stripe adds the difference for the rest of the period to the next invoice.
- **The AI tariff controls the AI features:**
  - with «Стандарт» (without AI), AI analysis is unavailable and shows which tariff includes it;
  - new problem reports are kept but not translated or summarised by AI.

  Rule-based signals, reminders and everything else keep working on both tariffs.
- **Overdue payments only remind:** when a charge fails, directors get a notification, repeated every 3 days while unpaid, and a warning on the screen. Atlas keeps working for everyone.
- **Before the first payment, Atlas works as today,** AI included, and the director sees a prompt to choose a tariff.
- Every billing action is recorded in the audit log.

## Capabilities

### New Capabilities
- `billing`: the tariffs and their prices, the «Тариф і оплата» screen, who may manage it, payment and renewal through Stripe, seats following active users, what each tariff includes, failed-payment reminders, and behaviour when billing isn't configured.

### Modified Capabilities
- `alerts-ai`: AI analysis is available only when the company's tariff includes AI (an added requirement).

## Non-goals
- Selling Atlas to other companies, or a platform-owner level above directors.
- Restricting or blocking anyone for non-payment.
- Free trials, coupons, discounts and promo codes.
- Payment methods other than cards and wallets on Stripe's page.
- Prices in hryvnia, and VAT or tax calculation, beyond what Stripe's settings do.
- Per-department or per-person tariffs.

## Announcement
Atlas now has tariffs you can pay for by card right in the app. In «Тариф і оплата» the director chooses «Стандарт» or «Стандарт + AI», monthly or yearly (yearly is cheaper), and pays on Stripe's secure page. You only pay for active employees: when someone joins or is disabled, the next invoice follows. The AI analysis is part of «Стандарт + AI»; everything else works on both tariffs.

## Impact
- **API:**
  - Stripe adapter (reported «disabled» without server keys);
  - Stripe webhook;
  - subscription state per company;
  - seat updates when users change;
  - an AI check in the analysis and problem-report processing;
  - reminders.
- **Web:** a new director-only screen and navigation item; the AI analysis dialog shows the tariff hint; the dashboard prompt for directors.
- **Database:** one new migration.
- **External:** a Stripe account with four prices, its secret key and webhook secret set in Coolify.
- **Docs:**
  - an ADR on billing in USD through Stripe (Atlas's UAH-only rule covers deals, not this);
  - `docs/external/README.md` with the new variable names.
- **Translations:** new texts in Ukrainian, Russian and English.
