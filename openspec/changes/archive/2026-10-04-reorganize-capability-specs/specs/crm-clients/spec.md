# Spec Delta

## ADDED Requirements

### Requirement: Director-only export control
The CRM screen SHALL download the full client CSV through the authenticated export endpoint and show the server's refusal message to non-directors.

#### Scenario: Director downloads export
- **WHEN** a DIRECTOR clicks export
- **THEN** the CSV returned by `/api/v1/clients/export.csv` is saved by the browser
