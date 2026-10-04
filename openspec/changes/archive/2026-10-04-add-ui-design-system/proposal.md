# Proposal

## Why

Atlas has a consistent visual language: calm teal on grey, compact 11px lists, padded white cards, and editing in dialogs. But it only exists implicitly in `styles.css`, `components/ui.tsx` and the finished screens. Without a written reference, new screens drift. The funnel settings screen from `add-multiple-crm-funnels` is the proof:
- Its cards have no inner padding.
- Every stage row is a strip of oversized inputs with its own "Сохранить" button.
- Destructive and save buttons are wide filled blocks.

It looks like a different product.

## What Changes

- Add a **UI design system** capability. It records the existing tokens (color, radius, shadow, type scale, spacing), page and card structure, list and table patterns, dialog-based editing, button hierarchy, badges and status colors, empty and loading states, copy rules and responsive behavior. It is derived from the current screens (Team, CRM, Sales, Documents, dialogs), not a new visual direction.
- Add a **settings screen pattern** (list on the left, detail cards on the right, edits in dialogs), modelled on the Team screen.
- Rebuild **Настройка воронок** (`/sales/settings`) on that pattern:
  - funnel list styled like the team list
  - a header card with the funnel's name, access and counts
  - a stages card with compact read-only rows (color marker, name, outcome badge, deal count) and icon actions
  - an access card that summarizes who can see the funnel

  Every create, edit, reorder, access and delete action runs through the existing `Dialog`, `Field` and `SelectField` components or row icon buttons. Behavior and API calls are unchanged.

## Capabilities

### New Capabilities
- `ui-design-system`: the visual and interaction rules every Atlas web screen follows, including the settings screen pattern.

### Modified Capabilities
<!-- none: the funnel settings behavior (who can do what, API effects) is unchanged; only its presentation now follows ui-design-system -->

## Impact

- **Web**: `apps/web/src/pages/FunnelSettingsPage.tsx` (rewritten presentation), `apps/web/src/styles.css` (remove the ad-hoc funnel settings styles and add a small set that reuses existing token values), and page tests updated for the new dialogs.
- **No API, data or permission changes.**
- **Docs**: the new spec becomes the reference for later UI work. `openspec/config.yaml` gets a rule to check web changes against it.
