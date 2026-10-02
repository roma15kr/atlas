# Proposal

## Why

Every member has a "Должностная инструкция" (job description) field, and Atlas will later give it to the AI as the reference for what the person is expected to do. Today it is hard to fill in:
- The field is a 3-line box inside the general "Изменить" dialog, next to the name and role.
- The Team panel hides the card when the text is empty, so nobody sees whose description is missing.
- The person can't see in their profile that the description is missing or who fills it in.

## What Changes

- **Team panel.** The "Должностная инструкция" card is always shown.
  - When the text is empty, it says "Не заполнена". People who manage the member get a "Заполнить" button.
  - When there is text, it shows it with line breaks kept. Managers get an "Изменить" button.
- **Editor dialog.** A dedicated dialog with:
  - a large text area;
  - a character counter up to 20,000;
  - a "Вставить шаблон" button, available while the text is empty, that inserts the sections Цель должности, Обязанности, Показатели результата, Полномочия and Взаимодействие;
  - a note that the text will be used for AI recommendations.

  An empty save clears the description. Saving goes through the existing `PATCH /api/v1/team/:id`, with the same rights: a director for anyone in the company, including themselves, and a head for employees of their own department.
- **One place to edit.** The field moves out of the general "Изменить" dialog into the dedicated editor. Onboarding keeps its optional field, which already allows 20,000 characters.
- **Profile.** The person sees their own description, read-only. When it is empty, they see "Не заполнена — заполняет руководитель".
- **Team list.** People who manage members see a "Нет инструкции" badge next to each member they manage who has none, so all of them can be filled in.

## Impact

- Web only: `TeamPage`, `ProfilePage`, `MemberDialogs` (the field is removed from the edit dialog) and a new `JobDescriptionDialog`.
- The API already stores the text, up to 20,000 characters, and audits changes as `TEAM_MEMBER_UPDATED` with `jobDescription` in `fields`. A test pins this.
