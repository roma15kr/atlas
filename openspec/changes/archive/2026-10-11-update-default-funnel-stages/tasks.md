# Tasks

## 1. Default funnel for a new company (API)

- [x] 1.1 In `apps/api/src/bootstrap.test.ts`, assert that the default-funnel statement creates Квалификация, Коммерческое предложение, Согласование условий, Заказ и поставка (`OPEN`), Отгрузка (`WON`) and Проиграна (`LOST`) in that order. Verify the test fails against the current stages.
- [x] 1.2 Replace the stages in `ensureDefaultCatalogs` (`apps/api/src/bootstrap.ts`), keeping the colors by position, and verify `cd apps/api && npx vitest run src/bootstrap.test.ts` passes. The existing "only for companies without one" assertion keeps existing companies untouched.

## 2. Demo mode (web)

- [x] 2.1 Rename the demo main-funnel stages in `apps/web/src/data/demo.ts` to the same six names and outcomes (`Заказ и поставка` stays `OPEN`). Update the demo-funnel assertions in `apps/web/src/App.test.tsx` that look for «Переговоры» to «Коммерческое предложение», and verify `cd apps/web && npx vitest run src/App.test.tsx` passes.

## 3. Integration checks

- [x] 3.1 Run `make check` and `npm run build`; verify both pass.
- [x] 3.2 Run `npx openspec validate update-default-funnel-stages --strict` and `npx openspec validate sales-pipeline --type spec --strict`; verify both pass. (`--all` fails on 13 older specs and changes with long requirement texts; tracked in STATUS.md.)

## Workflow follow-up

- Archive the change after review; the live company's funnel was already renamed by hand on 2026-10-11.
