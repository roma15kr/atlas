# Spec Delta

## ADDED Requirements

### Requirement: Request correlation and app version
Every API response SHALL carry an `X-Request-Id` header, and the server log entry for that request SHALL contain the same identifier. Each web build SHALL carry its app version (the source revision), visible in the web app and sent with problem reports.

#### Scenario: Matching a report to server logs
- **WHEN** a report's log lists a failed request with identifier `r-123`
- **THEN** the server log has an entry with request id `r-123` for that request
