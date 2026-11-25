# Proposal: Products in deals and orders to 1C

## Problem
«Based on the product catalogue and BPI from b2b.rdim.ua, add the possibility to add products to CRM deals, and sync the deal as an order to 1C (as for b2b: create an XML file in the 1csync folder).» Today a deal in Atlas has only an amount. The products the customer buys live in the manager's head or in b2b.rdim.ua, and an order for 1C has to be entered a second time.

## Evidence
- The director's request on 2026-11-25 (no inbox report).
- b2b.rdim.ua already sells from the same catalogue: `GET https://bpi.rdim.ua/prods/price` returns 265 products with a 1C code, unit and box price in UAH, and stock.
- b2b creates an order in BPI (`POST /add-order`), gets its number, and writes `<number>.xml` for 1C (`engine/order.php`).
- **Found while preparing:** since b2b.rdim.ua moved to Coolify, no 1C exchange folder is mounted into it, so its XML files never leave the container. 1C reads the exchange folder over FTP/SFTP (the director's answer), so Atlas will deliver there directly.

## Success metric
Within a month of release, at least 80% of won deals have products. The orders sent to 1C from Atlas arrive without being retyped: every Atlas order shows up in 1C with its BPI number and the same lines. Measured by Atlas's order log against 1C.

## Why
Managers already plan deals in Atlas. Choosing products there gives correct amounts and lets one click put the order into 1C, the same way b2b orders get there, instead of retyping it.

## What Changes
- **Products in a deal.** On the deal card, «Товари» lists the products: the catalogue name and 1C code, quantity, unit or box, price, and line total.
  - Products are added from the b2b catalogue (BPI), searched by name or code.
  - Each line starts at the catalogue price (the box price for a box). The manager can change the price or give a discount.
  - The deal amount becomes the sum of the lines whenever the deal has products.
- **«Передати в 1С».** The deal's owner, their head or a director can send the order. Atlas then:
  1. creates the order in BPI and gets its number, as b2b does;
  2. writes the same XML format that b2b writes;
  3. uploads it to 1C's exchange folder over FTP/SFTP.

  The deal then shows «Передано в 1С, № …» and its products are locked. To change a sent order, «Змінити замовлення» unlocks the products, and the next send creates a new order that names the one it replaces.
- **Delivery that doesn't get lost.** If the exchange server can't be reached, the order waits as «Очікує передачі», is retried automatically, and the sender is told when it fails for good.
- **Without settings, nothing breaks.** Without the exchange settings, products still work, and the button explains that the 1C exchange isn't configured.
- Every send is audited.

## Capabilities

### New Capabilities
- `erp-orders`: sending a deal as an order to 1C. Covers who may send, what is required, the BPI order number, the XML file, delivery and retries, the locked state, re-sending, and behaviour when it isn't configured.

### Modified Capabilities
- `sales-pipeline`: deals gain products from the catalogue, with the deal amount following them (added requirements).

## Non-goals
- Stock reservation, invoices, payments, shipping or Nova Poshta from Atlas.
- Importing order statuses back from 1C (one-way for now).
- Editing the catalogue or prices in Atlas; BPI and 1C stay the source.
- Fixing b2b.rdim.ua's own 1C export. That is noted for whoever maintains b2b; the same FTP/SFTP settings would fix it.
- Telegram and mail deal dialogs choosing products (they keep creating deals with an amount).

## Announcement
Deals in Atlas now have products. Open a deal, add items from the same catalogue as b2b.rdim.ua, adjust the price if you agreed a discount, and the deal amount follows. When the order is final, press «Передати в 1С»: Atlas creates the order with the usual number and sends it to 1C, just like an order from b2b. You no longer retype orders.

## Impact
- **API:** catalogue from BPI (cached), deal products, orders with a queue and retries, BPI order creation, XML building, FTP/SFTP upload, audit.
- **Web:** «Товари» on the deal card, a product picker, the send action and order status, in three languages.
- **Database:** one migration (deal products, deal orders, the BPI manager id on users).
- **Dependencies:** an FTP/SFTP client library, a **new dependency** that needs approval: `ssh2-sftp-client` for SFTP, or `basic-ftp` for FTP, depending on the server.
- **Configuration:** the exchange server address, folder and credentials (server-side only), and the BPI address (default `https://bpi.rdim.ua`).
