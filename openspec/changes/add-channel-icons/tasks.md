# Tasks

## 1. Channel icons

- [ ] 1.1 Add migration `023_channel_icons.sql` and the upload, remove and serve endpoints with access, audit and `iconUrl` on conversations. Verify integration cases: an admin uploads and everyone in the company can load it; a member who isn't an admin gets 403 (audited); an outsider of another company gets 404; replacing deletes the old object; removing restores no icon. Commit.
- [ ] 1.2 Show the icon in the chat list, the header and «Все каналы», and add «Загрузить иконку» / «Убрать иконку» to channel settings (the demo mirrors it). Verify `Chat.test.tsx` cases: an admin sets an icon and the list shows it, and a member sees no upload control. Commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate add-channel-icons --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev, `dev` → `main`, live check, archive.
