import { describe, expect, expectTypeOf, it } from 'vitest';

import { ACTIONS, EVENTS, SCHEMA_VERSION } from '../constants/index.js';
import {
  CompleteSchema,
  CreateSchema,
  EnvelopeSchema,
  NotifySchema,
  OpenSchema,
  QuerySchema,
  type CompletePayload,
  type CreatePayload,
  type Envelope,
  type NotifyPayload,
  type OpenPayload,
  type QueryPayload,
} from '../schemas/v1/index.js';

describe('CreateSchema', () => {
  it('accepts a minimal payload (title only)', () => {
    expect(CreateSchema.safeParse({ title: 'Buy milk' }).success).toBe(true);
  });

  it('accepts the full v1 field set', () => {
    const result = CreateSchema.safeParse({
      title: 'Replace HVAC filter #home',
      due: '2026-05-20T14:00:00Z',
      duration: 30,
      all_day: false,
      tags: 'home,errands',
      priority: 2,
      notes: 'check the model number first',
      project: 'house',
      recurring: 'monthly',
      source_app: 'app.lastglance',
      source_entity_id: 'chore_42',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const r = CreateSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects empty title', () => {
    expect(CreateSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const r = CreateSchema.safeParse({ title: 'x', not_a_field: true });
    expect(r.success).toBe(false);
  });

  describe('due', () => {
    it('accepts a date-only string', () => {
      expect(CreateSchema.safeParse({ title: 'x', due: '2026-05-20' }).success).toBe(true);
    });

    it('accepts an ISO 8601 datetime with offset', () => {
      expect(
        CreateSchema.safeParse({ title: 'x', due: '2026-05-20T14:00:00+05:00' }).success,
      ).toBe(true);
    });

    it('rejects a malformed date string', () => {
      expect(CreateSchema.safeParse({ title: 'x', due: '2026/05/20' }).success).toBe(false);
    });
  });

  describe('priority union', () => {
    it.each([0, 1, 2, 3])('accepts integer %i', (n) => {
      expect(CreateSchema.safeParse({ title: 'x', priority: n }).success).toBe(true);
    });

    it.each(['none', 'low', 'medium', 'high'])('accepts string "%s"', (s) => {
      expect(CreateSchema.safeParse({ title: 'x', priority: s }).success).toBe(true);
    });

    it('accepts string with non-canonical case (normalizer fixes it later)', () => {
      expect(CreateSchema.safeParse({ title: 'x', priority: 'HIGH' }).success).toBe(true);
      expect(CreateSchema.safeParse({ title: 'x', priority: 'Medium' }).success).toBe(true);
    });

    it('rejects integer outside 0..3', () => {
      expect(CreateSchema.safeParse({ title: 'x', priority: 4 }).success).toBe(false);
      expect(CreateSchema.safeParse({ title: 'x', priority: -1 }).success).toBe(false);
    });

    it('rejects unknown string', () => {
      expect(CreateSchema.safeParse({ title: 'x', priority: 'urgent' }).success).toBe(false);
    });
  });

  describe('source_app / source_entity_id pairing', () => {
    it('accepts both together', () => {
      expect(
        CreateSchema.safeParse({
          title: 'x',
          source_app: 'app.lastglance',
          source_entity_id: 'chore_42',
        }).success,
      ).toBe(true);
    });

    it('accepts source_app alone', () => {
      expect(CreateSchema.safeParse({ title: 'x', source_app: 'app.lastglance' }).success).toBe(
        true,
      );
    });

    it('rejects source_entity_id without source_app', () => {
      const r = CreateSchema.safeParse({ title: 'x', source_entity_id: 'chore_42' });
      expect(r.success).toBe(false);
    });

    it('rejects a source_app that is not a reverse-DNS identifier', () => {
      expect(CreateSchema.safeParse({ title: 'x', source_app: 'lastglance' }).success).toBe(false);
      expect(CreateSchema.safeParse({ title: 'x', source_app: 'App.LastGLANCE' }).success).toBe(
        false,
      );
    });
  });

  describe('duration requires due with time', () => {
    it('accepts duration with a datetime due', () => {
      expect(
        CreateSchema.safeParse({ title: 'x', due: '2026-05-20T14:00:00Z', duration: 30 }).success,
      ).toBe(true);
    });

    it('rejects duration without due', () => {
      expect(CreateSchema.safeParse({ title: 'x', duration: 30 }).success).toBe(false);
    });

    it('rejects duration with date-only due', () => {
      expect(
        CreateSchema.safeParse({ title: 'x', due: '2026-05-20', duration: 30 }).success,
      ).toBe(false);
    });
  });
});

describe('CompleteSchema', () => {
  it('accepts a minimal payload (title only)', () => {
    expect(CompleteSchema.safeParse({ title: 'Feed cat' }).success).toBe(true);
  });

  it('accepts a completed_at timestamp', () => {
    expect(
      CompleteSchema.safeParse({
        title: 'Feed cat',
        completed_at: '2026-05-20T14:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('rejects missing title', () => {
    expect(CompleteSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(CompleteSchema.safeParse({ title: 'x', notes: 'late' }).success).toBe(false);
  });
});

describe('OpenSchema', () => {
  it.each(['glance', 'timeline', 'inbox', 'goals', 'settings'])(
    'accepts the known tab "%s"',
    (tab) => {
      expect(OpenSchema.safeParse({ tab }).success).toBe(true);
    },
  );

  it('accepts an unknown tab string (handler falls back to glance)', () => {
    expect(OpenSchema.safeParse({ tab: 'future_tab' }).success).toBe(true);
  });

  it('rejects empty tab (distinct from omitted)', () => {
    expect(OpenSchema.safeParse({ tab: '' }).success).toBe(false);
  });

  it('accepts omitted tab (handler falls back to glance)', () => {
    expect(OpenSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    expect(OpenSchema.safeParse({ tab: 'inbox', extra: true }).success).toBe(false);
  });
});

describe('QuerySchema', () => {
  it('accepts an empty payload', () => {
    expect(QuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown fields (strict — no scope in v1)', () => {
    expect(QuerySchema.safeParse({ scope: 'today' }).success).toBe(false);
  });
});

describe('NotifySchema', () => {
  const baseNotify = {
    event_id: 'evt_1',
    source_app: 'app.lastglance',
    source_entity_id: 'chore_42',
    task_id: 'tsk_8a91',
    title: 'Replace HVAC filter',
    timestamp: '2026-05-10T14:30:22Z',
  };

  it.each([
    EVENTS.COMPLETED,
    EVENTS.UNCOMPLETED,
    EVENTS.DELETED,
    EVENTS.RESCHEDULED,
    EVENTS.UPDATED,
  ])('accepts event "%s"', (event) => {
    expect(NotifySchema.safeParse({ ...baseNotify, event }).success).toBe(true);
  });

  it('accepts optional entity_type', () => {
    expect(
      NotifySchema.safeParse({
        ...baseNotify,
        event: EVENTS.COMPLETED,
        entity_type: 'goal',
      }).success,
    ).toBe(true);
  });

  it('accepts entity_type values beyond task/goal (forward compat)', () => {
    expect(
      NotifySchema.safeParse({
        ...baseNotify,
        event: EVENTS.COMPLETED,
        entity_type: 'routine',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown event', () => {
    expect(NotifySchema.safeParse({ ...baseNotify, event: 'archived' }).success).toBe(false);
  });

  it.each(['event_id', 'source_app', 'source_entity_id', 'event', 'task_id', 'title', 'timestamp'])(
    'rejects missing required field "%s"',
    (field) => {
      const payload: Record<string, unknown> = { ...baseNotify, event: EVENTS.COMPLETED };
      delete payload[field];
      expect(NotifySchema.safeParse(payload).success).toBe(false);
    },
  );

  it('rejects timestamp without offset', () => {
    expect(
      NotifySchema.safeParse({ ...baseNotify, event: EVENTS.COMPLETED, timestamp: '2026-05-10' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(
      NotifySchema.safeParse({
        ...baseNotify,
        event: EVENTS.COMPLETED,
        invented: true,
      }).success,
    ).toBe(false);
  });
});

describe('EnvelopeSchema', () => {
  const envelopeBase = {
    schema_version: SCHEMA_VERSION,
    event_id: '20260510T143022Z-7f3a9c',
    emitted_at: '2026-05-10T14:30:22Z',
    emitted_by: 'app.dayglance',
  };

  it('accepts an envelope with create action and create payload', () => {
    const r = EnvelopeSchema.safeParse({
      ...envelopeBase,
      action: ACTIONS.CREATE,
      payload: { title: 'Buy milk' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts an envelope with notify action and full notify payload (spec example)', () => {
    const r = EnvelopeSchema.safeParse({
      ...envelopeBase,
      action: ACTIONS.NOTIFY,
      payload: {
        event: EVENTS.COMPLETED,
        source_app: 'app.lastglance',
        source_entity_id: 'chore_42',
        task_id: 'tsk_8a91',
        title: 'Replace HVAC filter',
        timestamp: '2026-05-10T14:30:22Z',
        completed_at: '2026-05-10T14:30:22Z',
        event_id: 'evt_1',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects mismatched action and payload', () => {
    const r = EnvelopeSchema.safeParse({
      ...envelopeBase,
      action: ACTIONS.CREATE,
      payload: { event: EVENTS.COMPLETED },
    });
    expect(r.success).toBe(false);
  });

  it('rejects wrong schema_version', () => {
    expect(
      EnvelopeSchema.safeParse({
        ...envelopeBase,
        schema_version: 2,
        action: ACTIONS.CREATE,
        payload: { title: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown action', () => {
    expect(
      EnvelopeSchema.safeParse({
        ...envelopeBase,
        action: 'archive',
        payload: {},
      }).success,
    ).toBe(false);
  });

  it('rejects envelopes missing transport metadata', () => {
    expect(
      EnvelopeSchema.safeParse({
        action: ACTIONS.QUERY,
        payload: {},
      }).success,
    ).toBe(false);
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(
      EnvelopeSchema.safeParse({
        ...envelopeBase,
        action: ACTIONS.QUERY,
        payload: {},
        extra: 'nope',
      }).success,
    ).toBe(false);
  });
});

describe('versioned namespace', () => {
  it('exposes v1 schemas via the schemas.v1 namespace from the root index', async () => {
    const { schemas } = await import('../index.js');
    expect(schemas.v1.CreateSchema.safeParse({ title: 'x' }).success).toBe(true);
    expect(schemas.v1.QuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('type inference', () => {
  it('CreatePayload includes optional fields and the priority union', () => {
    expectTypeOf<CreatePayload['title']>().toEqualTypeOf<string>();
    expectTypeOf<CreatePayload['due']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CreatePayload['priority']>().toEqualTypeOf<number | string | undefined>();
  });

  it('NotifyPayload.event is the EVENTS literal union', () => {
    expectTypeOf<NotifyPayload['event']>().toEqualTypeOf<
      'completed' | 'uncompleted' | 'deleted' | 'rescheduled' | 'updated'
    >();
  });

  it('Envelope is a discriminated union by action', () => {
    const fn = (e: Envelope): string => e.action;
    const create: CreatePayload = { title: 'x' };
    const complete: CompletePayload = { title: 'x' };
    const open: OpenPayload = { tab: 'inbox' };
    const query: QueryPayload = {};
    expect(fn).toBeTypeOf('function');
    expect([create, complete, open, query]).toHaveLength(4);
  });
});
