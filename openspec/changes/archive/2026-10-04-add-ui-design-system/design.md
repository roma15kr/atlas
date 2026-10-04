# Design

## Context

See proposal.md. The shared building blocks already exist:
- **Components** (`components/ui.tsx`): `PageHeader`, `SectionHeader`, `Surface`, `Badge`, `Button` (primary, secondary, ghost, danger), `IconButton`, `Dialog` (sm, md, lg), `Field`, `SelectField`, `Segmented`, `EmptyState`.
- **Team screen styles** (`styles.css`): `.team-layout` (list / detail grid, 12px gap), `.team-list__rows` (65px rows, active tint and inset bar), `.team-detail` (card stack), `.team-profile` (17px padding, 18px heading, badge row).

The current `FunnelSettingsPage.tsx` ignores these:
- It renders bare `.surface` cards with no padding.
- It edits names, colors and outcomes inline with 38px inputs, one save button per row.
- It shows full-width and filled danger buttons.

## Goals / Non-Goals

**Goals:**
- A written, testable reference for Atlas UI (the spec), with no new visual direction.
- A funnel settings screen that is visually indistinguishable in style from Team, CRM and Sales.
- The same behavior and API calls as today, and the same Director-only access.

**Non-Goals:**
- Restyling other screens. They already follow the spec. Deviations found later get their own changes.
- A component library refactor or Storybook.
- Changing funnel rules, such as deleting a stage with a target stage.

## Decisions

### 1. The spec is descriptive, written from existing code
Every rule in `specs/ui-design-system` cites values already in `styles.css` or patterns already on shipped screens. That keeps the spec true on day one and makes review objective: a reviewer compares a change against values that exist.
*Alternative:* design a fresh system. Rejected: the user asked to rely on the current design.

### 2. The funnel settings screen reuses the Team layout

```
PageHeader: Настройка воронок · "N воронок · M этапов"      [+ Новая воронка]
+-------------------------------+  +------------------------------------------+
| Воронки                  [N]  |  | [icon] Основная воронка        [Переим.] |
|-------------------------------|  |        6 этапов · 12 сделок    [Удалить] |
| [icon] Основная воронка  Вся  |  |        [Вся компания] [Открыт 4] ...     |
|        6 этапов · 12 сделок   |  +------------------------------------------+
|> [icon] Опт       [Ограничен] |  | Этапы  [6]              [+ Добавить этап] |
|        3 этапа · 2 сделки     |  |------------------------------------------|
+-------------------------------+  | :: # Заявка        Открыт   3 сд.  ^ v / x|
                                   | :: # Переговоры    Открыт   5 сд.  ^ v / x|
                                   | :: # Оплата        Успех    2 сд.  ^ v / x|
                                   +------------------------------------------+
                                   | Доступ                [Изменить доступ]  |
                                   | Вся компания — все сотрудники видят ...  |
                                   |  or: Отделы: Продажи · Сотрудники: Анна  |
                                   +------------------------------------------+
```

- **Funnel list:** `Surface.team-list` with `.team-list__rows` buttons. The leading icon uses the `integration-icon` look (38px, primary tint). The caption is "N этапов · M сделок". The trailing badge is "Вся компания" (neutral) or "Ограничен" (warning).
- **Summary card** (`team-profile` padding and head):
  - 18px name, with the caption "Создаёт директор · видна: …"
  - badges: access mode, then open, won and lost stage counts
  - actions: secondary "Переименовать", and a ghost "Удалить" with the trash icon, disabled with a title when it's the last funnel
- **Stages card:** `SectionHeader` "Этапы" + count badge + secondary "Добавить этап". Rows (`.stage-rows`, the same metrics as `.team-list__rows` but 52px min height) contain:
  - a drag handle
  - a 7px color marker
  - the 11px bold name
  - an outcome badge
  - a muted 9px "N сделок" caption
  - `IconButton`s: "Выше", "Ниже", "Изменить", "Удалить"

  Up and down stay available for keyboard users, and drag-and-drop remains for the mouse.
- **Access card:** `SectionHeader` "Доступ" + secondary "Изменить доступ". The body is a `detail-list` style `dl`: "Кто видит" → "Вся компания" or "Только выбранные", "Отделы" → names joined by " · ", "Сотрудники" → names. Then one muted 11px sentence explaining that directors always see everything and role scope applies inside.

### 3. Dialogs for every change

| Action | Dialog | Body | Primary button |
| --- | --- | --- | --- |
| New funnel | md | name, with a caption listing the default stages | "Создать воронку" |
| Rename | sm | name | "Сохранить" |
| Delete funnel | sm | consequence text; if deals exist, explains to move them first and disables confirm | "Удалить" (danger) |
| Add or edit stage | md, `form-grid` | "Название" (wide), "Цвет" (a row of 8 preset swatches from the token palette plus a native color input), "Итог" select with a helper line | "Добавить этап" / "Сохранить" |
| Delete stage | sm | existing behavior (target select required when it has deals) | "Перенести и удалить" / "Удалить" |
| Access | lg | `Segmented` mode; when restricted, two `fieldset` checklists (Отделы, Сотрудники) in `form-grid` with search-free lists, plus the explanatory sentence | "Сохранить доступ" |

Errors from the API stay in the open dialog via `form-error`, using `funnelErrorMessage`.

### 4. Color presets from existing tokens
The stage color picker offers presets taken from colors already on the board: primary #176f68, blue #366e9e, amber #a66c20, red #a44444, green #39815a, purple #765ca8, teal #398078 and slate #6b7280. A native color input still allows any color. The chosen color only ever renders as the 7px marker.

### 5. CSS
- Delete the `.funnel-settings*`, `.stage-list`, `.stage-row*` and `.access-grid` rules added by the funnels change.
- Reuse the `.team-layout`, `.team-list*`, `.team-detail` and `.team-profile*` classes directly.
- Add only `.stage-rows`, `.color-marker`, `.color-presets` and `.access-summary`. They use token values and mirror the existing row metrics.

### 6. Verification
Keep the behavior tests (add, reorder, restrict, delete dialog) and update their selectors to the dialogs. There is no browser in the dev container. If a headless Chromium can be installed in the scratchpad, render the demo-mode screen and compare it with the Team screen before deploying. Otherwise, verify on the test deployment.

## Risks / Trade-offs

- **More clicks than inline editing.** Renaming a stage takes open → edit → save. → This is consistent with how clients, deals and team members are edited, and it prevents half-saved rows.
- **Spec drift.** The spec could drift from `styles.css`. → Values are quoted from the stylesheet, and the `openspec/config.yaml` rule asks design reviews of web changes to check them.
