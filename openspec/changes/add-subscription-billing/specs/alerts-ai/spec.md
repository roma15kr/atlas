## ADDED Requirements

### Requirement: AI analysis follows the tariff
AI analysis SHALL be available only when the company's subscription includes AI, or when the company has never subscribed. On the «Стандарт» tariff, the «AI-аналіз» action SHALL explain that the analysis is part of «Стандарт + AI», and SHALL offer directors a link to «Тариф і оплата». The server SHALL refuse a new analysis with 403 `PLAN_AI_REQUIRED`. Analyses stored earlier SHALL stay readable.

#### Scenario: A manager on «Стандарт»
- **WHEN** a manager opens «AI-аналіз» for an employee while the company is on «Стандарт»
- **THEN** the dialog says the analysis is available in «Стандарт + AI», shows the stored history, and offers no «Сформувати» action

#### Scenario: A request on «Стандарт»
- **WHEN** a client sends a new analysis request while the company is on «Стандарт»
- **THEN** the server answers 403 `PLAN_AI_REQUIRED`, no AI model is called, and nothing is stored
