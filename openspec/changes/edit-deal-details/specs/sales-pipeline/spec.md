## ADDED Requirements

### Requirement: Editing a deal from the funnel
Clicking a deal on the funnel SHALL open its details: title, client, stage, amount, probability, expected close date, owner and notes. Whoever may edit the deal SHALL be able to change its title, amount, probability, expected close date and stage there; only a head of the owner's department or a DIRECTOR SHALL be able to change its owner. Changes SHALL be audited as `DEAL_UPDATED` with field names, and funnel totals SHALL reflect them at once.

#### Scenario: Owner corrects the amount
- **WHEN** Бабенко opens a deal they own on «Воронка», changes the amount from 120 000 ₴ to 95 000 ₴ and the probability to 60 %, and saves
- **THEN** the card and its column total show the new amount, and `DEAL_UPDATED` is audited with `value` and `probability`

#### Scenario: Employee can't reassign
- **WHEN** an employee opens their deal's details
- **THEN** the owner is shown but cannot be changed

#### Scenario: Deal outside scope
- **WHEN** an employee tries to change a colleague's deal
- **THEN** the response is 404 and nothing changes
