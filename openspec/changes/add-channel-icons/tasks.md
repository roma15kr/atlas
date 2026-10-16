# Tasks

## 1. Channel icons

- [ ] 1.1 Add migration `023_channel_icons.sql`, accept and validate `icon` in the channel update, and return it on conversations. Verify integration cases: an admin sets an icon with a colour, changes the colour, then clears it; an unknown icon or colour gets 400; a member who isn't an admin gets 403 (audited); the list shows `icon` to members. Commit.
- [ ] 1.2 Add the icon library, colours and the picker; show the icon in the chat list, header and «Все каналы»; open the picker from channel settings and the header tile (the demo mirrors it). Verify cases: a unit test that the web and API key lists match; `Chat.test.tsx`: an admin picks «Мегафон» in red via search and the list shows it and a member has no picker. Commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate add-channel-icons --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev, `dev` → `main`, live check, archive.
