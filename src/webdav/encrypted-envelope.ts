import { SCHEMA_VERSION } from '../constants/index.js';
import { decryptAesGcm, encryptAesGcm } from '../crypto/aes-gcm.js';
import { MalformedEnvelopeError, NotEncryptedError, WrongKeyError } from '../crypto/errors.js';
import { eventId as generateEventId } from '../idempotency/index.js';
import {
  type CreatePayload,
  type EncryptedEnvelope,
  EncryptedEnvelopeSchema,
  type Envelope,
  EnvelopeSchema,
  type NotifyPayload,
} from '../schemas/v1/index.js';
import type { ActionPayloadMap } from './envelope.js';

// Only create and notify carry user-readable fields worth encrypting.
// query/open/complete payloads are either empty or hold no sensitive data.
export type EncryptableAction = 'create' | 'notify';

export interface BuildEncryptedEnvelopeArgs<A extends EncryptableAction> {
  action: A;
  payload: ActionPayloadMap[A];
  emittedBy: string;
  emittedAt?: Date;
  eventId?: string;
}

export async function buildEncryptedEnvelope<A extends EncryptableAction>(
  args: BuildEncryptedEnvelopeArgs<A>,
  key: CryptoKey,
): Promise<EncryptedEnvelope> {
  const emittedAt = args.emittedAt ?? new Date();
  const evtId = args.eventId ?? generateEventId(emittedAt);

  const { ciphertext, iv } = await encryptAesGcm(
    JSON.stringify({ action: args.action, payload: args.payload }),
    key,
  );

  // Hoist the fields consumers need for filtering and idempotency without
  // decrypting the full payload.
  const p = args.payload as CreatePayload | NotifyPayload;
  const rawHeader: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    event_id: evtId,
    emitted_at: emittedAt.toISOString(),
    emitted_by: args.emittedBy,
    encrypted: true,
    iv,
    payload_ciphertext: ciphertext,
  };
  if (p.source_app !== undefined) rawHeader['source_app'] = p.source_app;
  if (p.source_entity_id !== undefined) rawHeader['source_entity_id'] = p.source_entity_id;
  if (p.due !== undefined) rawHeader['due'] = p.due;

  return EncryptedEnvelopeSchema.parse(rawHeader);
}

export async function parseEncryptedEnvelope(raw: unknown, key: CryptoKey): Promise<Envelope> {
  if (typeof raw !== 'object' || raw === null) {
    throw new MalformedEnvelopeError('expected an object');
  }
  if ((raw as Record<string, unknown>)['encrypted'] !== true) {
    throw new NotEncryptedError();
  }

  const headerResult = EncryptedEnvelopeSchema.safeParse(raw);
  if (!headerResult.success) {
    throw new MalformedEnvelopeError(`invalid encrypted envelope: ${headerResult.error.message}`);
  }
  const header = headerResult.data;

  let decrypted: string;
  try {
    decrypted = await decryptAesGcm(header.payload_ciphertext, header.iv, key);
  } catch {
    throw new WrongKeyError();
  }

  let inner: unknown;
  try {
    inner = JSON.parse(decrypted);
  } catch {
    throw new MalformedEnvelopeError('decrypted payload is not valid JSON');
  }

  const envelopeResult = EnvelopeSchema.safeParse({
    schema_version: header.schema_version,
    event_id: header.event_id,
    emitted_at: header.emitted_at,
    emitted_by: header.emitted_by,
    ...(inner as Record<string, unknown>),
  });
  if (!envelopeResult.success) {
    throw new MalformedEnvelopeError(`invalid decrypted envelope: ${envelopeResult.error.message}`);
  }
  return envelopeResult.data;
}
