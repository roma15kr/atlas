# Tasks

## 1. Server: create a deal with its products

- [ ] 1.1 Move line resolution and insertion into `erp/dealLines.ts` and use them in `PUT /deals/:id/products`; `POST /deals` accepts optional `lines`, resolved first and inserted with the deal in one transaction. Verify these tests:
  - «creates a deal with products in one step, the value is their sum»;
  - «creates no deal when a product is missing from the catalogue»;
  - all existing deal and order tests pass.

  Commit.

## 2. Web: products in «Нова угода»

- [ ] 2.1 Extract `ProductLinesEditor` from `DealProductsDialog`, add it to `DealDialog` as a collapsed «Додати товари» section, make the amount follow the drafts (read-only), and have `addDeal` send the lines (demo branch included). Verify these tests:
  - «a manager adds products in Нова угода and the amount fills in, read-only»;
  - «the new deal's card shows the products straight away»;
  - «without products the amount is typed as before».

  Commit.

## 3. Checks

- [ ] 3.1 Run `make check`, `npm run build` and `npx openspec validate add-products-when-creating-deals --strict`; update `STATUS.md`. Commit.
