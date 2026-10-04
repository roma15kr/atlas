# Design

## Context

See proposal.md for why. The API already stores document bodies through an `ObjectStorage` interface (`apps/api/src/storage.ts`) with two drivers:
- `LocalObjectStorage` writes to `STORAGE_DIR` (default `/data/documents`). It is covered by `storage.test.ts`, refuses keys that escape the root, and writes with the `wx` flag, so files are create-only.
- `S3ObjectStorage` is used when `S3_ENDPOINT`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` are set.

`configuredStorage()` throws in production unless S3 is configured. That throw is the only thing tying production to MinIO. Storage keys are `<companyId>/<year>/<uuid><ext>`, and each document version gets a new key. Files are therefore immutable: the API never overwrites them, and deletes only its own just-written file when a database insert fails.

In `compose.yaml`, the API receives `S3_*` from the environment and waits for `minio-init`. The runtime image runs as the non-root user `atlas` and has no `/data` directory.

## Goals / Non-Goals

**Goals:**
- Deployments no longer pull any MinIO image.
- Document files survive rebuilds and redeploys, and are backed up nightly.
- No change to the documents API, access rules or audit events.

**Non-Goals:**
- Running several API replicas. That would need shared storage again, and the S3 driver stays for it.
- Encrypting backups or shipping them off the server. This stays an operator step, as today.
- Migrating MinIO's object versions. Atlas never relied on them, because every document version already has its own key.

## Decisions

### 1. Use the existing local driver in production
Remove the production throw in `configuredStorage()`. S3 still wins when fully configured, and otherwise the local driver is used. The health response already reports `features.storage: "local"`, and its storage check already verifies the directory is readable and writable.
*Alternative:* a replacement S3 server such as Garage. Rejected by the user for this deployment size: it is one more service, credential set and bootstrap script to operate, for no benefit on a single server.

### 2. A named volume that the non-root user owns
The runtime stage of `apps/api/Dockerfile` creates `/data/documents` owned by `atlas:atlas` before `USER atlas`. `compose.yaml` mounts a new named volume `documents_data` at `/data/documents` and sets `STORAGE_DIR: /data/documents`.

Docker seeds an empty named volume with the image directory's ownership, so the first start is writable without an init container. The existing health check reports a permission problem as `storage: error` and returns 503.
*Alternative:* a bind mount to a host path. Rejected because it depends on host paths and UIDs that Coolify doesn't manage.

### 3. The document backup copies new files only
A `document-backup` service replaces `object-backup`. It uses the `postgres:16-alpine` image the `backup` service already pulls, so no new image source is added. It mounts `documents_data` read-only at `/data/documents` and `object_backups` at `/backups`.

Once a day it:
1. walks `/data/documents` with `find -type f`
2. copies each file that does not exist yet under `/backups/current/<key>`, preserving timestamps (`cp -p`)
3. writes `/backups/last-success`

The health check keeps the existing 25-hour freshness test.

Because files are immutable, "copy if missing" is a complete and cheap incremental backup, and it uses only BusyBox commands that are certainly available (`find`, `mkdir -p`, `cp -p`, `test`).
*Alternatives:*
- Daily tarballs with retention. Rejected: they grow with total volume every day.
- An rsync image. Rejected: it adds another third-party image, which is exactly the risk that broke this deployment.

### 4. Keep the backup volume name and layout
`object_backups/current/<key>` is where `mc mirror` put files before, with the same key paths, because the mirror copied the bucket's keys as paths. Existing backups therefore stay valid restore sources, and the restore procedure just copies `current/` into `documents_data`.

### 5. One-time migration for installations that have MinIO documents
`docs/OPERATIONS.md` gets a procedure:
1. Before deploying this change, confirm `object-backup` has a fresh `last-success`.
2. After deploying, copy `object_backups/current/.` into `documents_data` with a one-off container:
   ```bash
   docker run --rm -v <project>_object_backups:/from:ro -v <project>_documents_data:/to postgres:16-alpine sh -c 'cp -a /from/current/. /to/ && chown -R 100:101 /to'
   ```
   The owner must match the `atlas` user's uid and gid in the API image.
3. Check that a few documents download.

The test deployment has 0 documents (checked through the API on 2026-09-30), so this step is not needed there.

### 6. Access and audit
No new endpoint and no new data. The document access rules in `documents` are unchanged: visibility checks run before streaming. No new audit events. The storage directory is reachable only inside the API container. The backup container mounts it read-only.

### 7. Configuration cleanup
- `compose.yaml` stops passing `S3_*` to the API, so leftover Coolify variables cannot re-enable S3 by accident.
- `.env.example` and CI drop `MINIO_ROOT_*` and `S3_*`.
- `config.ts` keeps the optional `S3_*` schema for the S3 driver.

## Risks / Trade-offs

- **Losing the volume loses the files.** → The nightly copy goes to a separate volume. The docs keep the instruction to replicate `object_backups` off the server, and the Deployment doc repeats it for the new volume.
- **Wrong ownership on an existing volume.** This can happen, for example, if someone created `documents_data` by hand first. → The health check returns 503 with `storage: error`, and Coolify keeps the previous containers. The OPERATIONS doc gives the `chown` fix.
- **A single API instance only.** → Documented as a limit. Switching back to shared storage later means setting `S3_*` and copying files.
- **Orphaned `minio_data` volume.** Compose doesn't delete volumes that are no longer declared. → The docs tell the operator to remove it after verifying documents, which is a deliberate manual step.
- **Uid/gid assumption.** Alpine's `adduser -S` assigns uid 100 and gid 101 in the current `node:22-alpine` base, and the migration `chown` depends on that. → The OPERATIONS step reads the ids from the image (`docker compose exec api id atlas`) instead of hard-coding them.

## Migration Plan

1. Commit this change separately on `feat/crm-funnels`. The baseline specs it modifies live on that branch, and `main` can't deploy until the storage fix lands, so both ship together.
2. Deploy to the Coolify test app. Verify:
   - `/health` returns 200 with `storage: local`.
   - Uploading, downloading and adding a version of a document works.
   - A redeploy keeps the file.
   - `document-backup` becomes healthy and the file appears under `object_backups/current`.
3. Delete the unused `MINIO_ROOT_*` and `S3_*` variables from the Coolify app.
4. Rollback: redeploy the previous commit. It won't start, because the MinIO images are gone. The only real rollback is forward, so the change is verified on the test app first.
