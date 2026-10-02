# Tasks

## 1. API

- [x] 1.1 Pin the existing behaviour with tests:
  - a head saves a long description (20,000 characters) for an employee;
  - an empty string clears it;
  - 20,001 characters give 400;
  - the audit lists `jobDescription` without the text.

## 2. Web

- [x] 2.1 Add `JobDescriptionDialog`, with the counter, template and clearing.
- [x] 2.2 Always show the Team panel card with "Заполнить"/"Изменить", and add the "Нет инструкции" badge in the list.
- [x] 2.3 Show the description section in the profile, and remove the field from the general edit dialog.
- [x] 2.4 Verify with Testing Library:
  - a head fills in an empty description through the template and saves it;
  - an employee sees no edit button;
  - clearing shows "Не заполнена";
  - the profile shows the "заполняет руководитель" note.

## 3. Verification

- [x] 3.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate improve-job-description-editing --strict`.
- [x] 3.2 Deploy to the Coolify test app. As the director, fill in and then clear a description.
