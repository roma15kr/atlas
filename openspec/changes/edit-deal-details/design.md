# Design

## Decisions

1. **One window per deal.**
   - `DealDetailsDialog` opens from the card. The whole card is clickable except the drag handle and the stage select.
   - It shows title, client, stage, amount, probability, expected close date, owner and notes.
   - «Изменить» turns the fields into inputs, reusing the creation form's fields and limits. «Сохранить» sends only the changed fields. The notes editor keeps its own save, as today.
2. **Owner field:** shown as an input only to roles that may assign: MANAGER of the deal's department, or DIRECTOR. This mirrors `manageableUser`, and the server still decides.
3. **Errors:** server codes map to Russian messages (`INVALID_DEAL_STAGE`, owner without funnel access, 404 when the deal left the caller's scope). The window stays open with the message.
4. **Totals:** the workspace refreshes the deal in place after saving, so column sums and the dashboard forecast update without a reload.
5. **Demo:** `updateDeal` applies the same fields to the demo deals, with the same role rule for the owner.

## Risks / Trade-offs

- **Clicks while dragging:** a click on the card could start a drag on desktop. Only a click without movement opens the window.
