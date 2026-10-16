# Design

## Decisions

1. **Computed in the dialog.** It is computed from the rows it already has: when `head` is null and `parentId` points to a row with a head, it shows `«{head} · через «{parent}»»` in a muted style.
2. **No API change.** `GET /departments` already returns `head` and `parentId` for every row a director sees.
