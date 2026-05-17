export const PRIORITY = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export type PriorityLevel = (typeof PRIORITY)[keyof typeof PRIORITY];

export const PRIORITY_ALIASES: Record<string, PriorityLevel> = {
  none: PRIORITY.NONE,
  low: PRIORITY.LOW,
  medium: PRIORITY.MEDIUM,
  high: PRIORITY.HIGH,
};
