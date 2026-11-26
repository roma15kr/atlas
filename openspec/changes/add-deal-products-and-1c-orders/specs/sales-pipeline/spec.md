## ADDED Requirements

### Requirement: Products in a deal
Anyone who may edit a deal SHALL add products to it from the product catalogue (b2b.rdim.ua's BPI), by searching the name or 1C code, and SHALL set each line's quantity, a whole number, and whether it is sold by the unit or by the box. A line SHALL start at the catalogue's unit or box price, and the editor MAY change the line's price or give a discount in percent. Lines SHALL show the name, 1C code, quantity, price and line total. Lines MAY be removed while the deal's order is not locked.

#### Scenario: Adding a product
- **WHEN** a manager searches «TXLP 200» in a deal and adds «TXLP/2R 200W 1.2-1.5 м²» with quantity 3
- **THEN** the deal shows the line with code 000006669, price 5 010 ₴ and total 15 030 ₴

#### Scenario: A box with a discount
- **WHEN** a manager adds the same product by the box and gives a 10% discount
- **THEN** the line starts at the box price 5 181 ₴, shows 4 662,90 ₴ after the discount, and uses the box code 000007078

#### Scenario: Another employee's deal
- **WHEN** an employee opens a colleague's deal they may only view
- **THEN** the products are listed read-only

### Requirement: Deal amount follows its products
When a deal has products, its amount SHALL be the sum of the line totals and SHALL not be edited by hand. A deal without products SHALL keep its hand-entered amount.

#### Scenario: Amount recalculated
- **WHEN** a deal with an amount of 20 000 ₴ gets two lines totalling 15 030 ₴
- **THEN** the deal amount becomes 15 030 ₴ everywhere, including the funnel totals, and its amount field is no longer editable

### Requirement: Product catalogue
The catalogue SHALL come from BPI and SHALL refresh at least hourly. If BPI can't be reached, existing deal lines SHALL stay as they are, and adding a product SHALL say that the catalogue is temporarily unavailable. A line SHALL keep the name, code and price it was added with, even if the catalogue changes later.

#### Scenario: Catalogue unavailable
- **WHEN** BPI does not answer while a manager opens the product picker
- **THEN** the picker says the catalogue is temporarily unavailable, and the deal's lines and amount are unchanged
