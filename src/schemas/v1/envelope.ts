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

// Encrypted envelope: the plaintext portion carries only the fields needed for
// filtering, GC, and idempotency. The full action + payload live in the
// AES-GCM ciphertext; `buildEncryptedEnvelope` hoists source_app,
// source_entity_id, and due from the payload into the header.
export const EncryptedEnvelopeSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    event_id: z.string().min(1),
    emitted_at: z.string().datetime({ offset: true }),
    emitted_by: z.string().min(1),
    encrypted: z.literal(true),
    salt: z
      .string()
      .min(1)
      .refine(
        (s) => {
          try {
            return globalThis.atob(s).length === 16;
          } catch {
            return false;
          }
        },
        { message: 'salt must be base64-encoded and decode to exactly 16 bytes' },
      ),
    iv: z.string().min(1),
    source_app: z.string().optional(),
    source_entity_id: z.string().optional(),
    due: z.string().optional(),
    payload_ciphertext: z.string().min(1),
  })
  .strict();

export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;
