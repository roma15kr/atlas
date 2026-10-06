# Spec Delta

## ADDED Requirements

### Requirement: Stored AI analyses
The system SHALL store every analysis it returns, whether from the model or the rules, inside Atlas. Each stored analysis SHALL keep:
- who requested it and whom it is about;
- the mode;
- the summary and the recommendations;
- the source, the model and any fallback reason;
- the figures it was based on;
- the time.

Stored analyses SHALL NOT be sent outside Atlas, and SHALL NOT be edited.

A stored analysis SHALL be visible to:
- the person it is about, only if they requested it themselves;
- the managers of that person's department;
- the directors of the company.

Anyone else, including the person it is about when a manager or director requested it, SHALL get 404.

#### Scenario: Analysis is kept
- **WHEN** a manager runs a FORECAST for an employee of their department
- **THEN** the result is stored with the manager as requester, the employee as subject, mode FORECAST, the source and the model, and it appears in that employee's analysis history

#### Scenario: Employee sees only their own analyses
- **WHEN** an employee opens the history in their profile, after running two analyses themselves while their manager ran one about them
- **THEN** they see their own two, and the manager's analysis is not listed and answers 404 if requested directly

#### Scenario: Colleague's history is hidden
- **WHEN** an employee requests the analysis history of a colleague
- **THEN** the response is 404

### Requirement: AI analysis history screen
The "AI-анализ" dialog SHALL have two views:
- "Новый анализ", which runs an analysis;
- "История", which lists that person's stored analyses, newest first, with the date, mode, requester and source, and opens one to show it in full.

A newly run analysis SHALL appear at the top of the history.

#### Scenario: Comparing forecasts
- **WHEN** a director opens "История" for an employee with three stored forecasts
- **THEN** all three are listed with their dates, and opening one shows its summary, recommendations and the figures it was based on

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
