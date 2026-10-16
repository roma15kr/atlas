## MODIFIED Requirements

### Requirement: Responsive and accessible layout
Multi-column layouts SHALL narrow at or below 1000px and collapse to one column at or below 780px, and toolbars SHALL wrap instead of overflowing. At or below 640px (a phone), controls SHALL be at least 40px high, text inputs SHALL use 16px text, dialogs and popovers SHALL open as full-width sheets, and content SHALL keep clear of the device's notch and home bar. Only tables and kanban boards may scroll horizontally. Every icon-only control SHALL have an `aria-label`. Dialogs SHALL be labelled and close on Escape. Focus SHALL show the primary focus ring. Drag-and-drop reordering SHALL have a keyboard or button alternative.

#### Scenario: Narrow window
- **WHEN** the viewport is 780px wide or less
- **THEN** a master–detail screen stacks the list above the detail cards without horizontal page scrolling

#### Scenario: Phone
- **WHEN** the viewport is 390px wide
- **THEN** buttons are at least 40px high, focusing a text field does not zoom the page, and a dialog fills the width of the screen
