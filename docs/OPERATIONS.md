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
hours. The `document-backup` container copies every document file it has not
copied before from the `documents_data` volume into `object_backups/current/`,
keeping each file's storage key as its path. Files are never modified after
upload, so this copy is complete. Both containers write `last-success` markers
used by their health checks.

Replicate `postgres_backups` and `object_backups` to encrypted storage on a
different host. On restore, stop API writes, restore the selected dump into a
fresh PostgreSQL database with `pg_restore --clean --if-exists`, copy the
document files back, then start the API and run the smoke test:

```bash
docker compose stop api
uid_gid="$(docker compose run --rm --no-deps --entrypoint id api -u atlas):$(docker compose run --rm --no-deps --entrypoint id api -g atlas)"
docker compose run --rm --no-deps -v "$(docker volume ls -q | grep '_object_backups$'):/from:ro" \
  --entrypoint sh api -c "cp -a /from/current/. /data/documents/"
docker run --rm -v "$(docker volume ls -q | grep '_documents_data$'):/to" postgres:16-alpine chown -R "$uid_gid" /to
docker compose start api
```

Test this procedure quarterly with a disposable environment.

If `/health` reports `storage: error` after a deploy, the document volume is not
writable by the API user. Fix ownership with the last `docker run ... chown`
line above.

## Moving documents out of MinIO (one time)

Releases before the switch to the document volume stored files in MinIO, whose
images are no longer published. Installations that already hold documents move
them once:

1. Before deploying the new release, confirm the old `object-backup` container
   reported a recent `last-success`. Its `object_backups/current/` mirror holds
   every file under the same storage keys the database uses.
2. Deploy the new release, then run the restore commands above (the `cp -a` and
   `chown` lines). They copy `object_backups/current/` into `documents_data`.
3. Open a few documents in **Документы** and download them.
4. Delete the unused `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and `S3_*`
   variables from Coolify, and, once the documents are verified, remove the
   orphaned volume with `docker volume rm <project>_minio_data`.

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

Rotate one dependency at a time and confirm health after each change. Database
and Redis credentials require coordinated server and API updates. Changing `JWT_SECRET` invalidates access tokens; changing
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
