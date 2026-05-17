import { describe, expect, expectTypeOf, it } from 'vitest';

import { ACTIONS, EVENTS, SCHEMA_VERSION } from '../constants/index.js';
import {
  type CreatePayload,
  type Envelope,
  type NotifyPayload,
} from '../schemas/v1/index.js';
import {
  buildEnvelope,
  filenameFor,
  parseEnvelope,
  parseFilename,
} from '../webdav/index.js';

const EVENT_ID_RE = /^\d{8}T\d{6}Z-[a-f0-9]{6}$/;

const sampleNotifyPayload: NotifyPayload = {
  event_id: 'evt_1',
  source_app: 'app.lastglance',
  source_entity_id: 'chore_42',
  event: EVENTS.COMPLETED,
  task_id: 'tsk_8a91',
  title: 'Replace HVAC filter',
  timestamp: '2026-05-17T14:30:22Z',
};

describe('buildEnvelope', () => {
  it('builds a valid envelope for the create action', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: { title: 'Buy milk' },
      emittedBy: 'app.dayglance',
    });
    expect(envelope.action).toBe('create');
    expect(envelope.schema_version).toBe(SCHEMA_VERSION);
    expect(envelope.emitted_by).toBe('app.dayglance');
    expect(envelope.event_id).toMatch(EVENT_ID_RE);
  });

  it('builds a valid envelope for the complete action', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.COMPLETE,
      payload: { title: 'Feed cat' },
      emittedBy: 'app.dayglance',
    });
    expect(envelope.action).toBe('complete');
  });

  it('builds a valid envelope for the open action', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.OPEN,
      payload: { tab: 'inbox' },
      emittedBy: 'app.dayglance',
    });
    expect(envelope.action).toBe('open');
  });

  it('builds a valid envelope for the query action (empty payload)', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
    });
    expect(envelope.action).toBe('query');
    expect(envelope.payload).toEqual({});
  });

  it('builds a valid envelope for the notify action', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.NOTIFY,
      payload: sampleNotifyPayload,
      emittedBy: 'app.dayglance',
    });
    expect(envelope.action).toBe('notify');
  });

  it('default emitted_at is approximately now', () => {
    const before = Date.now();
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
    });
    const after = Date.now();
    const emitted = Date.parse(envelope.emitted_at);
    expect(emitted).toBeGreaterThanOrEqual(before);
    expect(emitted).toBeLessThanOrEqual(after);
  });

  it('default event_id is generated and matches the eventId format', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
    });
    expect(envelope.event_id).toMatch(EVENT_ID_RE);
  });

  it('default event_id timestamp prefix matches default emitted_at', () => {
    const emittedAt = new Date('2026-05-17T14:30:22.500Z');
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
      emittedAt,
    });
    expect(envelope.event_id.startsWith('20260517T143022Z-')).toBe(true);
    expect(envelope.emitted_at).toBe('2026-05-17T14:30:22.500Z');
  });

  it('explicit emitted_at is used when provided', () => {
    const emittedAt = new Date('2026-01-15T09:00:00.000Z');
    const envelope = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: { title: 'x' },
      emittedBy: 'app.dayglance',
      emittedAt,
    });
    expect(envelope.emitted_at).toBe('2026-01-15T09:00:00.000Z');
  });

  it('explicit eventId is used when provided', () => {
    const explicitId = '20260601T120000Z-deadbe';
    const envelope = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: { title: 'x' },
      emittedBy: 'app.dayglance',
      eventId: explicitId,
    });
    expect(envelope.event_id).toBe(explicitId);
  });

  it('schema_version is always 1', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
    });
    expect(envelope.schema_version).toBe(1);
  });

  it('throws if the resulting envelope would be invalid (defense in depth)', () => {
    expect(() =>
      buildEnvelope({
        action: ACTIONS.QUERY,
        payload: {},
        emittedBy: 'app.dayglance',
        eventId: 'not-a-valid-event-id',
      }),
    ).not.toThrow(); // event_id only requires non-empty in the schema
    // Use an empty emittedBy to trigger a real failure
    expect(() =>
      buildEnvelope({
        action: ACTIONS.QUERY,
        payload: {},
        emittedBy: '',
      }),
    ).toThrow();
  });

  it('round-trips through parseEnvelope', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.NOTIFY,
      payload: sampleNotifyPayload,
      emittedBy: 'app.dayglance',
    });
    const reparsed = parseEnvelope(JSON.parse(JSON.stringify(envelope)));
    expect(reparsed).toEqual(envelope);
  });

  it('rejects a mismatched action/payload pair at the type level', () => {
    // Type-only check: defined but never invoked. The @ts-expect-error
    // directive fails the build if TS doesn't catch the action/payload
    // mismatch (`tab` belongs to OpenPayload; CreatePayload requires `title`).
    const typeCheck = (): void => {
      buildEnvelope({
        action: ACTIONS.CREATE,
        // @ts-expect-error action 'create' requires a CreatePayload, not an OpenPayload shape
        payload: { tab: 'inbox' },
        emittedBy: 'app.dayglance',
      });
    };
    expect(typeof typeCheck).toBe('function');
  });

  it('return type is Envelope', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: { title: 'x' },
      emittedBy: 'app.dayglance',
    });
    expectTypeOf(envelope).toEqualTypeOf<Envelope>();
  });

  it('payload type narrows from the action at call site', () => {
    // The point of ActionPayloadMap: TS infers `payload` to be exactly
    // CreatePayload when action is 'create'. Verifying that here means
    // future regressions in the generic constraint fail the test build.
    type CreateArgsPayload = Parameters<typeof buildEnvelope<'create'>>[0]['payload'];
    expectTypeOf<CreateArgsPayload>().toEqualTypeOf<CreatePayload>();
  });
});

