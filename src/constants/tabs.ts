export const TABS = {
  GLANCE: 'glance',
  TIMELINE: 'timeline',
  INBOX: 'inbox',
  GOALS: 'goals',
  SETTINGS: 'settings',
} as const;

export type Tab = (typeof TABS)[keyof typeof TABS];
