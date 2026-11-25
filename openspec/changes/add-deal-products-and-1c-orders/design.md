# Design: Products in deals and orders to 1C

## Context
- **Deals:**
  - `deals.value numeric(14,2)` (migration 001), edited through `PATCH /deals/:id` (`routes/deals.ts`);
  - visibility via `dealScope` plus funnel access; edit rules in the same route;
  - web: `pages/SalesPage.tsx` (`DealDetailsDialog`, `DealDetailsForm`).
- **Catalogue:** `GET https://bpi.rdim.ua/prods/price`, without authentication, returns `[{ id, name, code, codebox, price, pricebox, number }]` (265 items; prices in whole UAH, `number` = stock). `search-product` and `prod-url/…` exist but aren't needed.
- **b2b order flow** (`b2b.rdim.ua/deploy/engine/order.php`):
  1. `POST https://bpi.rdim.ua/add-order` with `{ name, user_id, phone, organization, manager_id, delivery, payment_status, execution_status, goods[{id, art, name, url, image, number, price, power, length, box}], sum_total, date, town, address, sum_np, comment }` → `{ id, manager_id }`;
  2. then the XML `<data><id_order/><client/><login/><email/><ship/><city/><sklad/><tel/><prim/><manager/>…<tovs><itemN><id/><art/><name/><col/><sum/></itemN></tovs></data>`, written to `SYNC_1C_DIR/orders/<id>.xml`.
  - b2b never fills the manager fields (it reads an undefined `$manager`), and it doesn't escape text.
