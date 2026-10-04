# Proposal

## Why

Atlas stores uploaded document files in MinIO. MinIO has discontinued its community edition: the `minio/minio` and `minio/mc` GitHub repositories are archived, the binary downloads return 410 Gone, and the Docker Hub images Atlas pins no longer exist. Every deployment now fails while pulling those images, so no change, including `add-multiple-crm-funnels`, can ship. Atlas serves about 20 people from one server and only needs to write, read, and delete immutable files. A separate object-storage service is more than that requires.

## What Changes

- Document files are stored on a dedicated Docker volume mounted into the API container, using the local file storage Atlas already has and tests.
- Production no longer requires S3 credentials. The S3 storage driver stays available and is used only when `S3_ENDPOINT` and credentials are configured, keeping a path open to shared storage if Atlas ever runs several API servers.
- **BREAKING (deployment)**: the `minio`, `minio-init` and `object-backup` services, the `minio_data` volume, and the `MINIO_ROOT_*` / `S3_*` settings are removed from `compose.yaml`, `.env.example` and CI. Installations that already hold documents in MinIO copy them into the new volume once, using a documented procedure. The test deployment has no documents.
- The nightly document backup copies new files from the document volume into the existing `object_backups` volume, so the backup location and restore drill stay familiar.
- The health check keeps reporting storage status, now as `storage: local`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `platform-operations`: the production configuration guard stops requiring S3 credentials; daily backups cover the document volume instead of a MinIO bucket; a new requirement states that document files persist on a dedicated volume across redeploys.

## Impact

- **Code**: `apps/api/src/storage.ts` (production guard), `apps/api/Dockerfile` (writable `/data/documents` owned by the runtime user), tests in `storage.test.ts`.
- **Deployment**: `compose.yaml` (remove three services and the MinIO volume, add a `documents_data` volume, replace the backup job), `.env.example`, `.github/workflows/ci.yml`.
- **Docs**: `README.md`, `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` (including the one-time copy from an existing MinIO mirror).
- **Operations**: Coolify's `MINIO_ROOT_*` and `S3_*` variables become unused and can be deleted after a successful deploy. The old `minio_data` volume stays on the server until someone removes it deliberately.
- **Unchanged**: the documents API, access checks, versioning (each version already gets its own immutable file), and audit events.
