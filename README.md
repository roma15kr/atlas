# Atlas

Atlas is a self-hosted virtual office for a focused company team. It brings
presence, CRM, sales and personal Kanban boards, documents, KPI reporting,
achievements, operational alerts, and communication integrations into one
role-aware workspace.

The interface is Russian-first and optimized for desktop Chrome. The runtime is
fully containerized and exposes a single web origin; PostgreSQL, Redis, object
storage, and the API remain private behind the gateway.

Production: [atlas.141.94.30.173.sslip.io](https://atlas.141.94.30.173.sslip.io)

## Included in this release

- JWT authentication with rotating refresh sessions, login throttling, and
  `DIRECTOR`, `MANAGER`, and `EMPLOYEE` scopes.
- Live Socket.IO presence with heartbeat expiry and presence history.
- Department- and owner-scoped CRM clients, deals, comments, and sales stages.
- Director-only bulk CSV export with audit records for access and denied attempts.
- Personal tasks, due dates, deal links, and a three-column Kanban workflow.
- Private document metadata, versions, upload/download checks, and MinIO storage.
- Team profiles, KPI progress, achievement scoring, reports, and alert review.
- Director/manager team onboarding with strong initial-password policy and
  department-safe role assignment.
- Explicit monitoring consent and metadata-only risk signals.
- Server-side configuration gates for Claude, Gmail, Outlook, Telegram, WhatsApp,
  and Viber. No integration is presented as connected without credentials.
- Daily PostgreSQL dumps, health checks, CI, and a Coolify-oriented runbook.

## Start locally

```bash
cp .env.example .env
# Replace every placeholder in .env with an independent random value.
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

Open `http://localhost:8080`. The seeded review accounts are:

| Role | Login | Initial password |
| --- | --- | --- |
| Director | `director` | `AtlasDemo2026!` |
| Department manager | `manager` | `AtlasDemo2026!` |
| Employee | `employee` | `AtlasDemo2026!` |

These accounts are created only by the local Compose override. Production rejects
demo seeding and creates a single director from the random Coolify bootstrap secret.
That director can add the real team from the **Команда** screen after signing in.

## Development

Node.js 22 is the supported toolchain. With dependencies installed:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

The API contract is mounted under `/api`, health is available at `/health`, and
Socket.IO uses `/socket.io`. Nginx proxies all three paths to the API container.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
- [Security policy](SECURITY.md)
- [Original product brief](prompt_virtualny_ofis.md)

## Production notes

Set every secret through Coolify rather than committing `.env`. Set the assigned
HTTPS origin as `PUBLIC_URL`, keep `COOKIE_SECURE=true`, and provide a unique
`BOOTSTRAP_ADMIN_PASSWORD` for the first director. Production Compose publishes no
host port; Coolify routes only the internal web port. Replicate encrypted backups
away from the application server and rotate the provisioning API token after deployment.
External OAuth and messaging providers require their own reviewed applications
and consent screens before they can be enabled.
