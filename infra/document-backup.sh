#!/bin/sh
# Nightly incremental copy of document files. Files are immutable, so copying only keys not yet
# backed up is complete. With BACKUP_AGE_RECIPIENT set, each new file is stored as <key>.age.
set -eu

# Directories and a single-run mode are overridable for tests; production uses the defaults.
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DOCUMENTS_DIR="${DOCUMENTS_DIR:-/data/documents}"

recipient="${BACKUP_AGE_RECIPIENT:-}"
if [ -n "$recipient" ]; then
  age -r "$recipient" -o /dev/null < /dev/null || { echo "BACKUP_AGE_RECIPIENT is not a valid age public key" >&2; exit 1; }
fi

mkdir -p "${BACKUP_DIR}/current"
while true; do
  cd "${DOCUMENTS_DIR}"
  if [ -z "$recipient" ]; then echo "WARNING: BACKUP_AGE_RECIPIENT is not set; copying documents unencrypted" >&2; fi
  find . -type f | while IFS= read -r file; do
    target="${BACKUP_DIR}/current/${file#./}"
    # A key already backed up, plain or encrypted, is skipped.
    if [ -e "$target" ] || [ -e "$target.age" ]; then continue; fi
    mkdir -p "$(dirname "$target")"
    if [ -n "$recipient" ]; then
      age -r "$recipient" -o "$target.age.partial" "$file"
      mv "$target.age.partial" "$target.age"
    else
      cp -p "$file" "$target.partial"
      mv "$target.partial" "$target"
    fi
  done
  if [ -n "$recipient" ]; then echo encrypted > "${BACKUP_DIR}"/last-mode; else echo plain > "${BACKUP_DIR}"/last-mode; fi
  date -u +%s > "${BACKUP_DIR}"/last-success
  if [ "${BACKUP_ONCE:-}" = "1" ]; then break; fi
  sleep 86400
done
