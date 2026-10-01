# Tasks

## 1. Web session

- [x] 1.1 Memory `sessionStore`, `restoreSession`, the signed-in hint, demo persistence, and legacy key removal. Verify with unit tests: after a reload the token is not in `localStorage`, a restore via a mocked refresh sets the session, and a failed restore shows login.
- [x] 1.2 Web Locks serialized refresh with fallback. Verify with a unit test that two concurrent refreshes in one tab make one request and the lock is requested.
- [x] 1.3 Restoring splash in `App.tsx`, and the socket auth callback with reconnect on `unauthorized`. Verify with tests: the login screen doesn't flash during a restore, and token refresh doesn't recreate the socket.

## 2. Backups

- [x] 2.1 Add `infra/backup.Dockerfile`, `infra/backup.sh` and `infra/document-backup.sh`, remove `infra/object-backup.sh`, and update `compose.yaml` and `.env.example`. Verify with `shellcheck`-style review and `docker compose config` in CI (the existing compose validation job).
- [x] 2.2 Encryption round-trip test with Node's `age-encryption` package (a dev dependency in a script under `infra/test`): encrypt a sample dump in `age` format, decrypt it with the generated identity, and confirm identical bytes. This checks the documented restore path.
- [x] 2.3 `docs/OPERATIONS.md`: key generation, restore, verification, and re-encrypting existing plain copies.

## 3. Verification

- [x] 3.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate harden-session-and-backups --strict`.
- [ ] 3.2 On the test app:
  - sign in, reload: still signed in, and `localStorage` holds no token;
  - two tabs stay signed in across a token refresh;
  - with `BACKUP_AGE_RECIPIENT` set, the deploy is healthy and the backup container's healthcheck passes;
  - record whether the encrypted file header could be confirmed.
