# Operations runbook

## Release checks

Before deployment, run `npm ci`, `npm run typecheck`, `npm test`, `npm run
build`, and `docker compose config --quiet`. A release is ready only when the
Git commit being deployed matches the tested commit.

After deployment, run:

```bash
ATLAS_URL=https://atlas.example.com \
ATLAS_DIRECTOR_PASSWORD='current-password' \
./scripts/smoke.sh
```

The script always checks real dependency health and director dashboard/export
access. Set `ATLAS_EMPLOYEE_PASSWORD` (and optionally `ATLAS_EMPLOYEE_USER`) to
also verify the employee export denial. It keeps access tokens in a temporary
directory and does not print them.

## Backups and restore

The `backup` container writes a verified PostgreSQL custom-format dump every 24
hours. The `document-backup` container copies every document file it has not
copied before from the `documents_data` volume into `object_backups/current/`,
keeping each file's storage key as its path. Files are never modified after
upload, so this copy is complete. Both containers write `last-success` markers
used by their health checks.

Replicate `postgres_backups` and `object_backups` to a different host; with
`BACKUP_AGE_RECIPIENT` set (below) their contents are already encrypted. On
restore, stop API writes, restore the selected dump into a fresh PostgreSQL
database with `pg_restore --clean --if-exists`, copy the
document files back, then start the API and run the smoke test:

```bash
docker compose stop api
uid_gid="$(docker compose run --rm --no-deps --entrypoint id api -u atlas):$(docker compose run --rm --no-deps --entrypoint id api -g atlas)"
docker compose run --rm --no-deps -v "$(docker volume ls -q | grep '_object_backups$'):/from:ro" \
  --entrypoint sh api -c "cp -a /from/current/. /data/documents/"
docker run --rm -v "$(docker volume ls -q | grep '_documents_data$'):/to" postgres:16-alpine chown -R "$uid_gid" /to
docker compose start api
```

Test this procedure quarterly with a disposable environment.

### Encrypted backups

