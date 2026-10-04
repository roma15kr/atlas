# Spec Delta

## MODIFIED Requirements

### Requirement: Audited actions
The system SHALL audit at least:
- login success and denial;
- team member creation;
- consent changes;
- client list, view, create, update, delete, comment and export success or denial;
- deal changes;
- funnel creation, update and deletion, and funnel access changes;
- stage creation, update, reordering and deletion (with the number of relocated deals);
- denied funnel configuration attempts;
- task changes;
- document upload, new version and download;
- report creation;
- alert acknowledgement;
- AI analysis requests;
- mailbox connection, disconnection and failed connection, mail sends and send failures, mail thread linking and unlinking, and denied access to linked history, as listed in `email-client`;
- chat channel creation, settings changes, archiving, membership and admin changes, and denied attempts: `CHAT_CHANNEL_CREATED`, `CHAT_CHANNEL_UPDATED`, `CHAT_CHANNEL_ARCHIVED`, `CHAT_MEMBER_ADDED`, `CHAT_MEMBER_REMOVED`, `CHAT_ADMIN_CHANGED`, and their `_DENIED` variants;
- deletion of another person's chat message (`CHAT_MESSAGE_MODERATED`).

Message text, mail subjects, email addresses and credentials SHALL NOT be written to the audit log. Ordinary chat messages, edits, reads and a user's own deletions SHALL NOT be audited.

#### Scenario: Denied action
- **WHEN** a denied export or login occurs
- **THEN** an event whose action ends in `DENIED` is written

#### Scenario: Denied funnel configuration
- **WHEN** a non-director tries to change a funnel or stage
- **THEN** a `FUNNEL_CONFIG_DENIED` event with the attempted operation is written

#### Scenario: Access change trail
- **WHEN** a DIRECTOR changes a funnel's access
- **THEN** a `FUNNEL_ACCESS_UPDATED` event records the previous and new mode, departments and users

#### Scenario: Moderator deletes a message
- **WHEN** a channel admin deletes a colleague's message
- **THEN** `CHAT_MESSAGE_MODERATED` is written with the conversation and message ids and without the message text
