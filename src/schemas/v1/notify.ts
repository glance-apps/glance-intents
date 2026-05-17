import { z } from 'zod';

import { EVENTS } from '../../constants/index.js';

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'expected YYYY-MM-DD',
});

const isoDateOrDateTime = z.union([
  z.string().datetime({ offset: true }),
  isoDateOnly,
]);

// Shape validation only. Per spec, `previous_due` is "If applicable" (present
// on rescheduled) and `completed_at` is "If applicable" (present on
// completed, equals timestamp). Those are emitter-side correctness rules, not
// validation rules — the handler enforces them on emission and consumers
// should tolerate missing-but-expected fields without crashing.
export const NotifySchema = z
  .object({
    event_id: z.string().min(1),
    source_app: z.string().min(1),
    source_entity_id: z.string().min(1),
    event: z.enum([
      EVENTS.COMPLETED,
      EVENTS.UNCOMPLETED,
      EVENTS.DELETED,
      EVENTS.RESCHEDULED,
      EVENTS.UPDATED,
    ]),
    task_id: z.string().min(1),
    title: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }),
    entity_type: z.string().min(1).optional(),
    due: isoDateOrDateTime.optional(),
    previous_due: isoDateOrDateTime.optional(),
    completed_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type NotifyPayload = z.infer<typeof NotifySchema>;
