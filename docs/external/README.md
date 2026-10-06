# External context
Things outside this repository that agents need to know exist. NAMES only, never secret values.

- Environment variables (set in Coolify, values never in git):
  - `OPENAI_API_KEY` — OpenAI API key for the AI analysis on the Team and Profile screens. Without it, the built-in rule texts are used.
  - `AI_ANALYSIS_MODEL` — the model for that analysis, default `gpt-6-luna`; change it without a release.
  - `FEEDBACK_MODEL` — the model that translates, summarises and anonymises problem reports, default `gpt-6-luna`.
  - `GITHUB_TOKEN` — fine-grained GitHub token for `GITHUB_REPOSITORY`, Issues read/write only; problem reports become issues there. Without it, reports wait in Atlas.
  - `GITHUB_REPOSITORY` — `owner/name` for problem-report issues, for example `roma15kr/atlas` (public: issues hold anonymised English text only).
  - `SOURCE_COMMIT` — set by Coolify at build time; becomes the app version (`APP_VERSION`, `VITE_APP_VERSION`) shown in problem reports and `/health`.
  - `MAIL_ENCRYPTION_KEY` — encrypts stored mailbox credentials (see `docs/OPERATIONS.md`).
  - `BACKUP_AGE_RECIPIENT` — public age key that backups are encrypted to.
  - `BOOTSTRAP_ADMIN_PASSWORD` — the first director's password on a new installation.
- Third-party services and dashboards:
  - OpenAI API (platform.openai.com) — AI analysis. Set a monthly spending limit on the project.
  - Coolify (the deployment server) — runs the test app from the `main` branch; a push to `main` deploys.
  - GitHub `roma15kr/atlas` — public repository and CI.
- Test accounts: the director account on the test app; ask the product owner for the password (it is never stored in the repository).
