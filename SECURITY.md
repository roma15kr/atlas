# Security policy

Atlas handles employee activity metadata and customer records. Treat reports of
authorization bypass, cross-department data exposure, export access, session
handling, object-storage access, and audit tampering as high priority.

Do not open a public issue containing a vulnerability, real customer data,
credentials, tokens, database dumps, or deployment logs with secrets. Report the
issue privately to the repository owner and include the affected route, role,
expected scope, reproduction steps, and the smallest useful evidence set.

## Deployment baseline

- Use unique high-entropy database, Redis, JWT, refresh-token, and object-storage
  secrets. Never reuse the Coolify API token as an application secret.
- Require HTTPS and `COOKIE_SECURE=true` in production; startup rejects weaker settings.
- Make PostgreSQL, Redis, MinIO, and the API reachable only on the internal network.
- Keep `SEED_DEMO_DATA=false` in production and protect the one-time director
  bootstrap password as an operational secret.
- Restrict Coolify and GitHub access to named administrators with 2FA.
- Verify daily backups and perform a restore drill at least quarterly.
- Obtain documented employee consent for presence and audit metadata collection.
- Review audit logs for failed login bursts, bulk access, exports, and access
  outside expected hours.

Dependencies are pinned by `package-lock.json` and checked in CI. Apply security
updates through a reviewed branch, run the full build and smoke tests, then use
Coolify's previous deployment for rollback if production health regresses.
