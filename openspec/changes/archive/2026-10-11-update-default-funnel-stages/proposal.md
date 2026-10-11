# Proposal

## Why

**Problem.** "Our sales go from qualification to a commercial offer, then we agree terms, then the order is placed and shipped. The funnel Atlas gives us talks about applications and invoices, so every new setup starts by renaming stages."

**Evidence.** The team asked for this on 2026-10-11 while moving the live Atlas to real data. The company's main funnel was then renamed by hand to Квалификация → Коммерческое предложение → Согласование условий → Заказ и поставка → Отгрузка → Проиграна. The starting funnel and the demo still show the old stages.

**Success metric.** No stage renames are needed after a fresh start: a new installation gets zero stage-update audit events on its default funnel in its first week. Count them in the audit log.

## What Changes

- The funnel a company gets automatically (when it has none) has six stages, in order:
  - Квалификация, Коммерческое предложение, Согласование условий, Заказ и поставка (all open);
  - Отгрузка (won);
  - Проиграна (lost).
- "Заказ и поставка" is open: a deal there is still in progress. Previously the fourth stage, "Оплата", counted as won.
- The demo mode shows the same stages.
- Companies that already have a funnel keep their stages unchanged.

## Announcement

New Atlas installations now start with a sales funnel that matches how we sell: Квалификация, Коммерческое предложение, Согласование условий, Заказ и поставка, Отгрузка and Проиграна. A deal counts as won only once it reaches "Отгрузка". Your existing funnels are not touched. You can still rename, reorder or add stages at any time in the funnel settings.

## Non-goals

- Changing funnels that already exist, including renaming stages of existing companies.
- New stage features (probabilities per stage, required fields, automation).
- Translating stage names that a director entered by hand.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sales-pipeline`: adds a requirement for the stages of the funnel a company receives automatically.

## Impact

- Only new companies (first start of an installation) and the demo mode see the change.
- No data migration. Existing deals and stages are unaffected.
