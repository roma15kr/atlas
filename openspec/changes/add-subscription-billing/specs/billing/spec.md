## ADDED Requirements

### Requirement: Tariffs and prices
The company SHALL be able to subscribe to one of two tariffs, «Стандарт» (without AI) and «Стандарт + AI», each billed monthly or yearly, priced per active user per month in US dollars:

| Tariff | Billed monthly | Billed yearly |
|---|---|---|
| «Стандарт» | $7 | $5 (charged as $60 per user per year) |
| «Стандарт + AI» | $10 | $8 (charged as $96 per user per year) |

#### Scenario: Prices shown to the director
- **WHEN** a director of a company with 20 active users opens the tariff choice
- **THEN** «Стандарт» shows $140 per month when billed monthly and $1,200 per year when billed yearly, and «Стандарт + AI» shows $200 per month and $1,920 per year

### Requirement: Who may manage billing
Only a director SHALL see «Тариф і оплата», choose or change a tariff, open payment and card management, and see invoices. A manager or employee SHALL have no navigation item, SHALL be redirected from the screen's address, and SHALL be refused by the server with 403. Every billing action and every refused attempt SHALL be audited without card or payment details.

#### Scenario: An employee opens the address
- **WHEN** an employee opens the «Тариф і оплата» address
- **THEN** they are taken to the dashboard, and no billing data is loaded

#### Scenario: A manager calls the billing API
- **WHEN** a manager requests a payment page from the server
- **THEN** the server answers 403, and the refusal is audited

### Requirement: Paying through Stripe
A director SHALL choose a tariff and period, and SHALL pay on Stripe's secure payment page. Quorfield SHALL never receive or store card numbers. After a successful payment the screen SHALL show the new tariff as active. If the director cancels on Stripe's page, nothing SHALL change.

#### Scenario: First payment
- **WHEN** a director chooses «Стандарт + AI» billed yearly and completes payment on Stripe's page
- **THEN** they return to «Тариф і оплата», which shows «Стандарт + AI», yearly, active, the number of paid users and the next charge date

#### Scenario: Payment abandoned
- **WHEN** a director closes Stripe's page without paying
- **THEN** «Тариф і оплата» shows the previous state and says the payment wasn't completed

### Requirement: Changing, cancelling and invoices
A director SHALL change the tariff or period, update the card, cancel, and download invoices and receipts through Stripe's billing page opened from «Тариф і оплата». A cancelled subscription SHALL stay active until the end of the paid period, and the screen SHALL show that date.

#### Scenario: Cancelling a yearly tariff
- **WHEN** a director cancels a yearly subscription paid until 2027-11-22
- **THEN** the screen shows «Активний до 22.11.2027, не буде продовжено», and the tariff's features stay available until then

#### Scenario: Switching to the AI tariff
- **WHEN** a director switches from «Стандарт» to «Стандарт + AI» in the middle of a month
- **THEN** AI analysis becomes available as soon as Stripe confirms the change, and the price difference is charged by Stripe's rules

### Requirement: Paid users follow the team
The number of paid users SHALL equal the number of active users in the company. Adding an employee, disabling one or re-enabling one SHALL update the subscription's quantity within a minute. Stripe SHALL add the difference for the rest of the period to the next invoice. Disabled users SHALL NOT be paid for.

#### Scenario: A new employee
- **WHEN** a director adds an employee to a company paying for 20 users monthly
- **THEN** the subscription quantity becomes 21, and the next invoice includes the extra user for the rest of the month

#### Scenario: A disabled employee
- **WHEN** a director disables an employee
- **THEN** the quantity drops by one and the next invoice credits the unused time

### Requirement: What the AI tariff includes
AI features SHALL be available only when the company's subscription includes AI, or when the company has never subscribed. The AI features are the AI analysis, and the AI translation and summary of problem reports. On «Стандарт», new problem reports SHALL still be saved, and SHALL wait without translation. All other features, including rule-based signals and reminders, SHALL work on both tariffs.

#### Scenario: Problem reports on «Стандарт»
- **WHEN** a person sends a problem report while the company is on «Стандарт»
- **THEN** the report is saved and listed, and is not sent for AI translation

#### Scenario: Before the first payment
- **WHEN** the company has never subscribed
- **THEN** every feature works as before billing existed, and directors see a prompt to choose a tariff on the dashboard and in «Тариф і оплата»

### Requirement: Failed payments remind, never restrict
When a charge fails, every director SHALL get a notification at once, and again every 3 days while the payment is overdue. «Тариф і оплата» SHALL show the overdue amount, with a way to update the card. Nobody SHALL lose access to any feature because of an overdue payment, and the tariff's features SHALL stay as they were.

#### Scenario: A declined renewal
- **WHEN** Stripe reports that the monthly renewal charge was declined
- **THEN** directors receive «Оплата не пройшла» linking to «Тариф і оплата», the screen shows the overdue amount, and every user keeps working as before

#### Scenario: The payment succeeds later
- **WHEN** Stripe later reports the overdue invoice as paid
- **THEN** the reminders stop and the screen shows the subscription as active

### Requirement: Billing not configured
Without Stripe set up on the server, «Тариф і оплата» SHALL say that payments aren't configured and SHALL offer no payment actions. Every feature, AI included, SHALL keep working.

#### Scenario: No Stripe keys
- **WHEN** a director opens «Тариф і оплата» on a server without Stripe keys
- **THEN** the screen says payments are not configured on the server, and AI analysis still works
