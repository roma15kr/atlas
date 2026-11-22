## MODIFIED Requirements

### Requirement: Design tokens
Screens SHALL use only the shared tokens defined in `styles.css`.

- **Colors:**
  - background `--bg` #f4f6f7
  - surface `--surface` #ffffff and `--surface-soft` #f8faf9
  - lines `--line` #dfe5e3 and `--line-strong` #cbd5d2; row dividers #edf0ef
  - text `--text` #202827, `--muted` #687472 and `--subtle` #8c9694
  - primary `--primary` (standard #176f68), with hover `--primary-dark` and tint `--primary-soft`. All three follow the company's accent colour and are derived from it, with the standard values #105951 and #e7f2f0. Selected rows, active items and other teal shades use these tokens, never fixed teal values.
  - sidebar `--sidebar` (standard #1d2a28) and its text `--sidebar-text` and `--sidebar-muted`. They follow the company's sidebar colour, with the text colour chosen for contrast.
  - status pairs: blue, amber, red and green, each with a `-soft` tint. These never follow the company's colours.
- **Radius:** 5px for controls, 7px for surfaces and dialogs, 4px for badges, 2px for color markers.
- **Shadow:** the single `--shadow` on surfaces; dialogs use the dialog shadow.
- **Font:** Inter with the system fallback stack.

A new hard-coded color is allowed only for user-chosen data, such as a stage color.

#### Scenario: Reviewing a new screen's styles
- **WHEN** a web change adds CSS
- **THEN** every color, radius and shadow in it is a token or one of the listed values, except user-chosen data colors

#### Scenario: A company accent colour
- **WHEN** the company's accent colour is #3949ab
- **THEN** `--primary` is #3949ab, `--primary-dark` and `--primary-soft` are its darker and lighter shades, and every accent-coloured element, including selected list rows, uses them
