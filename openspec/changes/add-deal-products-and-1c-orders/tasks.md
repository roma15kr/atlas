# Tasks

## 1. Tracer bullet: one product in a deal

- [ ] 1.1 Migration 029, `catalogue/bpi.ts` (fetch, cache, search), `GET /catalogue/products`, `GET`/`PUT /deals/:id/products` with server-side prices and the deal value following the lines, audit. The deal card's «Товари» with `DealProductsDialog`, in three languages, with a demo backend. Verify these tests:
  - «adds catalogue products with server-side names, codes and prices, and the deal value follows»;
  - access (view-only refused, 404 outside scope);
  - «a manager adds two products and the amount becomes their sum».

  Commit.

## 2. Pricing details

- [ ] 2.1 Box lines (box code and price), price change and discount %, the read-only amount field with products, and the catalogue-unavailable message. Verify these tests:
  - «uses the box code and price for a box line, with a discount»;
  - the read-only amount field;
  - the catalogue-unavailable message (API and web).

  Commit.

## 3. Creating the order in BPI

- [ ] 3.1 The BPI `add-order` client with a replaceable transport, `POST /deals/:id/orders` with the access rules, the BPI staff list and name matching (`bpiManagers.ts`) with the director's «Менеджер у BPI» select, audit, «Створити замовлення» and the order badge. Verify these tests:
  - «creates the order in BPI with the client, the lines…, then locks the deal»;
  - «makes exactly one BPI call and no other outside request»;
  - the refusal cases;
  - the name matcher on today's 11 BPI staff names, and a director's choice kept over the automatic match;
  - web: «creates the order and shows the BPI number».

  Commit.

## 4. Reliability

- [ ] 4.1 The scheduler step `erp-orders`: retries with growing pauses, the duplicate check by the comment marker (with the «Перевірте в BPI» fallback if BPI returns no comments), `FAILED` after 24 h with a notification, and «Спробувати ще». Verify these tests:
  - «queues the order when BPI is down and creates it once later»;
  - «adopts the order a timed-out call already created…»;
  - «marks it failed after 24 hours…».

  Commit.

## 5. Changing a sent order

- [ ] 5.1 Lock after creating, «Змінити замовлення», creating a new order that names the old one, and the order history. Verify: «unlocks and creates a new order that names the one it replaces», and web: «a locked deal offers Змінити замовлення». Commit.

## 6. Docs and live check

- [ ] 6.1 ADR 0008, `docs/external/README.md` (`BPI_URL`), the BPI manager ids step in `docs/OPERATIONS.md`, `docs/ARCHITECTURE.md` and `STATUS.md`. Run `make check`, `npm run build` and `npx openspec validate add-deal-products-and-1c-orders --strict`. Commit.
- [ ] 6.2 Live check: confirm the automatic BPI matches for the team, create one real order from a deal, and confirm it appears in BPI with the right lines. Verify that BPI shows the order.
