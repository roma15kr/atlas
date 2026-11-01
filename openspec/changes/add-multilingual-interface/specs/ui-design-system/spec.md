## MODIFIED Requirements

### Requirement: Copy and formatting
All visible text SHALL be in the user's interface language (Ukrainian, Russian or English; see `localization`), and in each language:
- sentence case
- short labels
- no words from another language except product names (Atlas, Gmail, Telegram, …)

Money SHALL use `formatMoney` in hryvnia (₴), and dates `formatDate` or `relativeTime`, both for the user's language. Counts in captions SHALL use a middle dot separator, e.g. "6 етапів · вся компанія".

#### Scenario: Caption with counts
- **WHEN** a list row summarizes several facts
- **THEN** they appear in one muted caption joined by " · "
