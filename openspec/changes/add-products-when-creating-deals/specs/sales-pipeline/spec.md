## ADDED Requirements

### Requirement: Products when creating a deal
The «Нова угода» dialog SHALL offer the same product lines as a deal's card: catalogue search, unit or box, a whole quantity, and the catalogue price changed or discounted. With at least one line, the amount SHALL be the sum of the lines and SHALL not be typed over. The deal and its lines SHALL be saved together: if the lines are refused, the deal SHALL not be created either. Names, codes and catalogue prices SHALL come from the catalogue on the server, not from the browser.

#### Scenario: A deal created with products
- **WHEN** a manager creates «Поставка для ТОВ Тепло» with 3 × «TXLP/2R 200W 1.2-1.5 м²» at the catalogue price
- **THEN** the deal is created with that line and an amount of 15 030 ₴, and its card shows the product right away

#### Scenario: Amount without products
- **WHEN** a manager creates a deal without adding products and types 20 000 ₴
- **THEN** the deal is created with 20 000 ₴ and no products, as before

#### Scenario: A product that's gone from the catalogue
- **WHEN** a manager saves a new deal with a product that has just disappeared from the catalogue
- **THEN** no deal is created, and the dialog says one of the products is no longer in the catalogue, keeping what was typed
