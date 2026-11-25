## ADDED Requirements

### Requirement: Sending a deal to 1C
The deal's owner, a manager covering the deal's department, or a director SHALL send a deal to 1C with «Передати в 1С». Sending SHALL need a client and at least one product. Atlas SHALL create the order in BPI to get its order number, as b2b.rdim.ua does. It SHALL then deliver an XML file named `<order number>.xml` to 1C's exchange folder. Every send, and every refused attempt, SHALL be audited with ids only.

#### Scenario: Sending an order
- **WHEN** a manager sends a deal for «Тепла підлога ТОВ» with two products
- **THEN** BPI returns order number 10452, the file `10452.xml` appears in the exchange folder, and the deal shows «Передано в 1С, № 10452» with the time and sender

#### Scenario: Nothing to send
- **WHEN** someone presses «Передати в 1С» on a deal without products
- **THEN** nothing is sent, and the deal says to add products first

#### Scenario: Someone who may not send
- **WHEN** an employee tries to send a colleague's deal through the API
- **THEN** the request is refused with 404 if they can't see the deal, or 403 if they can only view it, and the attempt is audited

### Requirement: The order file 1C receives
The XML file SHALL use the same structure as b2b.rdim.ua's order files, so 1C imports Atlas orders like b2b orders. It SHALL hold the order number, the client and contact, the deal's order comment, the sender as the manager, and one item per line with its BPI id, 1C code, name, quantity and unit price. Text SHALL be escaped so that any name produces valid XML.

#### Scenario: The file's structure
- **WHEN** a deal for «Тепла підлога & Ко» with two products is sent as order 10452
- **THEN** the file holds `data` with `id_order` 10452, `client` «Тепла підлога &amp; Ко», `login`, `tel`, `email`, `prim`, `manager`, `manager_tel`, `manager_email`, and `tovs` with `item0` and `item1`, each holding `id`, `art`, `name`, `col` and `sum`

#### Scenario: A box line
- **WHEN** a deal with one box of «TXLP/2R 200W» at a 10% discount is sent
- **THEN** its item has `art` 000007078, `col` 1 and `sum` 4662.90, and the file is valid XML

### Requirement: Delivery and retries
If the exchange server can't be reached, the order SHALL wait as «Очікує передачі», be retried automatically with growing pauses for up to 24 hours, and then be marked «Не передано», with a notification to the sender and a «Спробувати ще» action. An order number SHALL be created in BPI only once per send, even when the upload is retried.

#### Scenario: Server down for an hour
- **WHEN** the exchange server is unreachable for an hour after a send
- **THEN** the deal shows «Очікує передачі», and the file arrives on a later retry under the same order number

### Requirement: A sent order is locked
After a successful send, the deal's products SHALL be locked. «Змінити замовлення» (for the same people who may send) SHALL unlock them. The next send SHALL create a new order, whose comment names the order it replaces, and the deal SHALL keep the history of its sent orders.

#### Scenario: Changing a sent order
- **WHEN** a manager unlocks a deal sent as № 10452, changes a quantity and sends again
- **THEN** a new order № 10460 is created, its file's `prim` says it replaces № 10452, and the deal lists both orders

### Requirement: 1C exchange not configured
Without the exchange server settings, «Передати в 1С» SHALL explain that the 1C exchange isn't configured, and products in deals SHALL keep working.

#### Scenario: No settings
- **WHEN** a manager opens a deal on a server without 1C exchange settings
- **THEN** products can be added and edited, and «Передати в 1С» is unavailable with that explanation
