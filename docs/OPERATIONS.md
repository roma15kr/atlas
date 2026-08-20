# Operations runbook

## Release checks

Before deployment, run `npm ci`, `npm run typecheck`, `npm test`, `npm run
build`, and `docker compose config --quiet`. A release is ready only when the
Git commit being deployed matches the tested commit.

After deployment, run:

```bash
ATLAS_URL=https://atlas.example.com \
ATLAS_DIRECTOR_PASSWORD='current-password' \
ATLAS_EMPLOYEE_PASSWORD='current-password' \
./scripts/smoke.sh
```

The script checks real dependency health, director dashboard/export access, and
the employee export denial. It keeps access tokens in a temporary directory and
does not print them.

## Backups and restore

The `backup` container writes a verified PostgreSQL custom-format dump every 24
hours. The `object-backup` container mirrors the private document bucket. Both
write `last-success` markers used by their health checks.

Replicate `postgres_backups` and `object_backups` to encrypted storage on a
different host. On restore, stop API writes, restore the selected dump into a
fresh PostgreSQL database with `pg_restore --clean --if-exists`, restore the
document mirror to the configured MinIO bucket, then start the API and run the
smoke test. Test this procedure quarterly with a disposable environment.

## Secret rotation

Rotate one dependency at a time and confirm health after each change. Database,
Redis, MinIO root, and MinIO application credentials require coordinated server
and API updates. Changing `JWT_SECRET` invalidates access tokens; changing
`REFRESH_TOKEN_SECRET` invalidates refresh sessions. Schedule both together and
expect every user to sign in again.

The Coolify provisioning token is not an Atlas runtime secret. Rotate it after
provisioning and keep future tokens least-privileged. Never put a token in Git,
deployment logs, support tickets, or browser storage.

## Incident response

For suspected CRM leakage, disable the affected user, preserve audit and proxy
logs, revoke refresh-token families, rotate relevant credentials, and take a
forensic database snapshot before cleanup. Do not delete audit evidence during
containment.

For a bad application release, use Coolify's previous successful deployment and
run the smoke test. Database migrations are forward-only; when a release changes
the schema, use a reviewed compensating migration instead of editing an applied
file. If data integrity is affected, stop writes and follow the restore procedure.

