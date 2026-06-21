import { z } from 'zod';

import {
  type EncryptedEnvelope,
  EncryptedEnvelopeSchema,
  type Envelope,
  EnvelopeSchema,
} from '../schemas/v1/index.js';

// Any envelope the package can produce can ride the GLANCEvault transport,
// plaintext or encrypted. The vault stores the whole envelope opaquely in its
// `envelope` column; only the surrounding row fields (event_id, seq,
// expires_at) are the vault's concern. This mirrors how the WebDAV codec
// treats the envelope as the file body and `filenameFor` as the wrapper.
export type IntentEnvelope = Envelope | EncryptedEnvelope;

const intentEnvelopeSchema = z.union([EnvelopeSchema, EncryptedEnvelopeSchema]);

// What a client POSTs to the vault to insert one intent. `account_id` and
// `seq` are assigned by the server (`account_id` from auth, `seq` is the
// monotonic per-account counter receivers cursor on), so they are absent from
// the outbound shape. `event_id` is the client-generated idempotency key:
// re-POSTing a row with the same event_id is a harmless no-op on the server.
//
// Note there is deliberately no `seq` here. Sending is structurally incapable
// of carrying — let alone advancing — a receive cursor, because seq only ever
// exists on the inbound row the server hands back. The cursor-split discipline
// (a device that sends must still receive an unconsumed intent sitting below
// the seq it just sent) lives in the app-owned transport, but the codec makes
// the wrong shape unrepresentable in the first place.
export interface OutboundIntentRow {
  event_id: string;
  envelope: IntentEnvelope;
  expires_at: string;
}

export const OutboundIntentRowSchema = z
  .object({
    event_id: z.string().min(1),
    envelope: intentEnvelopeSchema,
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();

// TTL is app policy, so the caller states it explicitly: either a window in
// milliseconds (expiry computed from the envelope's `emitted_at`, which makes a
// re-built row byte-identical and therefore an idempotent re-send) or an
// absolute expiry the caller has already computed.
export type IntentRowTtl = { ttlMs: number } | { expiresAt: Date };

export function buildIntentRow(envelope: IntentEnvelope, ttl: IntentRowTtl): OutboundIntentRow {
  const expiresAt =
    'expiresAt' in ttl
      ? ttl.expiresAt
      : new Date(new Date(envelope.emitted_at).getTime() + ttl.ttlMs);

  // Round-trip through the schema, mirroring buildEnvelope: validates the row
  // shape (defense in depth) and hands back a properly-typed OutboundIntentRow.
  return OutboundIntentRowSchema.parse({
    // event_id IS the envelope's event_id. Reusing it rather than minting a
    // fresh one keeps the vault row's idempotency key aligned with the
    // envelope's own id, so dedup is consistent across transports.
    event_id: envelope.event_id,
    envelope,
    expires_at: expiresAt.toISOString(),
  });
}

// One row as the vault returns it from a list-since-cursor read. `seq` is the
// server-assigned monotonic position a receiver advances its cursor over;
// `envelope` is returned opaque (route it to `parseEnvelope` or
// `parseEncryptedEnvelope` based on its `encrypted` flag, exactly as a WebDAV
// reader does after fetching a file).
export interface IntentEventRow {
  account_id: string;
  event_id: string;
  seq: number;
  envelope: unknown;
  expires_at: string;
}

export const IntentEventRowSchema = z
  .object({
    account_id: z.string().min(1),
    event_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    // Kept opaque on purpose: the codec doesn't decide plaintext vs encrypted
    // here. The caller inspects `encrypted` and routes to the matching parser,
    // mirroring the WebDAV read path. Requiring an object (not bare unknown)
    // still rejects rows whose envelope column is null or a scalar.
    envelope: z.record(z.string(), z.unknown()),
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();

export function parseIntentRow(raw: unknown): IntentEventRow {
  return IntentEventRowSchema.parse(raw);
}

// Pure expiry check against `expires_at`. The vault prunes expired rows
// server-side, but redelivery can race a prune, so receivers can use this to
// skip a row that is past its TTL but not yet swept. Works on either row shape.
export function isExpired(
  row: Pick<IntentEventRow, 'expires_at'>,
  now: Date = new Date(),
): boolean {
  return Date.parse(row.expires_at) <= now.getTime();
}
