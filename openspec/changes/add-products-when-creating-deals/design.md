# Design: Products when creating a deal

## Context
- **`POST /deals`:** `createDeal()` in `routes/deals.ts` validates `dealInputSchema` and inserts the deal. It is shared with the mail and Telegram «Нова угода з…» flows.
- **Deal products today** (`routes/dealOrders.ts`): `PUT /deals/:id/products` resolves each `bpiProductId` through `catalogueProduct()` and stores a snapshot of the name, code, catalogue price and unit price. It then sets `deals.value` to the sum.
- **Web:** `DealDialog` in `pages/SalesPage.tsx` builds a `Deal` and calls `addDeal` (`AppContext`, with a demo branch). The picker lives inside `DealProductsDialog` (`components/sales/DealProducts.tsx`).

## Decisions

### D1. One request, one transaction
- `POST /deals` accepts an optional `lines` array with the same schema as `PUT /deals/:id/products` (`lineInput`, at most 100 lines).
- The line resolution is moved out of the PUT handler into `resolveLines(lines)` in `erp/dealLines.ts`, used by both routes.
- `createDeal()` resolves the lines **before** inserting. A missing product answers 400 `CATALOGUE_PRODUCT_NOT_FOUND`, and an unreachable catalogue 503 `CATALOGUE_UNAVAILABLE`, so no deal is created.
- **Then, in one transaction:** insert the deal (value = sum of lines when there are any), insert the lines, and audit `DEAL_CREATED { funnelId, lines }`.
- **Mail and Telegram:** these flows pass no `lines`, so nothing changes for them.
- **Access:** unchanged; creating a deal already requires a visible client and a manageable owner. The lines need nothing more, because the catalogue is readable by every signed-in user.

### D2. One product editor, two places
- The draft list and the search inside `DealProductsDialog` become `ProductLinesEditor` (`components/sales/ProductLinesEditor.tsx`), a controlled component with `{ drafts, onChange }`. It contains the search, the result list, the line inputs and the total.
- `DealProductsDialog` wraps it, as today.
- `DealDialog` adds it as a «Товари» section under the main fields. While it has drafts, the «Сума» input is read-only and shows the drafts' total, with the hint «Сума рахується з товарів».
- `addDeal(input, lines?)` sends `lines` with `POST /deals`. In demo mode, it creates the deal and puts the lines into the demo products store.

### D3. Errors keep the dialog open
A 400 or 503 is shown in the dialog with the same texts as the deal card (`orders:errors.*`), and the typed fields and drafts stay.

## Files

| File | Change |
|---|---|
| `apps/api/src/erp/dealLines.ts` | `resolveLines()`, `insertLines()` (shared) |
| `apps/api/src/routes/dealOrders.ts` | PUT uses the shared helpers |
| `apps/api/src/routes/deals.ts` | `POST /deals` accepts `lines`, one transaction |
| `apps/web/src/components/sales/ProductLinesEditor.tsx` | the editor, extracted |
| `apps/web/src/components/sales/DealProducts.tsx` | the dialog uses the editor |
| `apps/web/src/pages/SalesPage.tsx` | «Товари» in `DealDialog`, read-only amount with lines |
| `apps/web/src/context/AppContext.tsx` | `addDeal(input, lines?)`, demo branch |
| `apps/web/src/lib/dealOrders.ts` | demo: put lines for a new deal |

## Call stack
«Нова угода» with products → `addDeal(input, lines)` → `POST /deals { …, lines }`:
1. `createDeal`: the existing checks, then `resolveLines`;
2. in one transaction: insert the deal (value = sum), insert the lines;
3. audit, and notify the new owner;
4. the response, which carries `productCount`, so the card shows the products immediately.

## Test plan
- **API (`erpOrders.integration.test.ts`):**
  - «creates a deal with products in one step, the value is their sum»;
  - «creates no deal when a product is missing from the catalogue»;
  - «mail and Telegram deals stay amount-only» (`createDeal` without lines is unchanged);
  - «PUT still works through the shared helper» (the existing tests keep passing).
- **Web (`DealProducts.test.tsx`):**
  - «a manager adds products in Нова угода and the amount fills in, read-only»;
  - «the new deal's card shows the products straight away»;
  - «without products the amount is typed as before».

## Least confident decisions
1. **Products in the creation dialog** make it taller. The section starts collapsed as «Додати товари» rather than showing the search straight away, so the dialog stays short for deals without products.
