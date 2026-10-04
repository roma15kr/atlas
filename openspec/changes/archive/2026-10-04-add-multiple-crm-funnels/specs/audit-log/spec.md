# Spec Delta

## MODIFIED Requirements

### Requirement: Audited actions
The system SHALL audit at least the following actions:
- login success and denial
- team member creation and consent changes
- client list, view, create, update, delete, comment, and export success or denial
- deal changes
- funnel creation, update and deletion, and funnel access changes
- stage creation, update, reordering and deletion (with the number of relocated deals)
- denied funnel configuration attempts
- task changes
- document upload, new version and download
- report creation
- alert acknowledgement
- AI analysis requests
- message send, denial and linking

#### Scenario: Denied action
- **WHEN** a denied export or login occurs
- **THEN** an event whose action ends in `DENIED` is written

#### Scenario: Denied funnel configuration
- **WHEN** a non-director tries to change a funnel or stage
- **THEN** a `FUNNEL_CONFIG_DENIED` event with the attempted operation is written

#### Scenario: Access change trail
- **WHEN** a DIRECTOR changes a funnel's access
- **THEN** a `FUNNEL_ACCESS_UPDATED` event records the previous and new mode, departments and users
