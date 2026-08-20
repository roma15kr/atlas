# Deployment

## Local production-shaped run

1. Copy `.env.example` to `.env` and replace every placeholder secret.
2. Run `docker compose up --build -d`.
3. Open `http://localhost:8080` and check `http://localhost:8080/health`.

Only the web gateway binds a host port. PostgreSQL, Redis, MinIO, and the API
stay on the private Compose network.

## Coolify

Create a Docker Compose application from this Git repository and select
`compose.yaml`. Configure every required value from `.env.example` in Coolify,
using independently generated secrets. Point the public domain at the `web`
service on port `80`, enable HTTPS, and leave all data services private.

After the first healthy deployment, change the seeded demo passwords, configure
off-server encrypted backup replication, and rotate the Coolify API token used
during provisioning.

