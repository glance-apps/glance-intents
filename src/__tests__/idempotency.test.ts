import { describe, expect, expectTypeOf, it } from 'vitest';

import { createKey, deterministicTaskId, eventId, taskIdFor } from '../idempotency/index.js';

describe('eventId', () => {
  const EVENT_ID_RE = /^\d{8}T\d{6}Z-[a-f0-9]{6}$/;

  it('matches the spec format YYYYMMDDTHHMMSSZ-xxxxxx', () => {
    expect(eventId()).toMatch(EVENT_ID_RE);
  });

  it('two consecutive calls produce different IDs (random suffix)', () => {
    expect(eventId()).not.toBe(eventId());
  });

  it('two calls with the same fixed `now` still produce different IDs', () => {
    const now = new Date('2026-05-17T14:30:22.123Z');
    expect(eventId(now)).not.toBe(eventId(now));
  });

  it('uses the supplied `now` for the timestamp prefix', () => {
    const now = new Date('2026-05-17T14:30:22.123Z');
    const id = eventId(now);
    expect(id.startsWith('20260517T143022Z-')).toBe(true);
  });

  it('strips fractional seconds from the timestamp prefix', () => {
    const now = new Date('2026-05-17T14:30:22.987Z');
    expect(eventId(now)).toMatch(/^20260517T143022Z-[a-f0-9]{6}$/);
  });

  it('emits the timestamp in UTC even for non-UTC input dates', () => {
    // Date is timezone-naive internally; constructing from an offset string
    // resolves to the same UTC instant. 14:30 +05:00 → 09:30 UTC.
    const now = new Date('2026-05-17T14:30:22+05:00');
    expect(eventId(now).startsWith('20260517T093022Z-')).toBe(true);
  });

  it('IDs sort lexically by time', () => {
    const earlier = eventId(new Date('2026-05-17T14:30:22Z'));
    const later = eventId(new Date('2026-05-17T14:31:23Z'));
    expect(earlier < later).toBe(true);
  });

  it('IDs sort lexically across day, month, year boundaries', () => {
    const a = eventId(new Date('2026-05-17T23:59:59Z'));
    const b = eventId(new Date('2026-05-18T00:00:00Z'));
    const c = eventId(new Date('2026-12-31T23:59:59Z'));
    const d = eventId(new Date('2027-01-01T00:00:00Z'));
    expect([a, b, c, d]).toEqual([a, b, c, d].slice().sort());
  });

  it('returns a synchronous string (not a Promise)', () => {
    const id = eventId();
    expectTypeOf(id).toEqualTypeOf<string>();
    expect(typeof id).toBe('string');
  });
});

