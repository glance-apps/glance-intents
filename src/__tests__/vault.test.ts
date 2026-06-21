import { describe, expect, expectTypeOf, it } from 'vitest';

import { ACTIONS, EVENTS } from '../constants/index.js';
import { type NotifyPayload } from '../schemas/v1/index.js';
import {
  buildIntentRow,
  formatSince,
  type IntentEventRow,
  isExpired,
  type OutboundIntentRow,
  parseIntentRow,
  parseSince,
} from '../vault/index.js';
import { buildEncryptedEnvelope, buildEnvelope } from '../webdav/index.js';

const sampleNotifyPayload: NotifyPayload = {
  event_id: 'evt_1',
  source_app: 'app.lastglance',
  source_entity_id: 'chore_42',
  event: EVENTS.COMPLETED,
  task_id: 'tsk_8a91',
  title: 'Replace HVAC filter',
  timestamp: '2026-05-17T14:30:22Z',
};

// A fixed emitted_at so expires_at math is deterministic in assertions.
const EMITTED_AT = new Date('2026-05-17T14:30:22.000Z');

function notifyEnvelope() {
  return buildEnvelope({
    action: ACTIONS.NOTIFY,
    payload: sampleNotifyPayload,
    emittedBy: 'app.dayglance',
    emittedAt: EMITTED_AT,
  });
}

describe('buildIntentRow (SEND)', () => {
  it('builds an insert-only row carrying envelope, event_id, and expires_at', () => {
    const envelope = notifyEnvelope();
    const row = buildIntentRow(envelope, { ttlMs: 7 * 24 * 60 * 60 * 1000 });

    expect(row.event_id).toBe(envelope.event_id);
    // Validated round-trip through the schema, so deep-equal (not identical).
    expect(row.envelope).toEqual(envelope);
    // emitted_at + 7d.
    expect(row.expires_at).toBe('2026-05-24T14:30:22.000Z');
  });

  it('uses the envelope event_id as the idempotency key (not a fresh id)', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.NOTIFY,
      payload: sampleNotifyPayload,
      emittedBy: 'app.dayglance',
      emittedAt: EMITTED_AT,
      eventId: '20260517T143022Z-abc123',
    });
    const row = buildIntentRow(envelope, { ttlMs: 1000 });
    expect(row.event_id).toBe('20260517T143022Z-abc123');
  });

  it('accepts an absolute expiresAt', () => {
    const row = buildIntentRow(notifyEnvelope(), {
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(row.expires_at).toBe('2026-06-01T00:00:00.000Z');
  });

  it('carries no seq: send cannot represent — let alone advance — a receive cursor', () => {
    const row = buildIntentRow(notifyEnvelope(), { ttlMs: 1000 });
    // The cursor-split discipline at the codec level: an outbound row has no
    // seq and no account_id (server-assigned). seq lives only on inbound rows,
    // so a send is structurally incapable of touching the receive cursor.
    expect('seq' in row).toBe(false);
    expect('account_id' in row).toBe(false);
    expect(Object.keys(row).sort()).toEqual(['envelope', 'event_id', 'expires_at']);
    expectTypeOf<OutboundIntentRow>().not.toHaveProperty('seq');
  });

  it('rejects a non-envelope payload (defense in depth)', () => {
    expect(() =>
      buildIntentRow({ not: 'an envelope' } as never, { ttlMs: 1000 }),
    ).toThrow();
  });

  it('round-trips an encrypted envelope opaquely', async () => {
    const key = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const encrypted = await buildEncryptedEnvelope(
      {
        action: ACTIONS.NOTIFY,
        payload: sampleNotifyPayload,
        emittedBy: 'app.dayglance',
        emittedAt: EMITTED_AT,
      },
      () => Promise.resolve(key),
    );
    const row = buildIntentRow(encrypted, { ttlMs: 1000 });
    expect(row.event_id).toBe(encrypted.event_id);
    expect(row.envelope).toEqual(encrypted);
  });
});

describe('SEND idempotency (re-send is a byte-identical no-op)', () => {
  it('building the same envelope twice yields identical rows', () => {
    const envelope = notifyEnvelope();
    const a = buildIntentRow(envelope, { ttlMs: 1000 });
    const b = buildIntentRow(envelope, { ttlMs: 1000 });
    // Same event_id (server dedups on it) and same expires_at: re-POSTing this
    // row is a harmless no-op.
    expect(a.event_id).toBe(b.event_id);
    expect(a.expires_at).toBe(b.expires_at);
    expect(a).toEqual(b);
  });
});