Set `BACKUP_AGE_RECIPIENT` to an [age](https://age-encryption.org) public key to
encrypt every new dump (`atlas-<time>.dump.age`) and every newly copied document
(`<key>.age`). The dump is verified with `pg_restore --list` in the container's
temporary storage first, and no plaintext reaches the backup volume. Only the
public key is on the server.

1. On a trusted computer, not the server: `age-keygen -o atlas-backup.key`. It
   prints the public key (`age1…`). Store `atlas-backup.key` in the password
   manager and in a second offline place; without it the backups cannot be
   restored.
2. Set `BACKUP_AGE_RECIPIENT` to the public key in the deployment variables and
   redeploy. An invalid key stops both backup workers and their health checks fail.
3. Verify after the next run (the first one runs at container start):

   ```bash
   docker compose exec backup sh -c 'cat /backups/last-mode; head -c 21 "$(ls -t /backups/*.age | head -1)"; echo'
   ```

   It prints `encrypted` and `age-encryption.org/v1`.

To restore, copy the file to the trusted computer and decrypt it first, then
follow the procedure above:

```bash
age -d -i atlas-backup.key atlas-20261001T000000Z.dump.age > atlas.dump
age -d -i atlas-backup.key <key>.age > <key>      # each document file
```

Document copies made before encryption was turned on stay as plain files (each
key is backed up once). To encrypt them too, run once:

```bash
docker compose exec document-backup sh -c 'cd /backups/current && find . -type f ! -name "*.age" | while read -r f; do age -r "$BACKUP_AGE_RECIPIENT" -o "$f.age" "$f" && rm "$f"; done'
```

Without the variable, backups are written unencrypted as before and the
workers log a warning every night. `infra/test/backup-roundtrip.sh` checks the
scripts end to end with the real `age` binary (run in CI).

If `/health` reports `storage: error` after a deploy, the document volume is not
writable by the API user. Fix ownership with the last `docker run ... chown`
line above.

## Moving documents out of MinIO (one time)

Releases before the switch to the document volume stored files in MinIO, whose
images are no longer published. Installations that already hold documents move
them once:

1. Before deploying the new release, confirm the old `object-backup` container
   reported a recent `last-success`. Its `object_backups/current/` mirror holds
   every file under the same storage keys the database uses.
2. Deploy the new release, then run the restore commands above (the `cp -a` and
   `chown` lines). They copy `object_backups/current/` into `documents_data`.
3. Open a few documents in **Документы** and download them.
4. Delete the unused `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and `S3_*`
   variables from Coolify, and, once the documents are verified, remove the
   orphaned volume with `docker volume rm <project>_minio_data`.

## Deploying migration 004 (CRM funnels)

`database/004_crm_funnels.sql` moves every company's stages and deals into one
company-wide funnel and drops the legacy `deals.stage`, `deal_stages.key`, and
`deal_stages.is_closed` columns. It cannot be rolled back in place. Immediately
before deploying it, take a manual dump next to the daily backups:

```bash
docker compose exec backup sh -c 'f="/backups/atlas-pre-004-$(date -u +%Y%m%dT%H%M%SZ).dump"; pg_dump --format=custom --file="$f" && pg_restore --list "$f" >/dev/null && ls -l "$f"'
```

After the deploy, confirm the Sales board shows the same deals per stage and the
dashboard pipeline is unchanged. To roll back, stop the API, restore that dump
with the procedure above, and redeploy the previous image.

## Deploying migration 005 (task boards)

`database/005_task_boards.sql` gives every department a "Задачи отдела" board with
the stages Нужно сделать / В работе / Готово, moves each task to its department's
board by status, copies assignees into `task_assignees`, and puts department-less
tasks on one "Задачи руководства" board per company with their assignees as
members. It then drops `tasks.status`, `tasks.assignee_id` and the `task_status`
type, so it cannot be rolled back in place. New departments get a default board
from a database trigger. Immediately before deploying, take a manual dump:

```bash
docker compose exec backup sh -c 'f="/backups/atlas-pre-005-$(date -u +%Y%m%dT%H%M%SZ).dump"; pg_dump --format=custom --file="$f" && pg_restore --list "$f" >/dev/null && ls -l "$f"'
```

After the deploy, check that task counts per stage on each department board match
the old To do / In progress / Done counts and that the dashboard task metric is
unchanged for a director. Tell employees that boards are shared: they now see
their colleagues' tasks on their department's boards. To roll back, stop the
API, restore that dump with the procedure above, and redeploy the previous image.

## Deploying migrations 006 and 007 (team chat, email)

`006_team_chat.sql` is additive: chat tables, an "Общий" channel per company with
every active user, and triggers that keep it in sync. Nothing to prepare.

`007_email_client.sql` adds the mail tables and **drops the old `messages` table**
and its enum types. That table never held real external mail (no adapter existed
and internal sends had no recipient), but check and keep a dump first:

```bash
docker compose exec postgres psql -U atlas -d atlas -c "SELECT channel, count(*) FROM messages GROUP BY 1"
docker compose exec backup sh -c 'f="/backups/atlas-pre-007-$(date -u +%Y%m%dT%H%M%SZ).dump"; pg_dump --format=custom --file="$f" && pg_restore --list "$f" >/dev/null && ls -l "$f"'
```

## Deploying migrations 009, 010 and 011 (accounts, KPIs, alerts, reports)

Both are additive. `009_user_administration.sql` adds `users.must_change_password`
and `password_changed_at`; nobody is forced to change a password by the upgrade.
`010_kpi_management.sql` adds KPI sources and periods and the
`deals_close_date` trigger, and backfills `closed_at` of already won or lost
deals with their last update time (an estimate; reports by close date for past
months use it).

`011_alert_rules_reports.sql` adds rule columns to `alerts`, schedule columns
and `report_runs`, copies each existing report result as its first run, and
sets the next run of recurring reports to the next 06:00 Kyiv. The first
automation tick after the deploy raises alerts for conditions that already hold,
so expect a burst of alerts on the dashboard; they resolve themselves as the
underlying tasks, deals and KPIs are dealt with.

The automation scheduler starts with the API. `AUTOMATION_INTERVAL_MS`
(default `600000`) sets how often KPIs are recomputed, achievements awarded, alert rules evaluated and due reports run;
`0` turns it off. Only one API instance runs a tick at a time.

## Deploying migration 012 (profile details and photos)

`012_profile_details.sql` is additive: it adds personal fields and photo
columns to `users`, all empty for existing people. Profile photos are stored on
the documents volume (or S3) under the company prefix, so the existing document
backups include them. Photos are served from `/api/v1/avatars/<id>` with a
year-long immutable cache. Nginx needs no change, because the path is under `/api/`.

## Email

Users connect their own mailboxes under Почта → Настройки. Mail is private to its
owner; only threads linked to a client or deal are readable by others, read-only,
through that record's "Переписка".

**Required:** `MAIL_ENCRYPTION_KEY`, 32 random bytes in base64
(`openssl rand -base64 32`). It encrypts mailbox passwords and OAuth refresh
tokens. Without it, connecting mail is disabled. Store it with the other secrets
and back it up: if it is lost, stored credentials can't be opened and every user
must reconnect (no mail is lost). To rotate, set the new key in
`MAIL_ENCRYPTION_KEY` and the old one in `MAIL_ENCRYPTION_KEY_PREVIOUS`; secrets are
re-encrypted as they are used, and the previous key can be removed after a few
days.

Optional settings: `MAIL_SYNC_DAYS` (default 90: how much history is copied),
`MAIL_POLL_SECONDS` (default 120: inbox polling), `MAIL_ALLOW_PRIVATE_HOSTS`
(default `false`; set `true` only for a mail server inside your own network).
Only ports 993/143 (IMAP) and 465/587/25 (SMTP) are accepted.

**Google sign-in (optional).** In Google Cloud Console create an OAuth client of
type *Web application* with the redirect URI `<PUBLIC_URL>/mail/oauth/google`,
enable the Gmail API, and set the OAuth consent screen to **Internal** in the
company's Google Workspace, so the `https://mail.google.com/` scope needs no Google
review. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Personal Gmail users can
connect through "Другая почта" with an app password instead.

**Microsoft 365 sign-in (optional).** In Entra ID register an application with the
redirect URI `<PUBLIC_URL>/mail/oauth/microsoft` (platform *Web*), add the delegated
permissions `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid`,
`email` and `profile` (Office 365 Exchange Online), create a client secret, and set
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID` (your
tenant id, or `common`). SMTP sending also needs *Authenticated SMTP* enabled for
each mailbox (Exchange admin center → mailbox → Email apps); otherwise the
connection test reports that SMTP sending is disabled.

**Sync.** The API process syncs mailboxes in the background (at most five at a
time, inbox every `MAIL_POLL_SECONDS`, other folders every 10 minutes), guarded by
a Postgres advisory lock per mailbox. A mailbox whose login stops working shows
"Требует внимания" and pauses until its owner reconnects. Attachments are fetched
from the mail server on first download and cached on the documents volume (or S3),
so the documents backup covers them. Mail older than the sync window plus seven
days that isn't linked to a client is pruned daily.

## Telegram

Customers write to the company bot; Atlas stores every private chat as a contact,
routes it to a responsible user, and keeps the whole conversation with the CRM
client. Migration `008_telegram_inbox.sql` is additive.

**Settings.** `TELEGRAM_BOT_TOKEN` from @BotFather. In the default
`TELEGRAM_MODE=webhook`, also set `TELEGRAM_WEBHOOK_SECRET` (32+ letters, digits,
`_` or `-`; `openssl rand -hex 32`) and an HTTPS `PUBLIC_URL`; the API registers
`<PUBLIC_URL>/api/telegram/webhook` at startup and refuses requests without the
secret header. `TELEGRAM_MODE=polling` is for servers without HTTPS (local
development): one API instance long-polls under an advisory lock. Without a token,
the Telegram screens show the bot as not configured. The bot serves the first
company in the database.

**Switching an existing bot to Atlas.** Telegram delivers a bot's updates to one
receiver only, so connecting Atlas cuts off any system that handles the bot today.
Telegram keeps undelivered updates for 24 hours, so a short gap loses nothing.
1. Export the customers from the old system: their Telegram user ids *for this
   bot*, and each one's client and responsible manager. Ids collected by another
   bot can't be messaged.
2. Import them under Telegram → Импорт контактов (CSV with `telegram_id` and
   optionally `client_id`, `client_email` or `client_phone`, `responsible`
   (username) and `name`; comma or semicolon). Check the preview; only valid rows
   are applied. Imported contacts show "Не подтверждён" until they write again.
3. In a quiet hour, set the token (and secret) in the deployment and restart, or
   press "Проверить подключение" in Telegram settings. Send a test message from a
   staff Telegram account and check it appears in "Неразобранные".
4. To roll back, unset the token (or call `deleteWebhook`) and let the old system
   register its webhook again. Atlas keeps its data.

**Routing and privacy.** The responsible user, heads of that user's department and
directors read and answer a conversation; unassigned ones are visible to directors
and all heads. Disabling a user returns their contacts to "Неразобранные".
Incoming files up to Telegram's 20 MB bot limit are stored on the documents volume.
A director can delete a contact with all its messages and files (for a data
deletion request) from its conversation.

## Secret rotation

Rotate one dependency at a time and confirm health after each change. Database
and Redis credentials require coordinated server and API updates. Changing `JWT_SECRET` invalidates access tokens; changing
`REFRESH_TOKEN_SECRET` invalidates refresh sessions. Schedule both together and
expect every user to sign in again. Rotate `MAIL_ENCRYPTION_KEY` as described
under Email. To rotate the Telegram bot token, revoke it in @BotFather, set the new
token and restart; the webhook is registered again at startup.

The Coolify provisioning token is not an Atlas runtime secret. Rotate it after
provisioning and keep future tokens least-privileged. Never put a token in Git,
deployment logs, support tickets, or browser storage.

## Incident response

For suspected CRM leakage, disable the affected user, preserve audit and proxy
logs, revoke refresh-token families, rotate relevant credentials, and take a
forensic database snapshot before cleanup. Do not delete audit evidence during
containment.

For a bad application release, use Coolify's previous successful deployment and
run the smoke test. Database migrations are forward-only; when a release changes
the schema, use a reviewed compensating migration instead of editing an applied
file. If data integrity is affected, stop writes and follow the restore procedure.
