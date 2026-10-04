# Spec Delta

## ADDED Requirements

### Requirement: Document file storage
The deployment SHALL store uploaded document files on a dedicated persistent volume attached to the API, writable by the API's non-root runtime user, and SHALL keep those files across container rebuilds and redeploys. When `S3_ENDPOINT`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` are all configured, the API SHALL use that S3-compatible store instead.

#### Scenario: Redeploy keeps files
- **WHEN** a document is uploaded and the application is redeployed with a new image
- **THEN** the document still downloads with identical content

#### Scenario: Health reports local storage
- **WHEN** no S3 settings are configured
- **THEN** `/health` reports `storage: local` in its features and a `storage` check that is `ok` while the document directory is readable and writable

## MODIFIED Requirements

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

### Requirement: Daily backups
The deployment SHALL produce a verified PostgreSQL dump daily with 14-day retention. It SHALL also copy, daily, every document file not yet in the backup from the document volume into a separate backup volume, which the backup job mounts read-only.

#### Scenario: Backup retention
- **WHEN** a dump is older than 14 days
- **THEN** it is removed by the backup job

#### Scenario: New document backed up
- **WHEN** a document is uploaded and the next daily document backup runs
- **THEN** a byte-identical copy of the file exists in the backup volume under the same storage key