describe('parseIntentRow (RECEIVE)', () => {
  const validRow = {
    account_id: 'acct_1',
    event_id: '20260517T143022Z-abc123',
    seq: 42,
    envelope: { schema_version: 1, action: 'notify', event_id: 'x' },
    expires_at: '2026-05-24T14:30:22.000Z',
  };

  it('parses a row and exposes the server-assigned seq for cursor advance', () => {
    const parsed = parseIntentRow(validRow);
    expect(parsed.seq).toBe(42);
    expect(parsed.account_id).toBe('acct_1');
    expect(parsed.event_id).toBe('20260517T143022Z-abc123');
    // envelope stays opaque for the caller to route to the matching parser.
    expect(parsed.envelope).toEqual(validRow.envelope);
    expectTypeOf(parsed.seq).toEqualTypeOf<number>();
    expectTypeOf(parsed.envelope).toEqualTypeOf<unknown>();
  });

  it('rejects a missing seq', () => {
    const { seq: _seq, ...noSeq } = validRow;
    expect(() => parseIntentRow(noSeq)).toThrow();
  });

  it('rejects a non-integer seq', () => {
    expect(() => parseIntentRow({ ...validRow, seq: 4.2 })).toThrow();
  });

  it('rejects a bad expires_at', () => {
    expect(() => parseIntentRow({ ...validRow, expires_at: 'soon' })).toThrow();
  });

  it('rejects an envelope column that is not an object', () => {
    expect(() => parseIntentRow({ ...validRow, envelope: 'nope' })).toThrow();
  });

  it('rejects unexpected extra fields (strict)', () => {
    expect(() => parseIntentRow({ ...validRow, surprise: true })).toThrow();
  });
});

describe('RECEIVE idempotency + TTL (redelivery within the window is harmless)', () => {
  const inWindowRow: IntentEventRow = {
    account_id: 'acct_1',
    event_id: '20260517T143022Z-abc123',
    seq: 42,
    envelope: { schema_version: 1, action: 'notify' },
    expires_at: '2026-05-24T14:30:22.000Z',
  };

  it('repeated delivery of the same row yields the same event_id to dedup on', () => {
    const first = parseIntentRow(inWindowRow);
    const second = parseIntentRow({ ...inWindowRow });
    // The app dedups on event_id; redelivery of a not-yet-expired intent is a
    // no-op because both deliveries carry the same key.
    expect(first.event_id).toBe(second.event_id);
  });

  it('isExpired is false inside the TTL window and true past it', () => {
    const beforeExpiry = new Date('2026-05-20T00:00:00.000Z');
    const afterExpiry = new Date('2026-05-25T00:00:00.000Z');
    expect(isExpired(inWindowRow, beforeExpiry)).toBe(false);
    expect(isExpired(inWindowRow, afterExpiry)).toBe(true);
  });

  it('isExpired works on a freshly built outbound row too', () => {
    const row = buildIntentRow(notifyEnvelope(), { ttlMs: 1000 });
    expect(isExpired(row, new Date(EMITTED_AT.getTime() + 500))).toBe(false);
    expect(isExpired(row, new Date(EMITTED_AT.getTime() + 1500))).toBe(true);
  });
});

describe('since-cursor parsing', () => {
  it('parses integer and string cursors', () => {
    expect(parseSince(42)).toBe(42);
    expect(parseSince('42')).toBe(42);
    expect(parseSince(0)).toBe(0);
  });

  it('treats null/undefined/empty as no cursor yet', () => {
    expect(parseSince(null)).toBeNull();
    expect(parseSince(undefined)).toBeNull();
    expect(parseSince('')).toBeNull();
  });

  it('rejects non-integer and negative cursors', () => {
    expect(() => parseSince(4.2)).toThrow(RangeError);
    expect(() => parseSince(-1)).toThrow(RangeError);
    expect(() => parseSince('nope')).toThrow(RangeError);
  });

  it('formats cursors for the since parameter, null → backlog', () => {
    expect(formatSince(42)).toBe('42');
    expect(formatSince(0)).toBe('0');
    expect(formatSince(null)).toBe('0');
  });

  it('round-trips parse(format(seq))', () => {
    for (const seq of [0, 1, 42, 999999]) {
      expect(parseSince(formatSince(seq))).toBe(seq);
    }
  });
});
