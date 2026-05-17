export const TABS = {
  GLANCE: 'glance',
  INBOX: 'inbox',
  TODAY: 'today',
  UPCOMING: 'upcoming',
  GOALS: 'goals',
  PROJECTS: 'projects',
  SETTINGS: 'settings',
} as const;

export type Tab = (typeof TABS)[keyof typeof TABS];