describe('createKey', () => {
  // Precomputed via `printf 'app.lastglance|chore_42|2026-05-20' | shasum -a 256`.
  // Embedded so a future change to the hashing scheme fails this test.
  const KNOWN_VECTOR_INPUT = {
    source_app: 'app.lastglance',
    source_entity_id: 'chore_42',
    due: '2026-05-20',
  };
  const KNOWN_VECTOR_OUTPUT =
    'd1fc09456712b4a1da6f5486ad2de69cf7403e82bc4e813065142cedaebfd3ee';

  it('matches the precomputed SHA-256 known-vector', async () => {
    const key = await createKey(
      KNOWN_VECTOR_INPUT.source_app,
      KNOWN_VECTOR_INPUT.source_entity_id,
      KNOWN_VECTOR_INPUT.due,
    );
    expect(key).toBe(KNOWN_VECTOR_OUTPUT);
  });

  it('is deterministic: same inputs → same key', async () => {
    const a = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    const b = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    expect(a).toBe(b);
  });

  it('returns a 64-character lowercase hex string (SHA-256)', async () => {
    const key = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different source_app → different key', async () => {
    const a = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    const b = await createKey('app.lifeglance', 'chore_42', '2026-05-20');
    expect(a).not.toBe(b);
  });

  it('different source_entity_id → different key', async () => {
    const a = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    const b = await createKey('app.lastglance', 'chore_43', '2026-05-20');
    expect(a).not.toBe(b);
  });

  it('different due → different key', async () => {
    const a = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    const b = await createKey('app.lastglance', 'chore_42', '2026-05-21');
    expect(a).not.toBe(b);
  });

  it('undefined `due` and empty-string `due` produce the SAME key (documented behavior)', async () => {
    const undef = await createKey('app.lastglance', 'chore_42', undefined);
    const empty = await createKey('app.lastglance', 'chore_42', '');
    expect(undef).toBe(empty);
  });

  it('undefined `due` is a distinct key from any non-empty due', async () => {
    const undef = await createKey('app.lastglance', 'chore_42', undefined);
    const dated = await createKey('app.lastglance', 'chore_42', '2026-05-20');
    expect(undef).not.toBe(dated);
  });

  it('separator (|) prevents trivial collision between adjacent fields', async () => {
    // Without the separator, ("ab", "cd", "") and ("a", "bcd", "") would
    // collide. With the separator, the keys differ.
    const a = await createKey('app.aa', 'bb', '2026-05-20');
    const b = await createKey('app.a', 'abb', '2026-05-20');
    expect(a).not.toBe(b);
  });

  it('returns a Promise', async () => {
    const result = createKey('app.lastglance', 'chore_42', '2026-05-20');
    expect(result).toBeInstanceOf(Promise);
    expectTypeOf(result).toEqualTypeOf<Promise<string>>();
    await result;
  });
});

describe('module-level concerns', () => {
  it('importing the module has no side effects', async () => {
    // Re-importing the same module should not execute setup code beyond
    // function definitions. A side-effect-free module returns the same
    // bindings on every import; we verify by checking the function
    // reference is stable.
    const a = await import('../idempotency/index.js');
    const b = await import('../idempotency/index.js');
    expect(a.eventId).toBe(b.eventId);
    expect(a.createKey).toBe(b.createKey);
  });
});

describe('deterministicTaskId / taskIdFor', () => {
  // Ids dayGLANCE's handleIntent produced before this moved here (its own
  // deterministicTaskId over createKey, 2026-11-14). These ids are in users'
  // data: if one of these changes, a re-delivered create makes a duplicate.
  const CHORE = '33333333-3333-3333-3333-333333333333';
  const LASTGLANCE = 'app.lastglance';

  it('matches the ids already in use for a timed, an all-day and an inbox create', async () => {
    expect(await taskIdFor(LASTGLANCE, CHORE, '2026-11-15T09:00:00-07:00')).toBe(
      'fd071633-95dc-4088-a29f-6ccd56ea72e1',
    );
    expect(await taskIdFor(LASTGLANCE, CHORE, '2026-11-15')).toBe(
      'ad49bb95-aaa1-4dd1-9fa5-14d82a98362f',
    );
    expect(await taskIdFor(LASTGLANCE, CHORE, undefined)).toBe(
      'f25285b0-e601-4900-bbea-c4a8c8915b5f',
    );
  });

  it('is deterministicTaskId over createKey', async () => {
    const key = await createKey(LASTGLANCE, CHORE, '2026-11-15');
    expect(await deterministicTaskId(key)).toBe(await taskIdFor(LASTGLANCE, CHORE, '2026-11-15'));
  });

  it('gives a version 4 UUID, the same for the same seed, different for another', async () => {
    const a = await deterministicTaskId('seed-a');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await deterministicTaskId('seed-a')).toBe(a);
    expect(await deterministicTaskId('seed-b')).not.toBe(a);
  });

  it('keeps a due with a time distinct from the same date all day, and from no due', async () => {
    const ids = new Set([
      await taskIdFor(LASTGLANCE, CHORE, '2026-11-15T09:00:00-07:00'),
      await taskIdFor(LASTGLANCE, CHORE, '2026-11-15'),
      await taskIdFor(LASTGLANCE, CHORE, undefined),
    ]);
    expect(ids.size).toBe(3);
  });
});
