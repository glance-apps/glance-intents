export const UPDATED_FIELDS = [
  'title',
  'notes',
  'tags',
  'priority',
  'project',
  'recurring',
] as const;

export type UpdatedField = (typeof UPDATED_FIELDS)[number];
