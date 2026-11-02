import type { shell as source } from '../uk/shell';
import type { Dictionary } from '../types';

export const shell = {
  nav: {
    dashboard: 'Dashboard', crm: 'CRM', sales: 'Funnel', tasks: 'My tasks', boards: 'Boards', documents: 'Documents',
    team: 'Employees', reports: 'Reports', achievements: 'Achievements',
    messages: 'Messages', mail: 'Mail', telegram: 'Telegram', feedback: 'Feedback', audit: 'Audit', profile: 'Profile',
    groupTeam: 'TEAM', groupCommunication: 'COMMUNICATION & CONTROL',
  },
  pages: {
    dashboard: 'Dashboard', crm: 'CRM', client: 'Client card', sales: 'Sales funnel', salesSettings: 'Funnel settings',
    tasks: 'My tasks', boards: 'Task boards', boardSettings: 'Board settings', documents: 'Documents', team: 'Team',
    reports: 'Reports', achievements: 'Achievements', messages: 'Messages', mail: 'Mail', mailSettings: 'Mail settings',
    telegram: 'Telegram', telegramSettings: 'Telegram settings', audit: 'Audit log', feedback: 'Feedback', profile: 'Profile',
  },
  frame: {
    mainNav: 'Main navigation', openMenu: 'Open menu', closeMenu: 'Close menu', expandMenu: 'Expand menu', collapseMenu: 'Collapse menu',
    logout: 'Sign out', workspace: 'Workspace', search: 'Search', offlineData: 'Offline data', online: 'Online · {{time}}',
    unreadIn: '{{label}}: {{count}} unread', quickNav: 'Quick navigation', unread: 'unread: {{count}}', tasks: 'Tasks', more: 'More',
  },
  login: {
    visual: 'Atlas workspace', photo: 'The Atlas team’s modern office', day: 'Working day', tagline1: 'Team, clients and decisions', tagline2: 'in one workspace.',
    demoReady: 'Demo team is ready', demoData: 'Sample data is loaded', welcome: 'Welcome', title: 'Sign in to your workspace',
    subtitle: 'Use your company account', username: 'Username', usernamePlaceholder: 'Your username', password: 'Password', passwordPlaceholder: 'Your password',
    showPassword: 'Show password', hidePassword: 'Hide password', capsLock: 'Caps Lock is on', submit: 'Sign in', submitting: 'Signing in…',
    demoProfiles: 'Demo profiles', footer: 'Atlas Virtual Office · secure connection', language: 'Language',
    contactHint: 'Sign in with your username (e.g. ivanenko), not a phone number or email. Your head gives you the username.',
    cyrillicHint: 'Usernames are in Latin letters — switch your keyboard layout.',
    errors: {
      network: 'Could not sign in. Check your internet connection and try again.',
      rateLimited: 'Too many sign-in attempts. Try again in {{minutes}} min.',
      invalid: 'Wrong username or password. After 5 failed attempts sign-in is locked for 15 minutes.',
      noDepartment: 'This head’s account is not linked to a department. Please contact the director.',
      badInput: 'Check your username and password: the password has at least 8 characters.',
      unavailable: 'The server is unavailable right now. Try again in a minute.',
    },
  },
  bell: {
    title: 'Notifications', unreadLabel_one: 'Notifications: {{count}} unread', unreadLabel_few: 'Notifications: {{count}} unread', unreadLabel_many: 'Notifications: {{count}} unread', unreadLabel_other: 'Notifications: {{count}} unread',
    fresh_one: '{{count}} new', fresh_few: '{{count}} new', fresh_many: '{{count}} new', fresh_other: '{{count}} new',
    readAll: 'Mark all read', unreadMark: 'Unread', emptyTitle: 'No notifications', emptyText: 'Tasks, messages and reminders will appear here', settings: 'Notification settings',
  },
  feedback: {
    button: 'Report a problem', buttonTitle: 'Report a problem (Ctrl+Shift+F)',
    kinds: { PROBLEM: 'Problem', COMPLAINT: 'Complaint', IDEA: 'Idea' },
    title: 'Report a problem', description: 'Write in your own words — in Ukrainian, Russian or English', kind: 'Type',
    what: 'What happened?', counter: '{{length}} / {{max}} · Page: {{page}}', placeholder: 'What you did, what you expected and what happened',
    shotAlt: 'Screenshot preview', shotAttached: 'Screenshot attached', shotNote: 'The page before this window opened. Password fields are hidden.',
    shotRemove: 'Don’t attach the screenshot', shotNotAttached: 'Screenshot not attached', shotAdd: 'Attach screenshot', shotFailed: 'The screenshot could not be taken',
    shotFailedNote: 'Describe what was on the screen — you can still send the report.',
    log: 'Attach the technical log', logNote: 'Errors and server requests from the last 15 minutes — without typed text or record data.', logContents: 'What the log contains',
    privacy: 'Only the company’s directors see reports. GitHub gets an anonymised translation.',
    cancel: 'Cancel', send: 'Send', sending: 'Sending…',
    sentTitle: 'Report sent', sentText: 'Thank you! The development team will get your report translated and anonymised. Its status is shown in «My reports».',
    close: 'Close', mine: 'My reports', tooMany: 'Too many reports, please try later', failed: 'The report was not sent. Please try again.',
    tooShort: 'Please describe the problem in more detail', tooLong: 'At most {{max}} characters', notFound: 'Report not found',
    logSummary: {
      errors: 'App errors: {{errors}}; server requests: {{requests}}', failed: ' (failed: {{failed}})',
      routes: 'Page changes: {{routes}}; server connection state', version: 'Atlas version {{version}}, {{viewport}}, {{language}}, {{timeZone}}',
    },
  },
} satisfies Dictionary<typeof source>;
