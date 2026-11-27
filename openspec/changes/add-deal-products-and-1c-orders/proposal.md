# Proposal: Products in deals and orders in BPI

## Problem
«Based on the product catalogue and BPI from b2b.rdim.ua, add the possibility to add products to CRM deals, and sync the deal as an order to 1C (as for b2b: create an XML file in the 1csync folder).» Today a deal in Quorfield has only an amount. The products the customer buys live in the manager's head or in b2b.rdim.ua, and an order for 1C has to be entered a second time.

## Evidence
- The director's request on 2026-11-25 (no inbox report).
- b2b.rdim.ua already sells from the same catalogue: `GET https://bpi.rdim.ua/prods/price` returns 265 products with a 1C code, unit and box price in UAH, and stock.
- b2b creates an order in BPI (`POST /add-order`), gets its number, and writes `<number>.xml` for 1C (`engine/order.php`).
- **Found while preparing:** since b2b.rdim.ua moved to Coolify, its container can't see the server folder `/var/www/1csync` that 1C reads, so its XML file step probably fails. The director decided to leave b2b and the server as they are: Quorfield creates orders through BPI's API only, and whatever passes orders from BPI onward stays unchanged.

## Success metric
Within a month of release, at least 80% of won deals have products, and their orders are created in BPI from Quorfield instead of being retyped. Measured by Quorfield's order log against BPI's order list.

## Why
Managers already plan deals in Quorfield. Choosing products there gives correct amounts, and one click creates the order in BPI, where b2b orders already go, instead of retyping it.

## What Changes
- **Products in a deal.** On the deal card, «Товари» lists the products: the catalogue name and 1C code, quantity, unit or box, price, and line total.
  - Products are added from the b2b catalogue (BPI), searched by name or code.
  - Each line starts at the catalogue price (the box price for a box). The manager can change the price or give a discount.
  - The deal amount becomes the sum of the lines whenever the deal has products.
- **«Створити замовлення».** The deal's owner, their head or a director can create the order. Quorfield creates it in BPI with the same `add-order` call b2b uses, and shows the BPI order number on the deal.
  - The deal then shows «Замовлення в BPI № …», and its products are locked.
  - To change it, «Змінити замовлення» unlocks the products, and the next send creates a new BPI order that names the one it replaces.
- **No lost orders:** if BPI doesn't answer, the order waits as «Очікує створення» and is retried automatically, without ever creating it twice. The sender is told if it fails for good.
- **Nothing else changes:** Quorfield doesn't write files, doesn't touch b2b.rdim.ua or the server, and doesn't change how orders get from BPI to 1C.
- Every send is audited.

## Capabilities

### New Capabilities
- `erp-orders`: creating a deal's order in BPI. Covers who may create it, what is required, the BPI order number, retries without duplicates, the locked state, and re-sending.

### Modified Capabilities
- `sales-pipeline`: deals gain products from the catalogue, with the deal amount following them (added requirements).

## Non-goals
- Stock reservation, invoices, payments, shipping or Nova Poshta from Quorfield.
- Importing order statuses back from 1C (one-way for now).
- Editing the catalogue or prices in Quorfield; BPI and 1C stay the source.
- Writing XML files, or any change to b2b.rdim.ua, BPI or the server's `/var/www/1csync` (the director's decision). b2b's XML step not reaching that folder is noted for whoever maintains b2b.
- Telegram and mail deal dialogs choosing products (they keep creating deals with an amount).

## Announcement
Deals in Quorfield now have products. Open a deal, add items from the same catalogue as b2b.rdim.ua, adjust the price if you agreed a discount, and the deal amount follows. When the order is final, press «Створити замовлення»: Quorfield creates it in BPI with the usual number, just like an order from b2b. You no longer retype orders.

## Impact
- **API:** catalogue from BPI (cached), deal products, BPI orders with retries, audit.
- **Web:** «Товари» on the deal card, a product picker, «Створити замовлення» and the order status, in three languages.
- **Database:** one migration (deal products, deal orders, each user's BPI manager).
- **Matching managers:** Quorfield links each employee to their BPI staff account by name automatically, and a director can correct it.
- **Dependencies:** none new.
- **Configuration:** the BPI address (default `https://bpi.rdim.ua`).
