# alerts-ai Specification

## Purpose
Surfaces operational risk alerts to management and produces role-aware advice, evaluation and forecasts from system metrics, using Claude when configured and deterministic rules otherwise, without reading private message content.

## Requirements

### Requirement: Scoped alert feed
The system SHALL list alerts newest first with severity (INFO, WARNING, CRITICAL), category, title, summary, evidence, subject user and acknowledgement state: all company alerts for a DIRECTOR, department alerts for a MANAGER, and alerts about themselves for an EMPLOYEE.

#### Scenario: Manager reads alerts
- **WHEN** a MANAGER lists alerts
- **THEN** only alerts for the manager's department are returned

### Requirement: Acknowledge alert
The system SHALL let a DIRECTOR acknowledge any company alert and a MANAGER acknowledge alerts of their department, recording who and when, and auditing `ALERT_ACKNOWLEDGED`.

#### Scenario: Out-of-scope acknowledgement
- **WHEN** a MANAGER acknowledges another department's alert
- **THEN** the response is 404 `ALERT_NOT_FOUND`

#### Scenario: Employee acknowledgement
- **WHEN** an EMPLOYEE tries to acknowledge an alert
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: Work analysis
The system SHALL produce an ADVICE, EVALUATION or FORECAST analysis for the caller or a user they can manage from KPI progress, task totals and overdue count, open and weighted pipeline in UAH, and 30-day presence activity, and SHALL audit `AI_ANALYSIS_REQUESTED` with mode and source.

#### Scenario: No Claude key
- **WHEN** `ANTHROPIC_API_KEY` is not configured
- **THEN** a rule-based summary and recommendations are returned with `source: RULES`

#### Scenario: Claude configured
- **WHEN** the key is configured and Claude returns valid JSON within 15 seconds
- **THEN** Claude's summary and up to 8 recommendations are returned with `source: CLAUDE` and the model name

#### Scenario: Claude fails
- **WHEN** the Claude call errors, times out or returns invalid JSON
- **THEN** the rule-based result is returned with `source: RULES` and a `fallbackReason`

### Requirement: Metadata-only AI input
The system SHALL send Claude only aggregated system metrics and the viewer's role, never message bodies, client data or documents, and SHALL instruct the model not to infer protected traits, intent or misconduct. The API key SHALL stay server-side.

#### Scenario: AI request payload
- **WHEN** an analysis is sent to Claude
- **THEN** the payload contains only mode, viewer role, the metrics object and the rule-based baseline
