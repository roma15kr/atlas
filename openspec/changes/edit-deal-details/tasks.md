# Tasks

## 1. Edit a deal from the funnel

- [ ] 1.1 Add API integration cases for the existing `PATCH /deals/:id`: an employee changes amount, probability and close date of their own deal (audited `DEAL_UPDATED` with field names); an employee gets 404 on a colleague's deal; an employee can't change the owner; a head can. Fix anything that fails. Commit.
- [ ] 1.2 Add the `updateDeal` workspace action (with a demo branch) and the «Сделка» window replacing the notes dialog. Verify `SalesPage` tests: an employee opens a card, changes amount and probability, and the column total changes; no owner input for an employee; notes still save. Commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate edit-deal-details --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check with a manager account on atlas-dev, `dev` → `main`, live check with Бабенко, archive.
