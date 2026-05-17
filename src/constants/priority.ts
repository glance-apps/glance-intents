export const PRIORITY = {
  LOW: 1,
  NORMAL: 2,
  MEDIUM: 3,
  HIGH: 4,
  URGENT: 5,
} as const;

export type PriorityLevel = (typeof PRIORITY)[keyof typeof PRIORITY];

export const PRIORITY_ALIASES: Record<string, PriorityLevel> = {
  low: PRIORITY.LOW,
  normal: PRIORITY.NORMAL,
  medium: PRIORITY.MEDIUM,
  high: PRIORITY.HIGH,
  urgent: PRIORITY.URGENT,
};
