# Design

## Context

- `users.job_description` is text. `PATCH /team/:id` accepts `jobDescription` of up to 20,000 characters, or null. It is allowed for a director on anyone in the company and for a head on employees of their department.
- `GET /team` and the session user return `jobDescription`.
- `canAdminister(member)` in `TeamPage` mirrors the API rule.

## Decisions

### 1. Who fills it in
- The rights stay as they are. The job description is the manager's statement of what the role should do, and the future AI will compare work against it. So the employee doesn't write their own.
- A head's own description is set by a director.

### 2. Editor (`components/team/JobDescriptionDialog.tsx`)
- `Dialog size="lg"`, titled "Должностная инструкция", with the member's name as the description.
- A textarea of 16 rows, `maxLength` 20000, and a counter showing `N / 20 000`.
- "Вставить шаблон" is shown only while the text is empty.
- The hint reads: "Используется AI-аналитикой как описание ожидаемых обязанностей. Пишите по одному пункту в строке."
- Save sends `{ jobDescription: text.trim() }`. An empty string clears the description, because the API maps an empty string to null. Errors show inline.

### 3. Team panel card
- `SectionHeader` with the title "Должностная инструкция". The action is "Заполнить" (empty) or "Изменить" (filled), shown only when `canAdminister(selected)`.
- The text is rendered with `white-space: pre-line`.
- When it is empty, a muted note shows: "Не заполнена" plus, for managers, "Опишите обязанности — их будет учитывать AI".

### 4. Team list badge
- For members the viewer can administer who have no job description, a `Badge tone="warning"` reading "Нет инструкции" is shown under the name.

### 5. Profile
- A "Должностная инструкция" section is added to the identity card, always shown:
  - the text with line breaks;
  - or "Не заполнена — заполняет руководитель".
