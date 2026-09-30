# Spec Delta

## Purpose

Defines how every Atlas web screen looks and behaves: design tokens, page and card structure, lists, dialogs, buttons, status colors, copy and responsiveness, derived from the existing Team, CRM, Sales and Documents screens.

## ADDED Requirements

### Requirement: Design tokens
Screens SHALL use only the shared tokens defined in `styles.css`.

- **Colors:**
  - background `--bg` #f4f6f7
  - surface `--surface` #ffffff and `--surface-soft` #f8faf9
  - lines `--line` #dfe5e3 and `--line-strong` #cbd5d2; row dividers #edf0ef
  - text `--text` #202827, `--muted` #687472 and `--subtle` #8c9694
  - primary `--primary` #176f68 (hover `--primary-dark` #105951, tint `--primary-soft` #e7f2f0)
  - status pairs: blue, amber, red and green, each with a `-soft` tint
- **Radius:** 5px for controls, 7px for surfaces and dialogs, 4px for badges, 2px for color markers.
- **Shadow:** the single `--shadow` on surfaces; dialogs use the dialog shadow.
- **Font:** Inter with the system fallback stack.

A new hard-coded color is allowed only for user-chosen data, such as a stage color.

#### Scenario: Reviewing a new screen's styles
- **WHEN** a web change adds CSS
- **THEN** every color, radius and shadow in it is a token or one of the listed values, except user-chosen data colors

### Requirement: Type scale
Text SHALL follow the existing scale:

| Element | Size and weight |
| --- | --- |
| Page title (`h1`) | 24px / 700 |
| Page description | 13px, muted |
| Card title (`h2` in `SectionHeader`) | 16px |
| Detail heading, e.g. a selected person or funnel | 18px |
| List row primary text | 11px, bold |
| List row caption | 9px, muted |
| Table header | 9px, uppercase, muted |
| Field label | 12px / 650 |
| Button | 13px / 650 |
| Compact toolbar select | 11px |
| Form input text | inherits the base size |

Inputs and selects SHALL NOT be enlarged beyond the 38px control height.

#### Scenario: List row typography
- **WHEN** a screen renders a list of items (people, funnels, stages, files)
- **THEN** each row shows an 11px bold primary line and, when present, a 9px muted caption

### Requirement: Page structure
Every screen SHALL start with `PageHeader`:
- the title
- a one-line description with live counts where meaningful, e.g. "6 этапов · 12 сделок"
- right-aligned actions, with at most one primary button

Sub-pages SHALL show a `back-link` above the header. Page content SHALL use grids with a 12px gap. The page SHALL keep the shell's content padding and not add its own outer margins.

#### Scenario: Sub-page header
- **WHEN** a user opens a sub-page such as funnel settings
- **THEN** a muted "back" link to the parent screen appears above a `PageHeader` with one primary action

### Requirement: Surfaces and sections
Content SHALL sit in `Surface` cards.
- A card with free content SHALL have 17px inner padding.
- A card holding an edge-to-edge list or table SHALL instead pad its toolbar and rows (9–14px horizontally) so nothing touches the border.
- Each card SHALL open with a `SectionHeader`: the title, an optional count `Badge` or muted meta text, and at most one action, either a secondary button or a text button.
- Cards SHALL NOT be nested inside cards.

#### Scenario: Card padding
- **WHEN** a card renders a heading and content
- **THEN** there is visible padding between the card border and every piece of content

### Requirement: Lists and selection
Collections SHALL render as read-only rows:
- 48–65px minimum height, a divider line, a leading icon or avatar, a primary and caption text block, and trailing badges, meta or icon actions
- icon actions are 34px `IconButton`s in the muted color, each with an `aria-label` and title
- a selectable list (master list) marks the active row with the tinted background #f0f6f5 and a 3px inset primary bar on the left, as the Team list does
- tabular data with many columns SHALL use `data-table` inside a `table-surface`

Lists SHALL NOT contain inline text inputs or per-row save buttons.

#### Scenario: Selecting an item in a master list
- **WHEN** a user clicks an item in a master list
- **THEN** that row gets the tinted background and left primary bar, and the detail cards show that item

#### Scenario: No inline editing in lists
- **WHEN** a list shows editable items
- **THEN** each row offers an edit icon that opens a dialog, instead of editable fields in the row

### Requirement: Editing through dialogs
Creating and editing records SHALL happen in `Dialog`:
- `sm` for confirmations
- `md` for short forms
- `lg` for multi-field forms

