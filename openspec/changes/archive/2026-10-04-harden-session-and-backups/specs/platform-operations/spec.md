# Spec Delta

## ADDED Requirements

### Requirement: Encrypted backups
When `BACKUP_AGE_RECIPIENT` holds an age public key, the system SHALL:
- encrypt every nightly database dump and every newly backed-up document file to that recipient before writing it to the backup volume;
- verify each dump with `pg_restore --list` before encrypting;
- delete the plaintext afterwards.

The private key SHALL NOT be needed on the server. An invalid recipient SHALL stop the backup worker so that its health check fails. Without the variable, backups SHALL be written unencrypted with a warning in the logs.

#### Scenario: Encrypted nightly dump
- **WHEN** the backup worker runs with a valid recipient
- **THEN** the volume gains `atlas-<time>.dump.age` starting with the `age-encryption.org/v1` header, and no plaintext dump remains

#### Scenario: Invalid recipient
- **WHEN** `BACKUP_AGE_RECIPIENT` is not a valid age public key
- **THEN** the worker exits with an error and its health check fails
