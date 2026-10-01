# Design

## Context

- `sessionStore` in `lib/api.ts` persists `{ accessToken, user }` in `localStorage['atlas.session']`.
- The refresh cookie `atlas_refresh` is httpOnly, scoped to `/api/v1/auth` and rotated on every refresh. Reusing a revoked token revokes its whole family.
- `AppContext` opens the socket with `auth: { token }` and recreates it whenever `session.accessToken` changes.
- The backup services run inline shell in `compose.yaml` on `postgres:16-alpine`, which has no `openssl`, `gpg` or `age` (checked against the image layers).

## Decisions

### 1. Memory session store
- `sessionStore.get()` and `set()` work on a module variable.
  - `set(real)` writes `localStorage['atlas.signedIn'] = '1'`.
  - `set(null)` removes it.
  - Demo sessions (`demo-` tokens) are still persisted whole under `atlas.demoSession`, because they carry no secret.
- `restoreSession()` runs at app start:
  - if a demo session is stored, use it;
  - else if `atlas.signedIn` is set, call refresh. On success, set the session; on failure, clear the hint;
  - it always removes the legacy `atlas.session` key.
- `AuthProvider` starts in a `restoring` state, and `App` shows a centered spinner until it settles. This avoids a flash of the login screen.
- Logout clears memory and the hint, as before calling `/auth/logout`.

### 2. Serialized refresh
- `refreshAccessToken` wraps the fetch in `navigator.locks.request('atlas-refresh', …)` when available.
- Inside the lock, it first checks whether another tab already refreshed. Tabs share no memory, so each tab still refreshes once. The lock guarantees the requests are sequential, so each one presents the cookie the previous one set.
- Without Web Locks, it waits a random 0-300 ms before refreshing, which reduces but does not remove the race. All supported Chrome versions have Web Locks.
- The in-tab `refreshPromise` deduplication stays.

### 3. Socket auth
- `io({ auth: (cb) => cb({ token: sessionStore.get()?.accessToken }) })`.
- The socket effect depends on the user id instead of the token.
- On `connect_error` with `unauthorized`, the app calls `refreshAccessToken()` and then `socket.connect()` once.

### 4. Backup image and scripts
- **`infra/backup.Dockerfile`:**
  - `FROM postgres:16-alpine`
  - `RUN apk add --no-cache age`
  - `COPY infra/backup.sh infra/document-backup.sh /usr/local/bin/`
  - `chmod +x`
- **`backup.sh`:**
  - `pg_dump` to `/tmp/atlas-<ts>.dump`, then `pg_restore --list` to verify it.
  - With a recipient: `age -r "$BACKUP_AGE_RECIPIENT" -o /backups/.partial`, then rename to `atlas-<ts>.dump.age`. Without one: move the plain dump as today.
  - Remove the temporary file.
  - Retention deletes both `atlas-*.dump` and `atlas-*.dump.age` older than `BACKUP_RETENTION_DAYS`.
  - It writes `last-success` and `last-mode` (`encrypted` or `plain`).
- **`document-backup.sh`:**
  - Same loop as today. The target is `<key>.age` when encrypting, and it is skipped if either `<key>` or `<key>.age` exists.
  - Existing plain copies are not re-encrypted automatically. The docs give a one-time command.
- **Recipient check.** Both scripts validate the recipient with `age -r "$R" -o /dev/null </dev/null`. On failure they exit, so the container restarts and its healthcheck fails visibly.
- **On-demand dumps.** The pre-migration dump commands in the docs keep working, because `pg_dump` stays in the image.
- **Compose:** `backup` and `document-backup` use `build: { context: ., dockerfile: infra/backup.Dockerfile }`, with entrypoints `backup.sh` and `document-backup.sh`. Healthchecks are unchanged.

### 5. Operations
- Generate a key offline: `age-keygen -o atlas-backup.key`. Store the private key in the password manager and set `BACKUP_AGE_RECIPIENT` to the printed public key.
- Restore: `age -d -i atlas-backup.key atlas-….dump.age > atlas.dump`, then the existing `pg_restore` procedure.
- Verify encryption: `docker compose exec backup sh -c 'cat /backups/last-mode; head -c 21 $(ls -t /backups/*.age | head -1)'` prints `encrypted` and `age-encryption.org/v1`.

### Access rules
Unchanged.

### Migrations and audit
- No migration.
- No new audit events.

### Risks
- **Losing the private key makes encrypted backups useless.** The docs require storing it in two places and running a restore drill.
- **Backup image build.** The backup services now build an image, which needs network access to Alpine's package mirror during the build. Coolify already builds the api and web images, so this adds no new requirement.
