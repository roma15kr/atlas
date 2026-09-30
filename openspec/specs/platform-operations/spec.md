# platform-operations Specification

## Purpose
Runs Atlas as a containerized single-origin service with safe production configuration, checksummed migrations, one-time director bootstrap, health checks, general rate limiting, and daily backups.

## Requirements

### Requirement: Production configuration guards
The API SHALL refuse to start in production when JWT or refresh secrets are the development defaults, when demo seeding is enabled, when PostgreSQL or Redis credentials are missing, when `PUBLIC_URL` is not HTTPS or `COOKIE_SECURE` is not true, or when S3 storage credentials are missing.

#### Scenario: Demo seed in production
- **WHEN** `NODE_ENV=production` and `SEED_DEMO_DATA=true`
- **THEN** the API exits with a configuration error

### Requirement: Checksummed migrations
The API SHALL apply numbered SQL files from the migrations directory in order, each in its own transaction, record name and SHA-256 checksum, skip seed files unless demo seeding is enabled, and SHALL refuse to start if an applied file's checksum changed.

#### Scenario: Edited applied migration
- **WHEN** an already-applied migration file's content differs from its recorded checksum
- **THEN** startup fails with `Applied migration <name> has changed`

### Requirement: Production bootstrap
On production startup with an empty users table, the API SHALL require `BOOTSTRAP_ADMIN_PASSWORD` and create exactly one company, an Administration department and one DIRECTOR under an advisory lock, and SHALL ensure default deal stages and achievement definitions for every company on each production start.

#### Scenario: Concurrent first start
- **WHEN** two API instances start against an empty database
- **THEN** only one company and one director are created

### Requirement: Health check
The system SHALL expose `/health` and `/api/v1/health` without authentication, reporting database, Redis and storage checks, returning 200 when all are ok and 503 `degraded` otherwise, plus the active AI and storage modes.

#### Scenario: Redis down
- **WHEN** Redis is unreachable
- **THEN** health returns 503 with `redis: error`

### Requirement: HTTP hardening
The API SHALL apply Helmet headers, CORS limited to configured origins with credentials, a 1 MB JSON body limit, redaction of authorization and cookie headers in logs, and a general limit of 500 requests per 15 minutes per client IP.

#### Scenario: General rate limit
- **WHEN** a client IP exceeds 500 API requests in 15 minutes
- **THEN** the response is 429 `RATE_LIMITED`

### Requirement: Daily backups
The deployment SHALL produce a verified PostgreSQL dump daily with 14-day retention and a daily mirror of the private document bucket.

#### Scenario: Backup retention
- **WHEN** a dump is older than 14 days
- **THEN** it is removed by the backup job
