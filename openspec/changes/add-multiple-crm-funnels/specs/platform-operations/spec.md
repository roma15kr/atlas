# Spec Delta

## MODIFIED Requirements

### Requirement: Production bootstrap
On production startup with an empty users table, the API SHALL require `BOOTSTRAP_ADMIN_PASSWORD` and create exactly one company, an Administration department and one DIRECTOR, under an advisory lock. On each production start, it SHALL create a default company-wide funnel with default stages only for companies that have no funnel. It SHALL ensure default achievement definitions for every company. Stages and funnels that a DIRECTOR edited or deleted SHALL NOT be re-created.

#### Scenario: Concurrent first start
- **WHEN** two API instances start against an empty database
- **THEN** only one company, one director and one default funnel are created

#### Scenario: Restart after stage deletion
- **WHEN** a DIRECTOR deleted a default stage and the API restarts
- **THEN** the stage is not re-created
