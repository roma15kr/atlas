# Deployment

## Local production-shaped run

1. Copy `.env.example` to `.env` and replace every placeholder secret.
2. Run `docker compose -f compose.yaml -f compose.local.yaml up --build -d`.
3. Open `http://localhost:8080` and check `http://localhost:8080/health`.

The local override binds the web gateway to port `8080`. The production Compose
file publishes no host ports; all services stay on the private network.

## Coolify

Create a Docker Compose application from this Git repository and select
`compose.yaml`. Configure every required value from `.env.example` in Coolify,
using independently generated secrets. Set `PUBLIC_URL` to the assigned HTTPS
origin, keep `COOKIE_SECURE=true` and `SEED_DEMO_DATA=false`, and generate a unique
`BOOTSTRAP_ADMIN_PASSWORD`. Point the public domain at the internal `web` service
on port `80`, enable HTTPS, and leave all data services private.

The API creates the first director only when the production user table is empty;
the demo seed is never applied. Sign in as that director and create the real
manager and employee accounts from **Команда**. After the first healthy deployment,
store the bootstrap credential securely, replicate the verified database and
object backup volumes to encrypted off-server storage, perform a restore drill,
and rotate the Coolify API token used during provisioning.
