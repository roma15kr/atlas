import type { common as source } from '../uk/common';
import type { Dictionary } from '../types';

// English uses only the _one and _other plural forms; _few and _many are kept so every language has the same keys.
export const common = {
  languages: { uk: 'Українська', ru: 'Русский', en: 'English' },
  roles: { DIRECTOR: 'Director', MANAGER: 'Head', EMPLOYEE: 'Employee' },
  time: {
    noData: 'no data',
    minutesAgo_one: '{{count}} min ago', minutesAgo_few: '{{count}} min ago', minutesAgo_many: '{{count}} min ago', minutesAgo_other: '{{count}} min ago',
    hoursAgo_one: '{{count}} h ago', hoursAgo_few: '{{count}} h ago', hoursAgo_many: '{{count}} h ago', hoursAgo_other: '{{count}} h ago',
  },
  size: { bytes: '{{value}} B', kilobytes: '{{value}} KB', megabytes: '{{value}} MB' },
  empty: '—',
  actions: {
    cancel: 'Cancel', save: 'Save', saving: 'Saving…', close: 'Close', delete: 'Delete', edit: 'Edit', add: 'Add', adding: 'Adding…', create: 'Create', retry: 'Try again', done: 'Done', back: 'Back',
  },
  attachments: {
    uploading: 'Uploading…', attach: 'Attach a file', pending: 'Attached files', input: 'Files: {{label}}', remove: 'Remove {{name}}', download: 'Download {{name}}, {{size}}',
    rules: 'PDF, Word, Excel, CSV, PowerPoint, text, ZIP or images up to 20 MB', notAllowed: '«{{name}}»: this file can’t be attached. Allowed: {{rules}}.', tooBig: '«{{name}}» is larger than 20 MB.', empty: '«{{name}}» is empty.',
  },
  reactions: {
    unknown: 'There is no such reaction', limit: 'At most {{max}} different reactions', label: 'Reactions', you: 'You', andMore: ' and {{count}} more', add: 'Add reaction', picker: 'Choose a reaction', all: 'All emoji', search: 'Find an emoji', searchPlaceholder: 'Find: fire, thanks, done…', nothing: 'Nothing found',
  },
  optional: 'Optional',
  loading: 'Loading…',
} satisfies Dictionary<typeof source>;
