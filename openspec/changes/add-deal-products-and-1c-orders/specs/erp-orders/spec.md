## ADDED Requirements

### Requirement: Creating a deal's order in BPI
The deal's owner, a manager covering the deal's department, or a director SHALL create the deal's order with «Створити замовлення», which needs a client and at least one product. Atlas SHALL create it with BPI's order call, as b2b.rdim.ua does, and the deal SHALL show the BPI order number. Every creation and every refused attempt SHALL be audited with ids only.

#### Scenario: What BPI receives
- **WHEN** an order is created for a deal with two products
- **THEN** BPI receives the client's company, contact and phone, each product's BPI id, 1C code, name, quantity and price, the total, and the sender as the manager

#### Scenario: Creating an order
- **WHEN** a manager creates the order for a deal of «Тепла підлога ТОВ» with two products
- **THEN** BPI returns order number 10452, and the deal shows «Замовлення в BPI № 10452» with the time and sender

#### Scenario: Nothing to order
- **WHEN** someone presses «Створити замовлення» on a deal without products
- **THEN** nothing is created, and the deal says to add products first

#### Scenario: Someone who may not create it
- **WHEN** an employee tries to create the order of a colleague's deal through the API
- **THEN** the request is refused with 404 if they can't see the deal, or 403 if they can only view it, and the attempt is audited

### Requirement: The BPI manager is found by name
Atlas SHALL link each employee to their BPI staff account (an admin or manager in BPI) by matching full names. Word order, letter case, apostrophes and the Ukrainian and Russian spellings of a first name SHALL not matter. A director SHALL see the match in «Змінити співробітника» and MAY choose another BPI manager there. An employee without a match SHALL be told that a director has to choose their BPI manager before they can create an order.

#### Scenario: Names written differently
- **WHEN** Atlas has «Наталья Денисюк» and BPI has staff member 2 «Денисюк Наталія»
- **THEN** Atlas links her to BPI manager 2, and her orders go to BPI with manager 2

#### Scenario: No match
- **WHEN** an employee whose name matches no BPI staff account presses «Створити замовлення»
- **THEN** nothing is created, and they're told to ask a director to choose their BPI manager

### Requirement: Atlas changes nothing outside BPI
Creating an order SHALL only call BPI. Atlas SHALL NOT write files for 1C or change b2b.rdim.ua. What happens to the order after BPI SHALL stay as it is for b2b's orders.

#### Scenario: One call, nothing else
- **WHEN** an order is created from a deal
- **THEN** Atlas makes one order call to BPI and nothing else outside Atlas

### Requirement: Retries without duplicates
If BPI doesn't answer, the order SHALL wait as «Очікує створення» and be retried automatically with growing pauses for up to 24 hours. It SHALL then be marked «Не створено», with a notification to the sender and a «Спробувати ще» action. A retry SHALL never create a second BPI order for the same send.

#### Scenario: BPI down for an hour
- **WHEN** BPI is unreachable for an hour after a manager creates an order
- **THEN** the deal shows «Очікує створення», and a later retry creates exactly one order in BPI

### Requirement: A created order is locked
After an order is created, the deal's products SHALL be locked. «Змінити замовлення» (for the same people who may create it) SHALL unlock them. The next creation SHALL make a new BPI order whose comment names the order it replaces, and the deal SHALL keep the history of its orders.

#### Scenario: Changing an order
- **WHEN** a manager unlocks a deal ordered as № 10452, changes a quantity and creates the order again
- **THEN** BPI returns № 10460 with a comment that it replaces № 10452, and the deal lists both
