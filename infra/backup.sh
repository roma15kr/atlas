#!/bin/sh
set -eu

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  partial="/backups/.atlas-${timestamp}.partial"
  destination="/backups/atlas-${timestamp}.dump"
  pg_dump --format=custom --file="${partial}"
  pg_restore --list "${partial}" >/dev/null
  mv "${partial}" "${destination}"
  date -u +%s > /backups/last-success
  find /backups -type f -name 'atlas-*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
  sleep 86400
done
