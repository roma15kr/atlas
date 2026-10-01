# Proposal

## Why

The baseline audit flagged two weaknesses:
- **Access token in `localStorage`.** Any script injected into the page (for example, through a compromised dependency) can read the token and keep using the API from elsewhere until it expires. The refresh cookie is already httpOnly, so storing the token is unnecessary.
- **Unencrypted backups.** Nightly database dumps and document copies are plain files on the backup volume. The brief asked for encrypted backups. Anyone who obtains the volume, or a copy of it, can read every client, deal and document.

## What Changes

- **Session kept in memory.**
  - The web app keeps the access token and user only in memory. On page load it restores the session through `POST /auth/refresh`, using the httpOnly cookie.
  - `localStorage` keeps only a "signed in" hint, so the app knows to try a restore, plus the demo session in demo builds.
  - The legacy `atlas.session` entry is deleted on first load.
- **Safe refresh across tabs.** Refreshes in several tabs are serialized with the browser's Web Locks API, so rotating the refresh token in one tab never makes another tab look like a token thief and log everyone out. Browsers without Web Locks fall back to a short random delay.
- **Socket uses the current token.** Reconnects use the token current at that moment, so a refreshed session no longer tears down and rebuilds the socket every 15 minutes.
- **Encrypted backups.**
  - The `backup` and `document-backup` services use a small image built from `postgres:16-alpine` with `age` installed. Their scripts move out of `compose.yaml` into `infra/`.
  - With `BACKUP_AGE_RECIPIENT` set (an `age1…` public key), each dump is checked with `pg_restore --list` in the container's temporary storage, encrypted to `atlas-<time>.dump.age`, and the plaintext deleted. Each new document file is stored as `<key>.age`.
  - Only the public key lives on the server. The private key needed to restore stays offline with the owner.
  - Without the variable, backups stay plain as today, and the container logs a warning every night.
- **Cleanup.** The unused `infra/object-backup.sh` from the MinIO era is removed.

## Capabilities

### Modified Capabilities
- `web-workspace`: session handling.
- `platform-operations`: encrypted backups.

## Impact

- **Web:** `lib/api.ts` (memory session store, lock-serialized refresh, restore), `context/AppContext.tsx` (restore on start, socket auth callback), `App.tsx` (a restoring splash).
- **Deployment:**
  - new `infra/backup.Dockerfile`, `infra/backup.sh` (rewritten) and `infra/document-backup.sh`;
  - `compose.yaml` services `backup` and `document-backup` use `build:`;
  - `.env.example` gains `BACKUP_AGE_RECIPIENT`;
  - `docs/OPERATIONS.md` covers key generation, restore and verification.
- **API:** no change. Refresh already works from the cookie alone.
- **Database:** no migration.
