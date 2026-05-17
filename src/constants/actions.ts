export const ACTIONS = {
  CREATE: 'create',
  COMPLETE: 'complete',
  OPEN: 'open',
  QUERY: 'query',
  NOTIFY: 'notify',
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];
