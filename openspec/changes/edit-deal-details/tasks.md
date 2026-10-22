# Tasks

## 1. Edit a deal from the funnel

- [x] 1.1 Add API integration cases for the existing `PATCH /deals/:id`: an employee changes amount, probability and close date of their own deal (audited `DEAL_UPDATED` with field names); an employee gets 404 on a colleague's deal; an employee can't change the owner; a head can. Fix anything that fails. Commit.
- [x] 1.2 Add the `updateDeal` workspace action (with a demo branch) and the «Сделка» window replacing the notes dialog. Verify `SalesPage` tests: an employee opens a card, changes amount and probability, and the column total changes; no owner input for an employee; notes still save. Commit.

- [x] 1.3 Let the deal's client be changed: accept `clientId` in `PATCH /deals/:id` (visible clients only, audited by field name), and add a «Клиент» select to «Изменить сделку» (the demo mirrors it). Verify cases: an employee moves their deal to another client of theirs and the card shows the new company; a client outside their scope answers 404 `CLIENT_NOT_FOUND` and nothing changes; `SalesPage.test.tsx` picks a new client. Commit.

## 2. Integration checks

- [x] 2.1 Run `make check` and `npm run build`; verify both pass.
- [x] 2.2 Run `npx openspec validate edit-deal-details --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check with a manager account on atlas-dev, `dev` → `main`, live check with Бабенко, archive.
