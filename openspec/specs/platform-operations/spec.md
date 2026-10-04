# platform-operations Specification

## Purpose
Runs Atlas as a containerized single-origin service with safe production configuration, checksummed migrations, one-time director bootstrap, health checks, general rate limiting, and daily backups.

## Requirements

### Requirement: Production configuration guards
The API SHALL refuse to start in production when:
- the JWT or refresh secrets are the development defaults
- demo seeding is enabled
- PostgreSQL or Redis credentials are missing
- `PUBLIC_URL` is not HTTPS, or `COOKIE_SECURE` is not true

The API SHALL NOT require S3 storage credentials in production.

#### Scenario: Demo seed in production
- **WHEN** `NODE_ENV=production` and `SEED_DEMO_DATA=true`
- **THEN** the API exits with a configuration error

#### Scenario: Production without S3 settings
- **WHEN** `NODE_ENV=production` and no `S3_*` settings are configured
- **THEN** the API starts and stores document files on the document volume

### Requirement: Checksummed migrations
The API SHALL apply numbered SQL files from the migrations directory in order, each in its own transaction, record name and SHA-256 checksum, skip seed files unless demo seeding is enabled, and SHALL refuse to start if an applied file's checksum changed.

#### Scenario: Edited applied migration
- **WHEN** an already-applied migration file's content differs from its recorded checksum
- **THEN** startup fails with `Applied migration <name> has changed`

### Requirement: Production bootstrap
On production startup with an empty users table, the API SHALL require `BOOTSTRAP_ADMIN_PASSWORD` and create exactly one company, an Administration department and one DIRECTOR, under an advisory lock. On each production start, it SHALL create a default company-wide funnel with default stages only for companies that have no funnel. It SHALL ensure default achievement definitions for every company. Stages and funnels that a DIRECTOR edited or deleted SHALL NOT be re-created.

#### Scenario: Concurrent first start
- **WHEN** two API instances start against an empty database
- **THEN** only one company, one director and one default funnel are created

#### Scenario: Restart after stage deletion
- **WHEN** a DIRECTOR deleted a default stage and the API restarts
- **THEN** the stage is not re-created

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
The deployment SHALL produce a verified PostgreSQL dump daily with 14-day retention. It SHALL also copy, daily, every document file not yet in the backup from the document volume into a separate backup volume, which the backup job mounts read-only.

#### Scenario: Backup retention
- **WHEN** a dump is older than 14 days
- **THEN** it is removed by the backup job

#### Scenario: New document backed up
- **WHEN** a document is uploaded and the next daily document backup runs
- **THEN** a byte-identical copy of the file exists in the backup volume under the same storage key

### Requirement: Document file storage
The deployment SHALL store uploaded document files on a dedicated persistent volume attached to the API, writable by the API's non-root runtime user, and SHALL keep those files across container rebuilds and redeploys. When `S3_ENDPOINT`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` are all configured, the API SHALL use that S3-compatible store instead.

#### Scenario: Redeploy keeps files
- **WHEN** a document is uploaded and the application is redeployed with a new image
- **THEN** the document still downloads with identical content

#### Scenario: Health reports local storage
- **WHEN** no S3 settings are configured
- **THEN** `/health` reports `storage: local` in its features and a `storage` check that is `ok` while the document directory is readable and writable

### Requirement: Encrypted backups
When `BACKUP_AGE_RECIPIENT` holds an age public key, the system SHALL:
- encrypt every nightly database dump and every newly backed-up document file to that recipient before writing it to the backup volume;
- verify each dump with `pg_restore --list` before encrypting;
- delete the plaintext afterwards.

The private key SHALL NOT be needed on the server. An invalid recipient SHALL stop the backup worker so that its health check fails. Without the variable, backups SHALL be written unencrypted with a warning in the logs.

#### Scenario: Encrypted nightly dump
- **WHEN** the backup worker runs with a valid recipient
- **THEN** the volume gains `atlas-<time>.dump.age` starting with the `age-encryption.org/v1` header, and no plaintext dump remains

#### Scenario: Invalid recipient
- **WHEN** `BACKUP_AGE_RECIPIENT` is not a valid age public key
- **THEN** the worker exits with an error and its health check fails