describe('parseEnvelope', () => {
  const validQueryEnvelope = {
    schema_version: 1,
    event_id: '20260517T143022Z-7f3a9c',
    emitted_at: '2026-05-17T14:30:22Z',
    emitted_by: 'app.dayglance',
    action: 'query',
    payload: {},
  };

  it('parses a valid envelope', () => {
    const result = parseEnvelope(validQueryEnvelope);
    expect(result.action).toBe('query');
  });

  it.each(['create', 'complete', 'open', 'query', 'notify'])(
    'parses the %s variant of the discriminated union',
    (action) => {
      const payloads: Record<string, unknown> = {
        create: { title: 'x' },
        complete: { title: 'x' },
        open: { tab: 'inbox' },
        query: {},
        notify: sampleNotifyPayload,
      };
      expect(
        parseEnvelope({
          ...validQueryEnvelope,
          action,
          payload: payloads[action],
        }).action,
      ).toBe(action);
    },
  );

  it('throws on wrong schema_version', () => {
    expect(() => parseEnvelope({ ...validQueryEnvelope, schema_version: 2 })).toThrow();
  });

  it('throws on missing required envelope field', () => {
    const { emitted_by: _emitted_by, ...rest } = validQueryEnvelope;
    expect(() => parseEnvelope(rest)).toThrow();
  });

  it('throws on action/payload mismatch', () => {
    expect(() =>
      parseEnvelope({
        ...validQueryEnvelope,
        action: 'create',
        payload: { event: 'completed' },
      }),
    ).toThrow();
  });

  it('throws on unknown extra top-level field (strict)', () => {
    expect(() => parseEnvelope({ ...validQueryEnvelope, extra: 'no' })).toThrow();
  });

  it('throws on non-object input', () => {
    expect(() => parseEnvelope('not an envelope')).toThrow();
    expect(() => parseEnvelope(null)).toThrow();
    expect(() => parseEnvelope(42)).toThrow();
  });

  it('return type is Envelope', () => {
    const result = parseEnvelope(validQueryEnvelope);
    expectTypeOf(result).toEqualTypeOf<Envelope>();
  });
});

