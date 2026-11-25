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

## 3. Sending to 1C

- [ ] 3.1 `erp/orderXml.ts` (golden-file test against b2b's tag order, escaping), the BPI `add-order` client, the replaceable `erp/exchange.ts` uploader (`.part` then rename), `POST /deals/:id/orders` with access rules, `bpi_manager_id` in the member dialog, audit, «Передати в 1С» and the order badge. Verify these tests:
  - the «sends an order» integration test;
  - the refusal cases (no products, no client, no BPI manager id);
  - web: «sends to 1C and shows the order number».

  Commit.
- [ ] 3.2 Add the protocol library once the exchange server's protocol is known (`ssh2-sftp-client` or `basic-ftp`, approved), and `ONEC_EXCHANGE_*` config with «not configured». Verify: «reports not configured and still saves products», and an upload test against a local SFTP/FTP test server if one is available; otherwise the faked uploader. Commit.

## 4. Reliability

- [ ] 4.1 Add the scheduler step `erp-orders`: retries with growing pauses, `FAILED` after 24 h with a notification, the no-duplicate BPI create, and «Спробувати ще». Verify these tests:
  - «queues the upload when the server is down and delivers it later under the same number»;
  - «marks it failed after 24 hours and notifies the sender»;
  - «never creates a second BPI order…».

  Commit.

## 5. Changing a sent order

- [ ] 5.1 Lock after sending, «Змінити замовлення», re-sending as a new order that names the old one, and the order history. Verify: «unlocks and re-sends a new order that names the one it replaces», and web: «a locked deal offers Змінити замовлення». Commit.

## 6. Docs and live check

- [ ] 6.1 ADR 0008, `docs/external/README.md` (`BPI_URL`, `ONEC_EXCHANGE_*`), the setup steps in `docs/OPERATIONS.md`, `docs/ARCHITECTURE.md` and `STATUS.md`. Run `make check`, `npm run build` and `npx openspec validate add-deal-products-and-1c-orders --strict`. Commit.
- [ ] 6.2 Live check with the 1C admin: set the exchange settings in Coolify, set one manager's BPI id, send one real order, and confirm 1C imported it with the right lines. Verify that 1C shows the order.
