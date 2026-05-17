export const ENTITY_TYPES = {
  TASK: 'task',
  GOAL: 'goal',
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];
