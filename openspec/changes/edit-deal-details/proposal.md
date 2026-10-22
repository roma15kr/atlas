# Proposal

## Why

**Problem.** A deal's amount, probability, expected close date and title are set when it is created and cannot be changed afterwards. A card on «Воронка» opens only its notes. A manager whose client changes the order size has to write it in the notes or create a new deal, so the funnel sums and forecasts go wrong.

**Evidence.** Бабенко Станіслав, 2026-10-19: «В воронке продаж можно вносить корректировки? Заметки корректировать можно, а если мне нужно откорректировать сумму, процент вероятности, дату закрытия?» The API already accepts these changes; only the screen is missing.

**Follow-up evidence.** Бабенко, 2026-10-22, after using the new window: «Внеси корректировки, пожалуйста. Возможность корректировать контрагента» — a deal created for the wrong client could not be moved to the right one.

**Success metric.** Бабенко changes the amount, probability and close date of a deal they own in under 30 seconds, and the funnel totals update at once.

## What Changes

- **A deal window:** clicking a deal card on «Воронка» opens «Сделка». It shows the deal's fields and its notes, with «Изменить».
- **Fields anyone who may edit the deal can change:** title, client (контрагент), amount (₴), probability (%), expected close date, and stage.
- **Client choice:** the client list offers the clients the person may see, the same rule as when creating a deal.
- **Owner:** heads and directors can also change the owner, as on creation. An employee sees the owner but can't change it.
- **Notes:** they stay in the same window, edited as today. The separate notes dialog is replaced.
- **Access and audit:** unchanged. Whoever can edit the deal (its owner, their head, a director) can change these fields. Anyone else gets the existing 404, and every change is audited as `DEAL_UPDATED` with the changed field names.

## Announcement

You can now correct a deal after creating it: click its card on «Воронка», then «Изменить», to update the client, amount, probability, close date, title or stage. The funnel totals follow straight away.

## Non-goals

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
- **API:**
  - `PATCH /api/v1/deals/:id` also accepts `clientId`, checked with `assertClientVisible` like creation (a client the caller can't see answers 404 `CLIENT_NOT_FOUND`);
  - integration tests cover the employee and head cases.