- **Servers:** b2b and BPI run on another server than Atlas, and b2b has no 1C folder mounted. 1C reads its exchange folder over FTP/SFTP (the director's answer).
- **Background work:** `automation/scheduler.ts` steps under an advisory lock, as for billing and feedback.

## Decisions

### D1. Catalogue: BPI, cached in memory, never stored as truth
- `catalogue/bpi.ts`:
  - `fetchCatalogue()` with a 10 s timeout, cached for 1 h (stale cache served when BPI fails);
  - `searchCatalogue(query, limit)` searches name and code, case- and accent-insensitively.
- **Prices:** BPI's are whole UAH. Lines store `numeric(14,2)`.
- **Snapshots:** each line keeps its own name, code and price when it is added, so later catalogue changes don't rewrite old deals (spec).

### D2. Storage: migration `029_deal_products_orders.sql`
```sql
CREATE TABLE deal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  position integer NOT NULL,
  bpi_product_id integer NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  code text NOT NULL,                 -- 1C code: codebox when by_box
  by_box boolean NOT NULL DEFAULT false,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  catalogue_price numeric(14,2) NOT NULL CHECK (catalogue_price >= 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),   -- after the manager's change or discount
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deal_products_deal_idx ON deal_products (deal_id, position);

CREATE TABLE deal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  bpi_order_id integer,               -- set once BPI answers; never requested twice for the same row
  replaces_order_id integer,
  status text NOT NULL CHECK (status IN ('CREATING', 'UPLOADING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,                    -- short technical reason, no customer data
  xml text,                           -- the exact file, kept for retries and support
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX deal_orders_deal_idx ON deal_orders (deal_id, created_at DESC);
ALTER TABLE deals ADD COLUMN products_locked boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN bpi_manager_id integer;   -- set by a director in the member dialog
```
- `deals.value` is recomputed in the same transaction whenever lines change. With no lines left, the value stays where it was and becomes editable again.

### D3. API
| Method and path | Who | Purpose |
|---|---|---|
| `GET /catalogue/products?query=&limit=` | any signed-in user | search the catalogue; 503 `CATALOGUE_UNAVAILABLE` without BPI or a cache |
| `GET /deals/:id/products` | whoever can see the deal | lines |
| `PUT /deals/:id/products` | whoever can edit the deal | replace all lines `{ lines: [{ bpiProductId, byBox, quantity, unitPrice? , discountPercent? }] }`; the name, code and catalogue price come from the catalogue on the server, never from the client; 409 `DEAL_ORDER_LOCKED` |
| `POST /deals/:id/orders` | owner, covering manager, director | send |
| `POST /deals/:id/orders/unlock` | the same | «Змінити замовлення» |
| `POST /deals/:id/orders/:orderId/retry` | the same | retry a FAILED upload |
| `GET /deals/:id/orders` | whoever can see the deal | the order history `{ bpiOrderId, status, sentAt, sentBy, replacesOrderId, lastError }` |
| `GET /orders/1c/status` | any signed-in user | `{ configured }` for the button |

- **Access:**
  - visibility uses `dealScope` and funnel access, as today, so a deal outside scope answers 404;
  - editing follows the existing `PATCH /deals/:id` rule;
  - sending: EMPLOYEE only for their own deals, MANAGER for the departments they cover, DIRECTOR any. A visible deal you may not send answers 403, audited `DEAL_ORDER_DENIED`.
- **Audit (ids only):** `DEAL_PRODUCTS_UPDATED { dealId, lines }`, `DEAL_ORDER_SENT { dealId, orderId, bpiOrderId }`, `DEAL_ORDER_FAILED { dealId, orderId }`, `DEAL_ORDER_UNLOCKED`.

### D4. Sending: create in BPI once, then upload with retries
- **`POST /deals/:id/orders`:**
  1. Check the client and lines.
  2. Insert `deal_orders` (`CREATING`) and lock the deal (`products_locked = true`).
  3. Call BPI `add-order` with:
     - `user_id` and `manager_id`: the sender's `bpi_manager_id`. A manager ordering for a customer, as in b2b when `userId == managerId`;
     - `organization`: the client's company; `name`: the contact; `phone`;
     - `goods` from the lines (`price` rounded to whole UAH for BPI, which stores integers; the XML keeps kopecks);
     - `sum_total`, `date`, and `comment`, which adds «Atlas: угода <title>» and «замінює № …» when re-sending.
  4. Store `bpi_order_id`, build the XML, and set the status to `UPLOADING`.
  5. Try one upload inline. On success the status is `SENT`; otherwise the response is 202 with «Очікує передачі».
- **Without `bpi_manager_id`:** sending is refused with 409 `BPI_MANAGER_REQUIRED` («Директор має вказати ваш ID менеджера в BPI»), because BPI needs a manager. Directors set the id in «Змінити співробітника».
- **Scheduler step `erp-orders`:**
  - retries `UPLOADING` rows whose `next_attempt_at` has passed, with pauses of 1, 2, 4, 8, 15, 30 and then 60 minutes;
  - after 24 h, marks them `FAILED` and notifies the sender (`DEAL_ORDER_FAILED`, group `alerts`).
  - A `CREATING` row whose BPI call failed is retried by the same step without duplicating: the row id goes in BPI's `comment`, and before creating again the step checks BPI `last-order` for that marker.
- **XML** (`erp/orderXml.ts`): b2b's tags in the same order, each value escaped with an `escapeXml` function. The manager tags are filled in, from the sender's name, phone and email. `sum` is the unit price, with two decimals when it isn't whole.

### D5. Delivery: FTP or SFTP, chosen by the address
- **`ONEC_EXCHANGE_URL`**, for example `sftp://user@host:22/orders` or `ftps://user@host/1csync/orders`, plus `ONEC_EXCHANGE_PASSWORD` or `ONEC_EXCHANGE_PRIVATE_KEY`.
- **Upload:** to `<path>/<number>.xml.part`, then rename to `<number>.xml`, so 1C never reads half a file.
- **Libraries:**
  - `ssh2-sftp-client` for `sftp://`, `basic-ftp` for `ftp://` and `ftps://`. Both are new dependencies (proposal), and only the one the server uses gets added once the protocol is known.
  - The uploader is an interface (`erp/exchange.ts`), replaceable in tests, as push and Stripe are.
- **Not configured:** when `ONEC_EXCHANGE_URL` is missing, `GET /orders/1c/status` answers `configured: false`.
- **Secrets:** they stay on the server, in Coolify only. `last_error` stores the error class and code, never credentials.

### D6. Web
- **Deal card** (`DealDetailsDialog`): a «Товари» section in read-only rows (name, code, quantity and unit, price, total) with «Додати товар», and «Передати в 1С» as the dialog's one primary action when the deal can be sent.
- **Status:** a badge for the latest order — «Передано в 1С, № 10452 · 25.11, 14:03», «Очікує передачі» or «Не передано» with «Спробувати ще» — plus an expandable order history.
- **`DealProductsDialog`:** search (debounced 250 ms) with results showing name, code, price, box price and stock; for each chosen line, quantity, unit or box, and price or discount %, with live totals; «Зберегти».
- **Locked deal:** products are read-only, and «Змінити замовлення» is offered.
- **Amount field:** in `DealDetailsForm` it becomes read-only when there are lines, with the hint «Сума рахується з товарів».
- **Member dialog:** a «ID менеджера в BPI» field, director only.
- **Demo mode:** a catalogue of 12 sample products, and sending simulated with numbers starting at 90001.
- **Translations:** new `erp` keys in the `sales` namespace, in three languages.

## Files

| File | Change |
|---|---|
| `database/029_deal_products_orders.sql` | tables and columns (D2) |
| `apps/api/src/catalogue/bpi.ts` | catalogue fetch, cache, search; BPI `add-order` client |
| `apps/api/src/erp/orderXml.ts` | XML building and escaping |
| `apps/api/src/erp/exchange.ts` | FTP/SFTP uploader, replaceable |
| `apps/api/src/erp/orders.ts` | send, retry, unlock, scheduler step |
| `apps/api/src/routes/catalogue.ts`, `routes/dealOrders.ts` | endpoints (D3) |
| `apps/api/src/routes/deals.ts` | value follows the lines, lock checks on `value` edits |
| `apps/api/src/routes/teamAdmin.ts` | `bpiManagerId` (director) |
| `apps/api/src/config.ts`, `compose.yaml` | `BPI_URL`, `ONEC_EXCHANGE_*` |
| `apps/web/src/lib/catalogue.ts`, `lib/dealOrders.ts` | clients and demo backends |
| `apps/web/src/components/sales/DealProducts.tsx` | section, picker dialog, order status |
| `apps/web/src/pages/SalesPage.tsx` | wiring into the deal card and the amount field |
| `apps/web/src/components/team/MemberDialogs.tsx` | BPI manager id |
| `apps/web/src/i18n/{uk,ru,en}/sales.ts` | texts |
| `docs/external/README.md`, `docs/OPERATIONS.md`, ADR `0008-orders-to-1c.md` | variable names, setup, decision |

## Call stacks
- **Add products:** `DealProductsDialog` save → `PUT /deals/:id/products`:
  1. scope and edit check, and the lock check;
  2. `fetchCatalogue()` resolves each `bpiProductId`;
  3. in one transaction, replace the lines and set `deals.value = sum`;
  4. audit;
  5. return the lines and value; the web updates the deal in the workspace.
- **Send:** «Передати в 1С» → `POST /deals/:id/orders`:
  1. access and requirement checks;
  2. `deal_orders` row `CREATING`, and the deal locked;
  3. BPI `add-order`, storing `bpi_order_id`;
  4. `buildOrderXml`, status `UPLOADING`;
  5. `exchange.upload(name, xml)`, giving `SENT` (200) or a queued retry (202);
  6. audit.
- **Retry:** scheduler `erp-orders` → due rows → upload, or BPI create for `CREATING` rows using the dedupe marker → `SENT`, a longer wait, or `FAILED` with a notification.

## Test plan
- **API (`erpOrders.integration.test.ts`; BPI and the uploader faked):**
  - «adds catalogue products with server-side names, codes and prices, and the deal value follows»;
  - «uses the box code and price for a box line, with a discount»;
  - «refuses an employee who can only view, and answers 404 outside scope»;
  - «sends an order: BPI number, a valid XML with escaped names, uploaded as .part then renamed, and the deal locked»;
  - «queues the upload when the server is down and delivers it later under the same number»;
  - «marks it failed after 24 hours and notifies the sender»;
  - «never creates a second BPI order when the create call times out and is retried»;
  - «unlocks and re-sends a new order that names the one it replaces»;
  - «refuses to send without products, without a client, or without the sender's BPI manager id»;
  - «reports not configured and still saves products».
- **API unit (`orderXml.test.ts`):** the exact XML for a known deal (a golden file, kept equal to b2b's tag order), and escaping.
- **Web:**
  - «a manager adds two products and the amount becomes their sum»;
  - «the amount field is read-only with products»;
  - «sends to 1C and shows the order number»;
  - «a locked deal offers Змінити замовлення»;
  - «the picker says the catalogue is unavailable».

## Risks / Trade-offs
- **BPI has no authentication**, the same as for b2b. Atlas only reads the catalogue and creates orders, so it adds no new exposure, but anyone can create BPI orders; that's worth raising with whoever runs BPI.
- **Uncertain BPI `add-order` contract:** it's taken from b2b's code, with no documentation. The first live send needs watching, and `last_error` plus the stored XML help with support.
- **Whole-UAH prices in BPI:** a discounted kopeck price is rounded in BPI but exact in the XML 1C reads.

## Migration Plan
- 029 only adds objects, so nothing changes for existing deals.
- **Release order:**
  1. deploy;
  2. set `ONEC_EXCHANGE_*` in Coolify;
  3. directors fill in their managers' BPI ids;
  4. send one test order with the 1C admin watching.

## Least confident decisions
1. **Which BPI user the order belongs to:** the sender's BPI manager id as both client and manager. Alternatives: a dedicated «Atlas» BPI user, or the customer's BPI account matched by phone or email.
2. **Re-sending creates a new BPI order** that names the old one, instead of updating the old order. 1C then sees two orders, and someone has to cancel the first.
3. **Retrying a failed BPI create:** de-duplicating by a marker in the comment relies on BPI `last-order` returning that comment. If it doesn't, a timeout could still duplicate an order.
4. **SFTP vs FTP is still unknown;** only one library is added, once you tell me which.
5. **Quantities allow decimals** (cable sold by the metre). b2b sends whole numbers.
