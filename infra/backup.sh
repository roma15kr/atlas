#!/bin/sh
set -eu

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  pg_dump --format=custom --file="/backups/atlas-${timestamp}.dump"
  find /backups -type f -name 'atlas-*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
  sleep 86400
done
