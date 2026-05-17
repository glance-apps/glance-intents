import { z } from 'zod';

import { ACTIONS, SCHEMA_VERSION } from '../../constants/index.js';

import { CompleteSchema } from './complete.js';
import { CreateSchema } from './create.js';
import { NotifySchema } from './notify.js';
import { OpenSchema } from './open.js';
import { QuerySchema } from './query.js';

const envelopeBase = {
  schema_version: z.literal(SCHEMA_VERSION),
  event_id: z.string().min(1),
  emitted_at: z.string().datetime({ offset: true }),
  emitted_by: z.string().min(1),
};

// Discriminated union on `action`: parsing an envelope automatically validates
// the payload against the matching action schema. A mismatched action/payload
// pair fails at the variant level rather than slipping through a permissive
// `payload: z.object(...).passthrough()`.
export const EnvelopeSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...envelopeBase,
      action: z.literal(ACTIONS.CREATE),
      payload: CreateSchema,
    })
    .strict(),
  z
    .object({
      ...envelopeBase,
      action: z.literal(ACTIONS.COMPLETE),
      payload: CompleteSchema,
    })
    .strict(),
  z
    .object({
      ...envelopeBase,
      action: z.literal(ACTIONS.OPEN),
      payload: OpenSchema,
    })
    .strict(),
  z
    .object({
      ...envelopeBase,
      action: z.literal(ACTIONS.QUERY),
      payload: QuerySchema,
    })
    .strict(),
  z
    .object({
      ...envelopeBase,
      action: z.literal(ACTIONS.NOTIFY),
      payload: NotifySchema,
    })
    .strict(),
]);

export type Envelope = z.infer<typeof EnvelopeSchema>;
