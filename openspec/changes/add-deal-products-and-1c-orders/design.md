# Design: Products in deals and orders in BPI

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
- **Servers:** b2b and BPI run on another server than Atlas. 1C reads `/var/www/1csync` on that server, which b2b's container doesn't mount.
- **The director's decision:** Atlas only calls BPI's API. It writes no files and changes neither b2b nor the server.
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
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),   -- whole units or boxes, as b2b sends
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
  status text NOT NULL CHECK (status IN ('CREATING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,                    -- short technical reason, no customer data
  request jsonb,                      -- the exact body sent to BPI, kept for retries and support (no credentials)
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX deal_orders_deal_idx ON deal_orders (deal_id, created_at DESC);
ALTER TABLE deals ADD COLUMN products_locked boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN bpi_manager_id integer;   -- matched by name, or chosen by a director
ALTER TABLE users ADD COLUMN bpi_manager_source text CHECK (bpi_manager_source IN ('AUTO', 'DIRECTOR'));
```
- `deals.value` is recomputed in the same transaction whenever lines change. With no lines left, the value stays where it was and becomes editable again.

### D3. API
| Method and path | Who | Purpose |
|---|---|---|
| `GET /catalogue/products?query=&limit=` | any signed-in user | search the catalogue; 503 `CATALOGUE_UNAVAILABLE` without BPI or a cache |
| `GET /deals/:id/products` | whoever can see the deal | lines |
| `PUT /deals/:id/products` | whoever can edit the deal | replace all lines `{ lines: [{ bpiProductId, byBox, quantity, unitPrice? , discountPercent? }] }`; the name, code and catalogue price come from the catalogue on the server, never from the client; 409 `DEAL_ORDER_LOCKED` |
| `POST /deals/:id/orders` | owner, covering manager, director | create the order in BPI |
| `POST /deals/:id/orders/unlock` | the same | «Змінити замовлення» |
| `POST /deals/:id/orders/:orderId/retry` | the same | retry a FAILED creation |
| `GET /deals/:id/orders` | whoever can see the deal | the order history `{ bpiOrderId, status, sentAt, sentBy, replacesOrderId, lastError }` |

- **Access:**
  - visibility uses `dealScope` and funnel access, as today, so a deal outside scope answers 404;
  - editing follows the existing `PATCH /deals/:id` rule;
  - sending: EMPLOYEE only for their own deals, MANAGER for the departments they cover, DIRECTOR any. A visible deal you may not send answers 403, audited `DEAL_ORDER_DENIED`.
- **Audit (ids only):** `DEAL_PRODUCTS_UPDATED { dealId, lines }`, `DEAL_ORDER_SENT { dealId, orderId, bpiOrderId }`, `DEAL_ORDER_FAILED { dealId, orderId }`, `DEAL_ORDER_UNLOCKED`.

### D4. Creating the order: one BPI call, retried without duplicates
- **`POST /deals/:id/orders`:**
  1. Check the client and lines.
  2. Insert `deal_orders` (`CREATING`, with the `request` body) and lock the deal (`products_locked = true`).
  3. Call BPI `add-order` (`catalogue/bpi.ts`) with:
     - `user_id` and `manager_id`: the sender's `bpi_manager_id`. A manager ordering for a customer, as in b2b when `userId == managerId`;
     - `organization`: the client's company; `name`: the contact; `phone`;
     - `goods`: `[{ id, art, name, number, price, box }]` from the lines. `art` is the box code for a box; `price` is rounded to whole UAH, which BPI stores;
     - `sum_total` and `date`;
     - `comment`: «Atlas: угода <title> · atlas:<order row id>», plus «замінює № …» when re-sending.
  4. On a response with an `id`, store `bpi_order_id` and set `SENT` (200). On a timeout or error, keep `CREATING` with a `next_attempt_at` and answer 202 «Очікує створення».
- **Finding the BPI manager** (`catalogue/bpiManagers.ts`): BPI has no list endpoint that works without b2b's session (`managers/<id>` answers empty), but `user-id/<id>` does. BPI staff (`user_type` `admin` or `manager`) hold the lowest ids: 1–11 today, with clients (`b2b`) after them.
  - Atlas reads `user-id/1…100` once a day, and on demand from the member dialog, keeping admins and managers in memory. «Superadmin» is skipped.
  - **Matching:** names are normalised (lowercase; ё→е; апостроф removed; і/ї/и and є/е unified; word order ignored). A match needs an equal surname, and first names that are equal or that one starts with the other's first 3 letters, so «Наталья» ↔ «Наталія».
  - `users.bpi_manager_id` stores the match with `bpi_manager_source` `AUTO` or `DIRECTOR`. A director's choice is never overwritten. An `AUTO` match is refreshed if names change.
  - **No match:** the creation answers 409 `BPI_MANAGER_REQUIRED` («Попросіть директора вибрати ваш профіль менеджера в BPI»).
  - **Member dialog:** a «Менеджер у BPI» select (BPI staff by name, with the auto match preselected), director only.
- **Scheduler step `erp-orders`:**
  - retries due `CREATING` rows with pauses of 1, 2, 4, 8, 15, 30 and then 60 minutes;
  - after 24 h, marks them `FAILED` and notifies the sender (`DEAL_ORDER_FAILED`, group `alerts`).
- **No duplicates:**
  - a call that timed out may still have created the order, so before calling `add-order` again the step looks in BPI's recent orders (`orders/…` or `last-order`) for the `atlas:<row id>` marker in the comment;
  - if it's there, the step adopts that order's number instead of creating another;
  - which BPI read endpoint returns the comment is checked during implementation (least confident decision 3).
- **Nothing beyond BPI:** Atlas writes no files and makes no calls to b2b.

### D6. Web
- **Deal card** (`DealDetailsDialog`): a «Товари» section in read-only rows (name, code, quantity and unit, price, total) with «Додати товар», and «Створити замовлення» as the dialog's one primary action when the deal can be sent.
- **Status:** a badge for the latest order — «Замовлення в BPI № 10452 · 25.11, 14:03», «Очікує створення» or «Не створено» with «Спробувати ще» — plus an expandable order history.
- **`DealProductsDialog`:** search (debounced 250 ms) with results showing name, code, price, box price and stock; for each chosen line, quantity, unit or box, and price or discount %, with live totals; «Зберегти».
- **Locked deal:** products are read-only, and «Змінити замовлення» is offered.
- **Amount field:** in `DealDetailsForm` it becomes read-only when there are lines, with the hint «Сума рахується з товарів».
- **Member dialog:** «Менеджер у BPI», a select of BPI staff by name with the automatic match preselected, director only.
- **Demo mode:** a catalogue of 12 sample products, and order creation simulated with numbers starting at 90001.
- **Translations:** new `erp` keys in the `sales` namespace, in three languages.

## Files

| File | Change |
|---|---|
| `database/029_deal_products_orders.sql` | tables and columns (D2) |
| `apps/api/src/catalogue/bpi.ts` | catalogue fetch, cache and search; the BPI `add-order` client with a replaceable transport for tests |
| `apps/api/src/erp/orders.ts` | create, retry, the duplicate check, unlock, the scheduler step |
| `apps/api/src/routes/catalogue.ts`, `routes/dealOrders.ts` | endpoints (D3) |
| `apps/api/src/routes/deals.ts` | value follows the lines, lock checks on `value` edits |
| `apps/api/src/catalogue/bpiManagers.ts` | BPI staff list and name matching |
| `apps/api/src/routes/teamAdmin.ts` | `bpiManagerId` (director), `GET /team/bpi-managers` |
| `apps/api/src/config.ts`, `compose.yaml` | `BPI_URL` |
| `apps/web/src/lib/catalogue.ts`, `lib/dealOrders.ts` | clients and demo backends |
| `apps/web/src/components/sales/DealProducts.tsx` | section, picker dialog, order status |
| `apps/web/src/pages/SalesPage.tsx` | wiring into the deal card and the amount field |
| `apps/web/src/components/team/MemberDialogs.tsx` | BPI manager id |
| `apps/web/src/i18n/{uk,ru,en}/sales.ts` | texts |
| `docs/external/README.md`, `docs/OPERATIONS.md`, ADR `0008-deal-orders-in-bpi.md` | variable name, the BPI manager ids step, decision |

## Call stacks
- **Add products:** `DealProductsDialog` save → `PUT /deals/:id/products`:
  1. scope and edit check, and the lock check;
  2. `fetchCatalogue()` resolves each `bpiProductId`;
  3. in one transaction, replace the lines and set `deals.value = sum`;
  4. audit;
  5. return the lines and value.
- **Create the order:** «Створити замовлення» → `POST /deals/:id/orders`:
  1. access and requirement checks;
  2. `deal_orders` row `CREATING`, and the deal locked;
  3. BPI `add-order`, giving `SENT` with a number (200) or a queued retry (202);
  4. audit.
- **Retry:** scheduler `erp-orders` → due `CREATING` rows → duplicate check in BPI → adopt the number, or `add-order` → `SENT`, a longer wait, or `FAILED` with a notification.

## Test plan
- **API (`erpOrders.integration.test.ts`; BPI faked through its transport):**
  - «adds catalogue products with server-side names, codes and prices, and the deal value follows»;
  - «uses the box code and price for a box line, with a discount»;
  - «refuses an employee who can only view, and answers 404 outside scope»;
  - «creates the order in BPI with the client, the lines with codes and prices, the total and the sender as manager, then locks the deal»;
  - «makes exactly one BPI call and no other outside request»;
  - «queues the order when BPI is down and creates it once later»;
  - «adopts the order a timed-out call already created instead of creating a second one»;
  - «marks it failed after 24 hours and notifies the sender»;
  - «unlocks and creates a new order that names the one it replaces»;
  - «refuses without products, without a client, or without a BPI manager»;
  - «matches «Наталья Денисюк» to BPI «Денисюк Наталія» and keeps a director's choice over the automatic match» (unit test of the matcher with today's 11 BPI staff names).
- **Web:**
  - «a manager adds two products and the amount becomes their sum»;
  - «the amount field is read-only with products»;
  - «creates the order and shows the BPI number»;
  - «a locked deal offers Змінити замовлення»;
  - «the picker says the catalogue is unavailable».

## Risks / Trade-offs
- **BPI has no authentication**, the same as for b2b. Atlas only reads the catalogue and creates orders, adding no new exposure, but anyone can create BPI orders; that's worth raising with whoever runs BPI.
- **Uncertain BPI `add-order` contract:** it's taken from b2b's code, with no documentation. The first live order needs watching, and the stored `request` body helps with support.
- **Whole-UAH prices in BPI:** a discounted kopeck price is rounded to whole UAH there.
- **Orders may not reach 1C:** if nothing passes BPI orders to 1C while b2b's XML step can't reach `/var/www/1csync`, Atlas orders won't reach 1C either, exactly like b2b's. That's outside this change by the director's decision.

## Migration Plan
- 029 only adds objects, so nothing changes for existing deals.
- **After the deploy:**
  1. a director opens «Команда» to check the automatic BPI matches and picks any that are missing;
  2. create one test order and check it in BPI's order list.

## Least confident decisions
1. **Which BPI user the order belongs to:** the sender's BPI manager id as both client and manager, as when a manager orders in b2b for a customer. The alternative is the customer's BPI account matched by phone or email.
5. **Reading BPI staff by scanning `user-id/1…100`** works because staff hold the lowest ids. A staff account created after id 100 would be missed, and a director would have to pick it by hand. A real BPI list endpoint would be better if one can be added.
2. **Re-sending creates a new BPI order** that names the old one, instead of updating the old order (the director agreed). Someone then has to cancel the first.
3. **The duplicate check needs a BPI read that returns an order's comment.** If none does, a timed-out call could still duplicate an order. The fallback is to mark it «Перевірте в BPI» for a person instead of retrying blindly.
