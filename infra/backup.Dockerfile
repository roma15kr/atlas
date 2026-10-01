# Backup workers: pg_dump from the Postgres image plus age, to encrypt backups to a public key.
FROM postgres:16-alpine
RUN apk add --no-cache age
COPY infra/backup.sh infra/document-backup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/document-backup.sh
