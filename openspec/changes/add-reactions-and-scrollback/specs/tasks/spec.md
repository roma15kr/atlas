## ADDED Requirements

### Requirement: Task comment reactions
Anyone who can see a task SHALL be able to add and remove their own emoji reactions on its comments, from the same quick row and picker as chat. Each comment SHALL show every emoji used with its count, which ones are the viewer's, and who reacted. A comment on a task the user cannot see SHALL answer 404 `TASK_NOT_FOUND`. Reactions SHALL NOT notify anyone.

#### Scenario: Thanking for an update
- **WHEN** Денисюк reacts 🙏 to Тимошенко's comment «КП отправлено»
- **THEN** the comment shows «🙏 1» with her name in the tooltip

#### Scenario: Task out of sight
- **WHEN** a user reacts to a comment on a personal task of someone else
- **THEN** the response is 404 `TASK_NOT_FOUND` and nothing is stored
