# Spec Delta

## ADDED Requirements

### Requirement: Per-user API rate limit
The system SHALL rate-limit `/api/v1` requests per authenticated user to 1,500 per 15 minutes. It SHALL limit requests without a valid access token per client IP to 300 per 15 minutes. It SHALL apply a per-IP flood ceiling of 6,000 requests per 15 minutes. Exceeding a limit SHALL return 429 `RATE_LIMITED`. Users who share an office IP SHALL NOT consume each other's allowance.

#### Scenario: Office behind one IP
- **WHEN** 20 signed-in users share one public IP and each makes 400 requests in 15 minutes
- **THEN** no request is rejected

#### Scenario: Anonymous flood
- **WHEN** a client without a token makes more than 300 API requests in 15 minutes
- **THEN** further requests get 429 `RATE_LIMITED`
