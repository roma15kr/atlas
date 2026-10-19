# Proposal

## Why

**Problem.** A deal's amount, probability, expected close date and title are set when it is created and cannot be changed afterwards. A card on «Воронка» opens only its notes. A manager whose client changes the order size has to write it in the notes or create a new deal, so the funnel sums and forecasts go wrong.

**Evidence.** Бабенко Станіслав, 2026-10-19: «В воронке продаж можно вносить корректировки? Заметки корректировать можно, а если мне нужно откорректировать сумму, процент вероятности, дату закрытия?» The API already accepts these changes; only the screen is missing.

**Success metric.** Бабенко changes the amount, probability and close date of a deal they own in under 30 seconds, and the funnel totals update at once.

## What Changes

- **A deal window:** clicking a deal card on «Воронка» opens «Сделка». It shows the deal's fields and its notes, with «Изменить».
- **Fields anyone who may edit the deal can change:** title, amount (₴), probability (%), expected close date, and stage.
- **Owner:** heads and directors can also change the owner, as on creation. An employee sees the owner but can't change it.
- **Notes:** they stay in the same window, edited as today. The separate notes dialog is replaced.
- **Access and audit:** unchanged. Whoever can edit the deal (its owner, their head, a director) can change these fields. Anyone else gets the existing 404, and every change is audited as `DEAL_UPDATED` with the changed field names.

## Announcement

You can now correct a deal after creating it: click its card on «Воронка», then «Изменить», to update the amount, probability, close date, title or stage. The funnel totals follow straight away.

## Non-goals

- Changing a deal's client (create a new deal instead).
- A history of the old values (the audit log records which fields changed).
- Deleting deals from this window.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sales-pipeline`: a deal's details can be edited after creation from the funnel.

## Impact

- **Web:**
  - a «Сделка» window in `SalesPage` (view and edit), replacing the notes dialog;
  - an `updateDeal` action in `AppContext`, with a demo branch.
- **API:** none. The existing `PATCH /api/v1/deals/:id` is used, and integration tests cover the employee and head cases.
