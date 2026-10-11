## ADDED Requirements

### Requirement: Default funnel for a new company
When a company has no funnel, the system SHALL create one `COMPANY` funnel "Основная воронка" with the stages Квалификация, Коммерческое предложение, Согласование условий, Заказ и поставка (all `OPEN`), Отгрузка (`WON`) and Проиграна (`LOST`), in that order. Companies that already have a funnel SHALL keep their funnels and stages unchanged, and demo mode SHALL show the same default stages.

#### Scenario: First start of a new installation
- **WHEN** the system starts for a company with no funnel
- **THEN** the company has one company-wide funnel "Основная воронка" with the stages Квалификация, Коммерческое предложение, Согласование условий, Заказ и поставка, Отгрузка and Проиграна, in that order

#### Scenario: A deal is won only on shipment
- **WHEN** a deal in the default funnel moves to "Заказ и поставка"
- **THEN** it is still an open deal, has no closed date and counts in the open pipeline
- **WHEN** it then moves to "Отгрузка"
- **THEN** it is won and gets a closed date

#### Scenario: Existing company keeps its stages
- **WHEN** the system starts for a company whose funnel still has the earlier default stages or stages a director edited
- **THEN** none of its funnels or stages change

#### Scenario: Demo mode
- **WHEN** someone opens the sales pipeline in demo mode
- **THEN** the main funnel shows the same six stages in the same order
