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
  title: 'Replace HVAC filter ☃️', // non-ASCII: proves UTF-8-safe base64.
  timestamp: '2026-05-17T14:30:22Z',
};

// A fixed emitted_at so expiresAt math is deterministic in assertions.
const EMITTED_AT = new Date('2026-05-17T14:30:22.000Z');

function notifyEnvelope() {
  return buildEnvelope({
    action: ACTIONS.NOTIFY,
    payload: sampleNotifyPayload,
    emittedBy: 'app.dayglance',
    emittedAt: EMITTED_AT,
  });
}

// Reconstruct the row the server stores then returns from a freshly built
// outbound row: it keeps the base64 envelope and adds the server-assigned seq
// and serverMtime. account_id is never returned (scope only).
function asServerRow(out: OutboundIntentRow, seq = 42): unknown {
  return {
    eventId: out.eventId,
    envelope: out.envelope,
    seq,
    expiresAt: out.expiresAt,
    serverMtime: '2026-05-17T14:30:25.000Z',
  };
}

describe('buildIntentRow (SEND) — camelCase + base64 wire shape', () => {
  it('emits exactly { eventId, envelope, expiresAt } in camelCase', () => {
    const row = buildIntentRow(notifyEnvelope(), { ttlMs: 7 * 24 * 60 * 60 * 1000 });
    expect(Object.keys(row).sort()).toEqual(['envelope', 'eventId', 'expiresAt']);
    // No snake_case, no seq, no accountId on an outbound row.
    expect('event_id' in row).toBe(false);
    expect('expires_at' in row).toBe(false);
    expect('seq' in row).toBe(false);
    expect('accountId' in row).toBe(false);
    expect('account_id' in row).toBe(false);
    expectTypeOf<OutboundIntentRow>().not.toHaveProperty('seq');
  });

  it('lifts the envelope event_id to the top-level eventId', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.NOTIFY,
      payload: sampleNotifyPayload,
      emittedBy: 'app.dayglance',
      emittedAt: EMITTED_AT,
      eventId: '20260517T143022Z-abc123',
    });
    const row = buildIntentRow(envelope, { ttlMs: 1000 });
    expect(row.eventId).toBe('20260517T143022Z-abc123');
    expect(row.eventId).toBe(envelope.event_id);
  });

  it('emits the envelope as a base64 STRING, not an object', () => {
    const envelope = notifyEnvelope();
    const row = buildIntentRow(envelope, { ttlMs: 1000 });
    expect(typeof row.envelope).toBe('string');
    // The base64 string decodes back to the original envelope JSON.
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(globalThis.atob(row.envelope), (c) => c.charCodeAt(0)),
      ),
    );
    expect(decoded).toEqual(envelope);
  });

  it('computes expiresAt from emitted_at + ttlMs as an ISO string', () => {
    const row = buildIntentRow(notifyEnvelope(), { ttlMs: 7 * 24 * 60 * 60 * 1000 });
    expect(row.expiresAt).toBe('2026-05-24T14:30:22.000Z');
  });

  it('accepts an absolute expiresAt', () => {
    const row = buildIntentRow(notifyEnvelope(), {
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(row.expiresAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('rejects a non-envelope input (defense in depth)', () => {
    expect(() => buildIntentRow({ not: 'an envelope' } as never, { ttlMs: 1000 })).toThrow();
  });
});

describe('SEND idempotency (re-send is a byte-identical no-op)', () => {
  it('building the same envelope twice yields identical rows', () => {
    const envelope = notifyEnvelope();
    const a = buildIntentRow(envelope, { ttlMs: 1000 });
    const b = buildIntentRow(envelope, { ttlMs: 1000 });
    expect(a.eventId).toBe(b.eventId);
    expect(a.envelope).toBe(b.envelope); // identical base64 string
    expect(a.expiresAt).toBe(b.expiresAt);
    expect(a).toEqual(b);
  });
});

describe('round-trip through the base64 string boundary', () => {
  it('build → server row → parse recovers the original envelope object', () => {
    const envelope = notifyEnvelope();
    const out = buildIntentRow(envelope, { ttlMs: 1000 });
    const parsed = parseIntentRow(asServerRow(out, 99));

    // The base64 wire envelope decodes back to the exact structured envelope.
    expect(parsed.envelope).toEqual(envelope);
    expect(parsed.eventId).toBe(envelope.event_id);
    expect(parsed.seq).toBe(99);
    expect(parsed.expiresAt).toBe(out.expiresAt);
    expect(parsed.serverMtime).toBe('2026-05-17T14:30:25.000Z');
  });

  it('round-trips an encrypted envelope opaquely through base64', async () => {
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
    const out = buildIntentRow(encrypted, { ttlMs: 1000 });
    expect(typeof out.envelope).toBe('string');
    const parsed = parseIntentRow(asServerRow(out));
    expect(parsed.envelope).toEqual(encrypted);
    expect(parsed.eventId).toBe(encrypted.event_id);
  });
});

describe('parseIntentRow (RECEIVE)', () => {
  const validRow = {
    eventId: '20260517T143022Z-abc123',
    envelope: globalThis.btoa(JSON.stringify({ schema_version: 1, action: 'notify' })),
    seq: 42,
    expiresAt: '2026-05-24T14:30:22.000Z',
    serverMtime: '2026-05-17T14:30:25.000Z',
  };

  it('ACCEPTS a base64-string envelope and decodes it', () => {
    const parsed = parseIntentRow(validRow);
    expect(parsed.envelope).toEqual({ schema_version: 1, action: 'notify' });
    expect(parsed.seq).toBe(42);
    expect(parsed.eventId).toBe('20260517T143022Z-abc123');
    expect(parsed.serverMtime).toBe('2026-05-17T14:30:25.000Z');
    expectTypeOf(parsed.seq).toEqualTypeOf<number>();
    expectTypeOf(parsed.envelope).toEqualTypeOf<unknown>();
  });

  it('REJECTS a JSON-object envelope (the old wrong wire shape)', () => {
    expect(() =>
      parseIntentRow({ ...validRow, envelope: { schema_version: 1, action: 'notify' } }),
    ).toThrow();
  });

  it('REJECTS a row carrying account_id (strict; server never returns it)', () => {
    expect(() => parseIntentRow({ ...validRow, account_id: 'acct_1' })).toThrow();
  });

  it('rejects a missing serverMtime', () => {
    const { serverMtime: _m, ...noMtime } = validRow;
    expect(() => parseIntentRow(noMtime)).toThrow();
  });

  it('rejects a missing seq', () => {
    const { seq: _seq, ...noSeq } = validRow;
    expect(() => parseIntentRow(noSeq)).toThrow();
  });

  it('rejects a non-integer seq', () => {
    expect(() => parseIntentRow({ ...validRow, seq: 4.2 })).toThrow();
  });

  it('rejects a bad expiresAt', () => {
    expect(() => parseIntentRow({ ...validRow, expiresAt: 'soon' })).toThrow();
  });
});

describe('RECEIVE idempotency + TTL (redelivery within the window is harmless)', () => {
  const inWindowRow = {
    eventId: '20260517T143022Z-abc123',
    envelope: globalThis.btoa(JSON.stringify({ schema_version: 1, action: 'notify' })),
    seq: 42,
    expiresAt: '2026-05-24T14:30:22.000Z',
    serverMtime: '2026-05-17T14:30:25.000Z',
  };

  it('repeated delivery of the same row yields the same eventId to dedup on', () => {
    const first = parseIntentRow(inWindowRow);
    const second = parseIntentRow({ ...inWindowRow });
    expect(first.eventId).toBe(second.eventId);
  });

  it('isExpired is false inside the TTL window and true past it', () => {
    const row: Pick<IntentEventRow, 'expiresAt'> = { expiresAt: '2026-05-24T14:30:22.000Z' };
    expect(isExpired(row, new Date('2026-05-20T00:00:00.000Z'))).toBe(false);
    expect(isExpired(row, new Date('2026-05-25T00:00:00.000Z'))).toBe(true);
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

  it('formats cursors for the since parameter, null → backlog (0)', () => {
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
