import { z } from 'zod';

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'expected YYYY-MM-DD',
});

const isoDateOrDateTime = z.union([
  z.string().datetime({ offset: true }),
  isoDateOnly,
]);

const priorityStringValues = ['none', 'low', 'medium', 'high'] as const;
const PrioritySchema = z.union([
  z.number().int().min(0).max(3),
  z.string().refine(
    (v) => (priorityStringValues as readonly string[]).includes(v.toLowerCase()),
    { message: `expected one of: ${priorityStringValues.join(', ')} (case-insensitive)` },
  ),
]);

// Reverse-DNS app identifier. Forward-compatible: accepts any string of the
// shape `lower.dotted.path`, not just the known SOURCE_APPS values, so third-
// party emitters and future GLANCE apps validate without a schema bump.
const sourceAppPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

// `due` with a time component is anything other than a YYYY-MM-DD-only string.
const hasTimeComponent = (due: string): boolean => !/^\d{4}-\d{2}-\d{2}$/.test(due);

export const CreateSchema = z
  .object({
    title: z.string().min(1),
    due: isoDateOrDateTime.optional(),
    duration: z.number().int().positive().optional(),
    all_day: z.boolean().optional(),
    deadline: isoDateOnly.optional(),
    tags: z.string().optional(),
    priority: PrioritySchema.optional(),
    notes: z.string().optional(),
    project: z.string().optional(),
    recurring: z.string().min(1).optional(),
    source_app: z.string().regex(sourceAppPattern).optional(),
    source_entity_id: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => data.duration === undefined || (!!data.due && hasTimeComponent(data.due)), {
    message: 'duration requires `due` with a time component',
    path: ['duration'],
  })
  .refine((data) => data.source_entity_id === undefined || !!data.source_app, {
    message: 'source_entity_id requires source_app',
    path: ['source_entity_id'],
  });

export type CreatePayload = z.infer<typeof CreateSchema>;
