#!/bin/sh
# Exercises infra/backup.sh and infra/document-backup.sh once each with stand-in pg_dump and
# pg_restore and the real age binary, then decrypts with the private key exactly as the
# restore procedure in docs/OPERATIONS.md does. Usage: AGE_BIN_DIR=/path/to/age infra/test/backup-roundtrip.sh
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/bin" "$root/backups" "$root/docs/ab" "$root/doc-backups" "$root/work"
cat > "$root/bin/pg_dump" <<'SH'
#!/bin/sh
for arg in "$@"; do case "$arg" in --file=*) printf 'PGDMP fake custom dump %s\n' "$(date +%s)" > "${arg#--file=}";; esac; done
SH
cat > "$root/bin/pg_restore" <<'SH'
#!/bin/sh
grep -q '^PGDMP' "$2"
SH
chmod +x "$root/bin/pg_dump" "$root/bin/pg_restore"
export PATH="$root/bin:${AGE_BIN_DIR:?set AGE_BIN_DIR}:$PATH"
age-keygen -o "$root/key.txt" 2>/dev/null
recipient="$(age-keygen -y "$root/key.txt")"

# 1. An invalid recipient stops the worker.
if BACKUP_AGE_RECIPIENT=not-a-key BACKUP_DIR="$root/backups" WORK_DIR="$root/work" BACKUP_ONCE=1 sh "$here/backup.sh" 2>/dev/null; then
  echo "FAIL: invalid recipient accepted"; exit 1
fi

# 2. Encrypted dump: ciphertext only, verified header, decrypts to the original.
BACKUP_AGE_RECIPIENT="$recipient" BACKUP_DIR="$root/backups" WORK_DIR="$root/work" BACKUP_ONCE=1 sh "$here/backup.sh"
dump="$(ls "$root"/backups/atlas-*.dump.age)"
[ "$(head -c 21 "$dump")" = "age-encryption.org/v1" ] || { echo "FAIL: missing age header"; exit 1; }
[ -z "$(ls "$root"/backups/*.dump 2>/dev/null)" ] || { echo "FAIL: plaintext dump left"; exit 1; }
[ -z "$(ls "$root"/work)" ] || { echo "FAIL: temporary dump left"; exit 1; }
[ "$(cat "$root/backups/last-mode")" = encrypted ] || { echo "FAIL: last-mode"; exit 1; }
age -d -i "$root/key.txt" "$dump" | grep -q '^PGDMP' || { echo "FAIL: decrypted dump"; exit 1; }

# 3. Without a recipient the dump stays plain, as before.
BACKUP_DIR="$root/backups" WORK_DIR="$root/work" BACKUP_ONCE=1 sh "$here/backup.sh" 2>/dev/null
[ -n "$(ls "$root"/backups/atlas-*.dump 2>/dev/null)" ] || { echo "FAIL: plain dump"; exit 1; }

# 4. Documents: new files encrypted, already backed-up keys skipped.
printf 'contract body' > "$root/docs/ab/new-key"
printf 'old body' > "$root/docs/ab/old-key"
mkdir -p "$root/doc-backups/current/ab" && printf 'old body' > "$root/doc-backups/current/ab/old-key"
BACKUP_AGE_RECIPIENT="$recipient" BACKUP_DIR="$root/doc-backups" DOCUMENTS_DIR="$root/docs" BACKUP_ONCE=1 sh "$here/document-backup.sh"
[ "$(age -d -i "$root/key.txt" "$root/doc-backups/current/ab/new-key.age")" = "contract body" ] || { echo "FAIL: document round trip"; exit 1; }
[ ! -e "$root/doc-backups/current/ab/old-key.age" ] || { echo "FAIL: re-encrypted an existing copy"; exit 1; }
[ -f "$root/doc-backups/last-success" ] || { echo "FAIL: document last-success"; exit 1; }

echo "backup round trip: all checks passed"