describe('filenameFor', () => {
  it('returns <event_id>.json', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
      eventId: '20260517T143022Z-7f3a9c',
    });
    expect(filenameFor(envelope)).toBe('20260517T143022Z-7f3a9c.json');
  });

  it.each([
    '20260101T000000Z-aaaaaa',
    '20271231T235959Z-ffffff',
    '20260517T143022Z-000000',
  ])('preserves event_id "%s" verbatim', (id) => {
    const envelope = buildEnvelope({
      action: ACTIONS.QUERY,
      payload: {},
      emittedBy: 'app.dayglance',
      eventId: id,
    });
    expect(filenameFor(envelope)).toBe(`${id}.json`);
  });
});

describe('parseFilename', () => {
  it('parses a valid filename into event_id + timestamp', () => {
    expect(parseFilename('20260517T143022Z-7f3a9c.json')).toEqual({
      event_id: '20260517T143022Z-7f3a9c',
      timestamp: '20260517T143022Z',
    });
  });

  it('the timestamp is exactly the portion before the dash', () => {
    const result = parseFilename('20271231T235959Z-deadbe.json');
    expect(result?.timestamp).toBe('20271231T235959Z');
    expect(result?.event_id.startsWith(result?.timestamp ?? '')).toBe(true);
  });

  it('accepts the 6..8 hex range to tolerate future suffix widening', () => {
    expect(parseFilename('20260517T143022Z-1234567.json')?.event_id).toBe(
      '20260517T143022Z-1234567',
    );
    expect(parseFilename('20260517T143022Z-12345678.json')?.event_id).toBe(
      '20260517T143022Z-12345678',
    );
  });

  it('returns null for non-json extension', () => {
    expect(parseFilename('20260517T143022Z-7f3a9c.txt')).toBeNull();
    expect(parseFilename('20260517T143022Z-7f3a9c')).toBeNull();
  });

  it('returns null for filenames not matching the event-id format', () => {
    expect(parseFilename('garbage.json')).toBeNull();
    expect(parseFilename('README.md')).toBeNull();
    expect(parseFilename('20260517-143022Z-7f3a9c.json')).toBeNull();
    expect(parseFilename('20260517T143022-7f3a9c.json')).toBeNull(); // missing Z
    expect(parseFilename('20260517T143022Z-XYZ123.json')).toBeNull(); // non-hex
    expect(parseFilename('20260517T143022Z-abc.json')).toBeNull(); // suffix too short
  });

  it('returns null for filenames containing path separators', () => {
    expect(parseFilename('subdir/20260517T143022Z-7f3a9c.json')).toBeNull();
    expect(parseFilename('subdir\\20260517T143022Z-7f3a9c.json')).toBeNull();
    expect(parseFilename('/abs/20260517T143022Z-7f3a9c.json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseFilename('')).toBeNull();
  });

  it('round-trips with filenameFor', () => {
    const envelope = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: { title: 'x' },
      emittedBy: 'app.dayglance',
      eventId: '20260517T143022Z-7f3a9c',
    });
    const filename = filenameFor(envelope);
    const parsed = parseFilename(filename);
    expect(parsed?.event_id).toBe(envelope.event_id);
  });
});

describe('round-trip', () => {
  it('parseEnvelope(JSON.parse(JSON.stringify(buildEnvelope(...)))) is equivalent', () => {
    const original = buildEnvelope({
      action: ACTIONS.NOTIFY,
      payload: sampleNotifyPayload,
      emittedBy: 'app.dayglance',
      emittedAt: new Date('2026-05-17T14:30:22.123Z'),
      eventId: '20260517T143022Z-7f3a9c',
    });
    const reparsed = parseEnvelope(JSON.parse(JSON.stringify(original)));
    expect(reparsed).toEqual(original);
  });

  it('round-trips a create envelope through the spec example shape', () => {
    const original = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: {
        title: 'Replace HVAC filter #home',
        due: '2026-05-20T14:00:00Z',
        duration: 30,
        priority: 2,
        source_app: 'app.lastglance',
        source_entity_id: 'chore_42',
      },
      emittedBy: 'app.lastglance',
    });
    const reparsed = parseEnvelope(JSON.parse(JSON.stringify(original)));
    expect(reparsed.payload).toEqual(original.payload);
  });
});
