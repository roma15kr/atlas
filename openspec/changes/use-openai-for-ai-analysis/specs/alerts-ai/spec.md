# Spec Delta

## ADDED Requirements

### Requirement: AI work analysis
The system SHALL produce an ADVICE, EVALUATION or FORECAST analysis for the caller or a user they can manage. It SHALL use KPI progress, task totals and overdue count, open and weighted pipeline in UAH, and 30-day presence activity. Pipeline figures SHALL include only deals in `OPEN` stages of funnels the requester can access. The request SHALL be audited as `AI_ANALYSIS_REQUESTED` with mode, source and model.

Each mode SHALL have a distinct purpose, answered in Russian, with amounts written in hryvnia ("₴"):
- ADVICE: priorities for the coming days;
- EVALUATION: progress against KPI targets and tasks;
- FORECAST: the expected outcome of open deals based on their weighted value, stating what the forecast rests on.

The analysis SHALL use only the figures given and SHALL NOT invent numbers.

#### Scenario: No AI key
- **WHEN** `OPENAI_API_KEY` is not configured
- **THEN** a rule-based summary and recommendations are returned with `source: RULES`

#### Scenario: AI configured
- **WHEN** the key is configured and the model returns a valid structured result within 15 seconds
- **THEN** the model's summary and up to 8 recommendations are returned with `source: AI` and the model name, for example `gpt-6-luna`

#### Scenario: AI fails
- **WHEN** the model call errors, times out, refuses or returns an unparsable result
- **THEN** the rule-based result is returned with `source: RULES` and a `fallbackReason`

#### Scenario: Forecast differs from advice
- **WHEN** the same person is analysed in FORECAST and in ADVICE mode
- **THEN** the forecast speaks about the expected outcome of the open deals in "₴", and the advice lists priorities

#### Scenario: Restricted funnel excluded from forecast
- **WHEN** a MANAGER without access to the "Опт" funnel requests a FORECAST for an employee who owns "Опт" deals
- **THEN** the forecast's open and weighted pipeline exclude those deals

## MODIFIED Requirements

### Requirement: Metadata-only AI input
The system SHALL send the AI model only aggregated system metrics, the rule-based baseline and the viewer's role, never names, message bodies, client data or documents. It SHALL instruct the model not to infer protected traits, intent or misconduct. The API key SHALL stay server-side.

#### Scenario: AI request payload
- **WHEN** an analysis is sent to the model
- **THEN** the payload contains only mode, viewer role, the metrics object and the rule-based baseline

## REMOVED Requirements

### Requirement: Work analysis
**Reason**: Replaced by "AI work analysis". The analysis moves from Claude to a configurable OpenAI model, with distinct per-mode purposes.
**Migration**: See `alerts-ai` → "AI work analysis". The funnel-scope scenario is unchanged; the source value `CLAUDE` becomes `AI`.
