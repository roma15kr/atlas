# Tasks

## 1. API storage

- [x] 1.1 In `apps/api/src/storage.ts`, remove the production requirement for S3: use `S3ObjectStorage` only when `S3_ENDPOINT`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` are all set, otherwise `LocalObjectStorage(STORAGE_DIR)`. Verify with a new unit test that production config without S3 selects local storage.
- [x] 1.2 Extend `storage.test.ts`: `health()` succeeds on a writable directory and fails on an unwritable one, and `put` never overwrites an existing key. Verify with `npm test --workspace @atlas/api`.
- [x] 1.3 In `apps/api/Dockerfile`, create `/data/documents` owned by `atlas:atlas` in the runtime stage before `USER atlas`. Verify by inspecting the Dockerfile diff, and on the test deploy by `/health` reporting `storage: ok`.

## 2. Compose and configuration

- [x] 2.1 In `compose.yaml`:
  - remove `minio`, `minio-init` and `object-backup` and the `minio_data` volume
  - drop the API's dependency on `minio-init` and its `S3_*` variables
  - set `STORAGE_DIR: /data/documents` and mount the new `documents_data` volume there

  Verify: `docker compose config` isn't runnable here (no Docker), so parse the file with a YAML parser and check that no service references `minio` and that the api mounts `documents_data`.
- [x] 2.2 Add a `document-backup` service (`postgres:16-alpine`, `documents_data` read-only, `object_backups` read-write) that copies missing files daily into `/backups/current/<key>` and writes `last-success`, with the existing freshness health check. Verify by running its script with a POSIX `sh` (dash, as BusyBox is not installed here) against sample directories: new files are copied, existing ones left untouched, and the marker is written.
- [x] 2.3 Remove `MINIO_ROOT_*` and `S3_*` from `.env.example` and `.github/workflows/ci.yml`. Verify: `grep -ri minio compose.yaml .env.example .github` finds nothing, and the CI compose job env still covers every `:?` required variable in `compose.yaml`.

## 3. Documentation

- [x] 3.1 Update `README.md`, `SECURITY.md` and `docs/ARCHITECTURE.md` (runtime services, data ownership, single-instance note) and `docs/DEPLOYMENT.md` (no MinIO variables; back up the documents volume). Verify: `grep -rni minio README.md SECURITY.md docs/*.md` shows only the migration section.
- [x] 3.2 Update `docs/OPERATIONS.md`: backup and restore of `documents_data` from `object_backups/current`, the one-time migration from an existing MinIO mirror (reading uid/gid from the image), the `chown` fix for a mis-owned volume, and removal of the orphaned `minio_data` volume. Verify that the commands are consistent with the service and volume names in `compose.yaml`.

## 4. Integration check

- [x] 4.1 Run `npm run typecheck && npm test && npm run build` and verify all pass.
- [ ] 4.2 Deploy to the Coolify test app together with `add-multiple-crm-funnels`. Verify:
  - the deployment pulls no MinIO image and finishes
  - `/health` returns 200 with `features.storage: local`
  - a document uploads, downloads byte-identically, and takes a new version
  - after a second redeploy the document still downloads
- [x] 4.3 Run `openspec validate replace-minio-with-volume-storage --strict` and verify it passes.
