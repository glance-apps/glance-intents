export const EVENTS = {
  COMPLETED: 'completed',
  UNCOMPLETED: 'uncompleted',
  DELETED: 'deleted',
  RESCHEDULED: 'rescheduled',
  UPDATED: 'updated',
} as const;

export type Event = (typeof EVENTS)[keyof typeof EVENTS];
