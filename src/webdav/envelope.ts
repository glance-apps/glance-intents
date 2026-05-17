import { type Action, SCHEMA_VERSION } from '../constants/index.js';
import { eventId } from '../idempotency/index.js';
import {
  type CompletePayload,
  type CreatePayload,
  type Envelope,
  EnvelopeSchema,
  type NotifyPayload,
  type OpenPayload,
  type QueryPayload,
} from '../schemas/v1/index.js';

// Maps each action to its payload type. Used to enforce that
// `buildEnvelope({ action, payload })` rejects mismatched pairs at the
// type level (e.g. action: 'create' with a notify payload's shape).
export interface ActionPayloadMap {
  create: CreatePayload;
  complete: CompletePayload;
  open: OpenPayload;
  query: QueryPayload;
  notify: NotifyPayload;
}

export interface BuildEnvelopeArgs<A extends Action> {
  action: A;
  payload: ActionPayloadMap[A];
  emittedBy: string;
  emittedAt?: Date;
  eventId?: string;
}

export function buildEnvelope<A extends Action>(args: BuildEnvelopeArgs<A>): Envelope {
  const emittedAt = args.emittedAt ?? new Date();
  const draft = {
    schema_version: SCHEMA_VERSION,
    event_id: args.eventId ?? eventId(emittedAt),
    emitted_at: emittedAt.toISOString(),
    emitted_by: args.emittedBy,
    action: args.action,
    payload: args.payload,
  };

  // Round-trip through the schema: validates the shape (defense in depth
  // against any future drift between this builder and the canonical
  // schema) and gives the caller back a properly-typed `Envelope`.
  return EnvelopeSchema.parse(draft);
}

export function parseEnvelope(raw: unknown): Envelope {
  return EnvelopeSchema.parse(raw);
}
