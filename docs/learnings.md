# Learnings
Rules learned from real mistakes. Maintained by the Learner role (`./scripts/factory.sh learn`)
and by you. Agents must read this file before planning, building or reviewing.
Entries with Count >= 3 get promoted to AGENTS.md.

<!-- Format:
## <rule in one line>
Seen: <dates/changes>  Count: <n>
Why: <one or two sentences>
-->

## Chain the gate and the commit with `&&` in one command (`make check && git commit … && git push`), never through a pipe
Seen: 2026-10 (rich text change), 2026-10-15 (`fix/task-save-comment`), 2026-10-19 (`feat/chat-attachments`, lint)  Count: 3
Why: a failing `make check` was committed and pushed after `;`, a log redirect, and then `make check | tail -1 && git commit` (a pipe reports `tail`'s status). Run `set -o pipefail` first, or don't pipe the gate.

## Check that a text is absent by the text itself, never by a short number a random uuid may contain
Seen: 2026-10-15 (`telegram.integration.test.ts`, `not.toContain("150")`), 2026-10-16 (`mail.integration.test.ts` `150`; `profile.integration.test.ts` `1994` fixed pre-emptively)  Count: 2
Why: the audit metadata held a uuid with «150» in it, so the test failed at random; check `/Доставка|150 грн/`.
