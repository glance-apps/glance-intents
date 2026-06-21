import { z } from 'zod';

import { base64ToUint8Array, uint8ArrayToBase64 } from '../crypto/aes-gcm.js';
import {
  type EncryptedEnvelope,
  EncryptedEnvelopeSchema,
  type Envelope,
  EnvelopeSchema,
} from '../schemas/v1/index.js';

// Any envelope the package can produce can ride the GLANCEvault transport,
// plaintext or encrypted. On the wire the envelope is an OPAQUE base64 string
// (the server never looks inside it); the codec's API still takes and returns a
// structured envelope object. This mirrors how the WebDAV codec treats the
// envelope as the file body and `filenameFor` as the wrapper.
export type IntentEnvelope = Envelope | EncryptedEnvelope;

const intentEnvelopeSchema = z.union([EnvelopeSchema, EncryptedEnvelopeSchema]);

// The envelope crosses the wire as base64 of its UTF-8 JSON. TextEncoder /
// TextDecoder keep non-ASCII payloads (emoji, accented titles) intact, which a
// bare btoa/atob on the JSON string would corrupt.
function encodeEnvelope(envelope: IntentEnvelope): string {
  return uint8ArrayToBase64(new TextEncoder().encode(JSON.stringify(envelope)));
}

function decodeEnvelope(b64: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64ToUint8Array(b64)));
}

// One element of the `events` array a client POSTs to `POST /intents/batch`.
// Field names are camelCase to match the server. `accountId` is NOT part of the
// row — it is a top-level field of the batch body (app-owned scope), never per
// row. `seq` is server-assigned and only appears on inbound rows, so a send is
// structurally incapable of carrying — let alone advancing — a receive cursor.
// `eventId` is the client-generated idempotency key lifted to the top level
// (the server reads it from here, treating `envelope` as opaque): re-POSTing a
// row with the same eventId is a harmless no-op.
export interface OutboundIntentRow {
  eventId: string;
  envelope: string;
  expiresAt: string;
}

export const OutboundIntentRowSchema = z
  .object({
    eventId: z.string().min(1),
    envelope: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

// TTL is app policy, so the caller states it explicitly: either a window in
// milliseconds (expiry computed from the envelope's `emitted_at`, which makes a
// re-built row byte-identical and therefore an idempotent re-send) or an
// absolute expiry the caller has already computed.
export type IntentRowTtl = { ttlMs: number } | { expiresAt: Date };

export function buildIntentRow(envelope: IntentEnvelope, ttl: IntentRowTtl): OutboundIntentRow {
  // Validate the structured input before encoding (defense in depth, mirroring
  // buildEnvelope's round-trip): a non-envelope object is rejected here rather
  // than silently base64-encoded into an opaque blob the server can't reject.
  const validated = intentEnvelopeSchema.parse(envelope);

  const expiresAt =
    'expiresAt' in ttl
      ? ttl.expiresAt
      : new Date(new Date(validated.emitted_at).getTime() + ttl.ttlMs);

  return OutboundIntentRowSchema.parse({
    // Lift the envelope's own event_id to the top-level camelCase eventId so
    // the server's idempotency key lines up with the envelope's id across
    // transports.
    eventId: validated.event_id,
    envelope: encodeEnvelope(validated),
    expiresAt: expiresAt.toISOString(),
  });
}

// One row as the vault returns it from `GET /intents/list`. Field names are
// camelCase; the row does NOT carry account_id (scope only, never returned) and
// DOES carry serverMtime. `envelope` is a base64 string on the wire. `seq` is
// the server-assigned monotonic position a receiver advances its cursor over.
//
// `IntentEventRowSchema` validates the raw WIRE row (envelope as a base64
// string). `parseIntentRow` decodes that string back into the envelope object,
// so the returned `IntentEventRow.envelope` is the structured value the caller
// routes to `parseEnvelope` / `parseEncryptedEnvelope` by its `encrypted` flag.
export interface IntentEventRow {
  eventId: string;
  envelope: unknown;
  seq: number;
  expiresAt: string;
  serverMtime: string;
}

export const IntentEventRowSchema = z
  .object({
    eventId: z.string().min(1),
    envelope: z.string().min(1),
    seq: z.number().int().nonnegative(),
    expiresAt: z.string().datetime({ offset: true }),
    serverMtime: z.string().datetime({ offset: true }),
  })
  .strict();

export function parseIntentRow(raw: unknown): IntentEventRow {
  const wire = IntentEventRowSchema.parse(raw);
  return {
    eventId: wire.eventId,
    // Decode the opaque wire string back into the structured envelope object.
    envelope: decodeEnvelope(wire.envelope),
    seq: wire.seq,
    expiresAt: wire.expiresAt,
    serverMtime: wire.serverMtime,
  };
}

// Pure expiry check against `expiresAt`. The vault prunes expired rows
// server-side, but redelivery can race a prune, so receivers can use this to
// skip a row that is past its TTL but not yet swept. Works on either row shape.
export function isExpired(
  row: { expiresAt: string },
  now: Date = new Date(),
): boolean {
  return Date.parse(row.expiresAt) <= now.getTime();
}
