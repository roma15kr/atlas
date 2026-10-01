#!/bin/sh
# Nightly verified PostgreSQL dump. With BACKUP_AGE_RECIPIENT set, the dump is verified in the
# container's temporary storage, encrypted to that age public key, and only ciphertext reaches
# the backup volume; restoring needs the private key, which never lives on the server.
set -eu

# Directories and a single-run mode are overridable for tests; production uses the defaults.
BACKUP_DIR="${BACKUP_DIR:-/backups}"
WORK_DIR="${WORK_DIR:-/tmp}"

recipient="${BACKUP_AGE_RECIPIENT:-}"
if [ -n "$recipient" ]; then
  # An invalid key must stop the worker so its health check fails visibly.
  age -r "$recipient" -o /dev/null < /dev/null || { echo "BACKUP_AGE_RECIPIENT is not a valid age public key" >&2; exit 1; }
fi

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  work="${WORK_DIR}/atlas-${timestamp}.dump"
  pg_dump --format=custom --file="${work}"
  pg_restore --list "${work}" >/dev/null
  if [ -n "$recipient" ]; then
    age -r "$recipient" -o "${BACKUP_DIR}/.atlas-${timestamp}.partial" "${work}"
    mv "${BACKUP_DIR}/.atlas-${timestamp}.partial" "${BACKUP_DIR}/atlas-${timestamp}.dump.age"
    echo encrypted > "${BACKUP_DIR}"/last-mode
  else
    echo "WARNING: BACKUP_AGE_RECIPIENT is not set; writing an unencrypted dump" >&2
    mv "${work}" "${BACKUP_DIR}/.atlas-${timestamp}.partial"
    mv "${BACKUP_DIR}/.atlas-${timestamp}.partial" "${BACKUP_DIR}/atlas-${timestamp}.dump"
    echo plain > "${BACKUP_DIR}"/last-mode
  fi
  rm -f "${work}"
  date -u +%s > "${BACKUP_DIR}"/last-success
  find "${BACKUP_DIR}" -type f \( -name 'atlas-*.dump' -o -name 'atlas-*.dump.age' \) -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
  if [ "${BACKUP_ONCE:-}" = "1" ]; then break; fi
  sleep 86400
done
