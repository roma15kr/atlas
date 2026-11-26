# 0008. Deal products from BPI, and deal orders created only through BPI's API
Date: 2026-11-26
Status: accepted

## Context
The director asked for products in CRM deals, using the catalogue that b2b.rdim.ua sells from, and for a deal to become an order the way b2b orders do. b2b reads products from BPI (`bpi.rdim.ua`, no authentication) and creates orders with `POST /add-order`. It then writes an XML file for 1C into `/var/www/1csync/orders` on its server. Since b2b moved into a Coolify container, that folder isn't visible to it. Atlas runs on another server.

## Decision
- **Catalogue:** read from BPI `prods/price`, cached for an hour, with names, codes and prices snapshotted on each deal line. The deal amount is the sum of its lines whenever it has any.
- **Orders:** Atlas creates a deal's order **only through BPI's API** (`add-order`), exactly as b2b does. It writes no files and changes neither b2b.rdim.ua nor the server; this is the director's decision.
- **BPI manager:** each employee is matched to their BPI staff account (`user-id/<id>`, `user_type` admin or manager, among the first 100 ids) by name. Word order, case, apostrophes and Ukrainian or Russian spelling are ignored. A director can override the match.
- **Retries:** an order is retried for up to 24 h if BPI doesn't answer. Each attempt carries an `atlas:<row id>` marker in the comment, and a retry first looks for it in BPI's orders, so an order is never created twice.
- **Changes:** a created order locks the deal's products. «Змінити замовлення» unlocks them, and the next order names the one it replaces.

## Consequences
- **1C:** Atlas orders travel exactly like b2b's orders after BPI. If b2b's own XML step can't reach `/var/www/1csync`, neither kind reaches 1C until that is fixed outside Atlas.
- **BPI's contract:** it is undocumented and taken from b2b's code. The stored request body helps support, and the first live orders should be watched.
- **BPI has no authentication:** anyone who knows its address can create orders. That's for whoever runs BPI.
