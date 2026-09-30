# Spec Delta

## MODIFIED Requirements

### Requirement: Work analysis
The system SHALL produce an ADVICE, EVALUATION or FORECAST analysis for the caller or a user they can manage. It SHALL use KPI progress, task totals and overdue count, open and weighted pipeline in UAH, and 30-day presence activity. Pipeline figures SHALL include only deals in `OPEN` stages of funnels the requester can access. The request SHALL be audited as `AI_ANALYSIS_REQUESTED` with mode and source.

#### Scenario: No Claude key
- **WHEN** `ANTHROPIC_API_KEY` is not configured
- **THEN** a rule-based summary and recommendations are returned with `source: RULES`

#### Scenario: Claude configured
- **WHEN** the key is configured and Claude returns valid JSON within 15 seconds
- **THEN** Claude's summary and up to 8 recommendations are returned with `source: CLAUDE` and the model name

#### Scenario: Claude fails
- **WHEN** the Claude call errors, times out or returns invalid JSON
- **THEN** the rule-based result is returned with `source: RULES` and a `fallbackReason`

#### Scenario: Restricted funnel excluded from forecast
- **WHEN** a MANAGER without access to the "Опт" funnel requests a FORECAST for an employee who owns "Опт" deals
- **THEN** the forecast's open and weighted pipeline exclude those deals
