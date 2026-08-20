# Atlas

Atlas is a self-hosted virtual office for a focused company team. It brings
presence, CRM, sales and personal Kanban boards, documents, KPI reporting,
achievements, operational alerts, and communication integrations into one
role-aware workspace.

The interface is Russian-first and optimized for desktop Chrome. The runtime is
fully containerized and exposes a single web origin; PostgreSQL, Redis, object
storage, and the API remain private behind the gateway.

## Included in this release

- JWT authentication with rotating refresh sessions, login throttling, and
  `DIRECTOR`, `MANAGER`, and `EMPLOYEE` scopes.
- Live Socket.IO presence with heartbeat expiry and presence history.
- Department- and owner-scoped CRM clients, deals, comments, and sales stages.
- Director-only bulk CSV export with audit records for access and denied attempts.
- Personal tasks, due dates, deal links, and a three-column Kanban workflow.
- Private document metadata, versions, upload/download checks, and MinIO storage.
- Team profiles, KPI progress, achievement scoring, reports, and alert review.
- Explicit monitoring consent and metadata-only risk signals.
- Server-side configuration gates for Claude, Gmail, Outlook, Telegram, WhatsApp,
  and Viber. No integration is presented as connected without credentials.
- Daily PostgreSQL dumps, health checks, CI, and a Coolify-oriented runbook.

## Start locally

```bash
cp .env.example .env
# Replace every placeholder in .env with an independent random value.
docker compose up --build -d
```

Open `http://localhost:8080`. The seeded review accounts are:

| Role | Login | Initial password |
| --- | --- | --- |
| Director | `director` | `AtlasDemo2026!` |
| Department manager | `manager` | `AtlasDemo2026!` |
| Employee | `employee` | `AtlasDemo2026!` |

These credentials are for initial acceptance only. Change or disable them before
loading real customer or employee data.

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

Set every secret through Coolify rather than committing `.env`. Enable HTTPS,
keep the data containers off public ports, replicate encrypted backups away from
the application server, and rotate the provisioning API token after deployment.
External OAuth and messaging providers require their own reviewed applications
and consent screens before they can be enabled.

