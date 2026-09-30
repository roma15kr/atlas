# Operations runbook

## Release checks

Before deployment, run `npm ci`, `npm run typecheck`, `npm test`, `npm run
build`, and `docker compose config --quiet`. A release is ready only when the
Git commit being deployed matches the tested commit.

After deployment, run:

```bash
ATLAS_URL=https://atlas.example.com \
ATLAS_DIRECTOR_PASSWORD='current-password' \
./scripts/smoke.sh
```

The script always checks real dependency health and director dashboard/export
access. Set `ATLAS_EMPLOYEE_PASSWORD` (and optionally `ATLAS_EMPLOYEE_USER`) to
also verify the employee export denial. It keeps access tokens in a temporary
directory and does not print them.

## Backups and restore

The `backup` container writes a verified PostgreSQL custom-format dump every 24
hours. The `object-backup` container mirrors the private document bucket. Both
write `last-success` markers used by their health checks.

Replicate `postgres_backups` and `object_backups` to encrypted storage on a
different host. On restore, stop API writes, restore the selected dump into a
fresh PostgreSQL database with `pg_restore --clean --if-exists`, restore the
document mirror to the configured MinIO bucket, then start the API and run the
smoke test. Test this procedure quarterly with a disposable environment.

## Deploying migration 004 (CRM funnels)

`database/004_crm_funnels.sql` moves every company's stages and deals into one
company-wide funnel and drops the legacy `deals.stage`, `deal_stages.key`, and
`deal_stages.is_closed` columns. It cannot be rolled back in place. Immediately
before deploying it, take a manual dump next to the daily backups:

```bash
docker compose exec backup sh -c 'f="/backups/atlas-pre-004-$(date -u +%Y%m%dT%H%M%SZ).dump"; pg_dump --format=custom --file="$f" && pg_restore --list "$f" >/dev/null && ls -l "$f"'
```

After the deploy, confirm the Sales board shows the same deals per stage and the
dashboard pipeline is unchanged. To roll back, stop the API, restore that dump
with the procedure above, and redeploy the previous image.

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