Each dialog has:
- a title, plus a one-line description where it helps
- a body using `form-grid` (two columns, `field--wide` for full width) with `Field` or `SelectField` labels
- field errors shown inside the dialog with `form-error`
- a footer with a secondary "Отмена" and one primary button labelled with its verb, e.g. "Сохранить", "Создать воронку" or "Добавить этап"

The primary button SHALL be disabled while saving or while required input is missing. Page-level failures SHALL use the dismissible `notice notice--danger` banner under the header.

#### Scenario: Editing a record
- **WHEN** a user clicks an edit action
- **THEN** a dialog opens with the current values, and changes apply only after the primary button is pressed

#### Scenario: Server rejects a save
- **WHEN** the API returns an error for a dialog form
- **THEN** the dialog stays open, shows a Russian error message in `form-error`, and re-enables its primary button

### Requirement: Button hierarchy and destructive actions
Buttons SHALL use the existing variants:
- `primary` for the single main action of a view or dialog
- `secondary` for other actions
- `ghost` or `IconButton` for low-emphasis and row actions
- `text-button` for inline links

A destructive action SHALL be triggered from a secondary button, a ghost button or an icon, and SHALL open an `sm` confirmation dialog. Only that dialog's confirm button uses `danger`. Filled `danger` buttons SHALL NOT appear directly on a page. Full-width buttons SHALL NOT be used outside the login form. An unavailable action SHALL be disabled with a `title` that explains why.

#### Scenario: Deleting from a page
- **WHEN** a user starts a delete action on a page
- **THEN** a small confirmation dialog explains the consequence, and only its confirm button is red

### Requirement: Status colors and markers
`Badge` tones SHALL carry fixed meanings:
- `success`: done, won or online
- `warning`: at risk or pending
- `danger`: lost, failed or denied
- `info`: informational counts and roles
- `neutral`: plain counts and open states

User-defined colors, such as deal stages, SHALL be shown as a 7px square marker with a 2px radius next to the name, as in the Sales board column headers, not as large swatches.

#### Scenario: Stage outcome display
- **WHEN** a stage is shown
- **THEN** its color appears as a 7px marker, and its outcome as a badge: "Открыт" neutral, "Успех" success, "Проигрыш" danger

### Requirement: Empty and loading states
An empty collection SHALL render `EmptyState` with an icon, a short title, one explanatory sentence and, when the user can act, one action. Pending data SHALL render `LoadingState`. Screens SHALL NOT show blank cards.

#### Scenario: No items yet
- **WHEN** a list has no items
- **THEN** the card shows an `EmptyState` explaining what to do next

### Requirement: Copy and formatting
All visible text SHALL be Russian:
- sentence case
- short labels
- no English words except product names (Atlas, Gmail, Telegram, …)

Money SHALL use `formatMoney` in hryvnia (₴), and dates `formatDate` or `relativeTime`. Counts in captions SHALL use a middle dot separator, e.g. "6 этапов · вся компания".

#### Scenario: Caption with counts
- **WHEN** a list row summarizes several facts
- **THEN** they appear in one muted caption joined by " · "

### Requirement: Responsive and accessible layout
Multi-column layouts SHALL narrow at or below 1000px and collapse to one column at or below 780px, and toolbars SHALL wrap instead of overflowing. Only tables and kanban boards may scroll horizontally. Every icon-only control SHALL have an `aria-label`. Dialogs SHALL be labelled and close on Escape. Focus SHALL show the primary focus ring. Drag-and-drop reordering SHALL have a keyboard or button alternative.

#### Scenario: Narrow window
- **WHEN** the viewport is 780px wide or less
- **THEN** a master–detail screen stacks the list above the detail cards without horizontal page scrolling

### Requirement: Settings screen pattern
Configuration screens SHALL follow the Team screen's master–detail layout: a `team-layout`-style grid with a master list card on the left and detail cards on the right.

- The **master list** uses the list and selection rules above.
- The **first detail card** is a summary header: an 18px name, a caption line, badges for key properties, and secondary actions for rename and delete.
- **Each further detail card** covers one topic with a `SectionHeader` and a single action. For example, "Этапы" with "Добавить этап", and "Доступ" with "Изменить доступ".
- Values are shown read-only, and all changes go through dialogs.

#### Scenario: Funnel settings screen
- **WHEN** a director opens "Настройка воронок"
- **THEN** funnels are listed on the left like the team list, and the selected funnel shows a summary card, a stages card of compact rows with color markers and outcome badges, and an access card summarizing who can see it, with no inline inputs on the page
