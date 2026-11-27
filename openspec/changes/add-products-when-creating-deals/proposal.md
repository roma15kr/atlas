# Proposal: Products when creating a deal

## Problem
«Why don't you give the possibility to add products to the new deal, when a manager creates it?» Products can be added only after the deal exists: create it, open it, then «Додати товари». Managers who already know what the customer buys must type an amount first and fix it afterwards.

## Evidence
- The director's question on 2026-11-27, right after products in deals went live (`add-deal-products-and-1c-orders`).
- The «Нова угода» dialog has only a hand-typed «Сума» field.

## Success metric
Within a month, most deals that get products have them from the moment they are created: products added in «Нова угода», not only later on the deal card. Measured by comparing a deal's creation time with its first products.

## Why
A manager usually opens a deal when the customer asks for specific goods. Choosing them in the same dialog saves the extra steps, and the amount is right from the start.

## What Changes
- **«Нова угода» gets the «Товари» block** from the deal card: search the b2b catalogue (BPI), add products, choose unit or box, quantity, and price or discount.
- **The amount:** once a product is added, «Сума» shows the sum of the lines and can't be typed over. Without products, the manager types the amount as today.
- **Saving:** the deal and its products are created together, in one step; if anything is refused (for example, the catalogue is unavailable), neither is saved and the dialog says why.
- **Unchanged:** «Створити замовлення» and everything after creation. Deals created from mail and Telegram stay amount-only.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `sales-pipeline`: creating a deal can include products (an added requirement next to «Products in a deal»).

## Non-goals
- Products in the mail and Telegram «Нова угода з…» dialogs (they keep the amount only).
- Creating the BPI order straight from «Нова угода».
- Any change to how products are edited on the deal card.

## Announcement
You can now add products when you create a deal. In «Нова угода», find them in the b2b catalogue, set quantities and prices, and the amount fills itself in. The deal is ready for «Створити замовлення» right away.

## Impact
- **API:** deal creation accepts optional product lines, checked against the catalogue on the server, as on the deal card.
- **Web:** the product editor is shared by the deal card and «Нова угода», and the amount field follows the lines.
- **Database:** no migration.
