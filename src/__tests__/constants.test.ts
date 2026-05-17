import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ANDROID_ACTIONS,
  ENTITY_TYPES,
  EVENTS,
  PRIORITY,
  PRIORITY_ALIASES,
  QUERY_RETURN_VARS,
  RETURN_VARS,
  RETURN_VAR_TYPES,
  SCHEMA_VERSION,
  SOURCE_APPS,
  TABS,
  UNIVERSAL_RETURN_VARS,
  UPDATED_FIELDS,
  type Action,
  type AndroidAction,
  type EntityType,
  type Event,
  type PriorityLevel,
  type ReturnVar,
  type SourceApp,
  type Tab,
  type UpdatedField,
} from '../constants/index.js';

describe('SCHEMA_VERSION', () => {
  it('is 1 for protocol v1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe('ACTIONS', () => {
  it('value matches lowercased key for every action', () => {
    for (const [key, value] of Object.entries(ACTIONS)) {
      expect(value).toBe(key.toLowerCase());
    }
  });

  it('has exactly the five v1 actions', () => {
    expect(Object.values(ACTIONS).sort()).toEqual(
      ['complete', 'create', 'notify', 'open', 'query'].sort(),
    );
  });
});

describe('EVENTS', () => {
  it('value matches lowercased key for every event', () => {
    for (const [key, value] of Object.entries(EVENTS)) {
      expect(value).toBe(key.toLowerCase());
    }
  });

  it('has exactly the five v1 notify events', () => {
    expect(Object.values(EVENTS).sort()).toEqual(
      ['completed', 'deleted', 'rescheduled', 'uncompleted', 'updated'].sort(),
    );
  });
});

describe('ENTITY_TYPES', () => {
  it('ships task and goal for v1', () => {
    expect(Object.values(ENTITY_TYPES).sort()).toEqual(['goal', 'task']);
  });
});

describe('PRIORITY', () => {
  it('maps each canonical alias to its numeric level', () => {
    expect(PRIORITY_ALIASES.none).toBe(PRIORITY.NONE);
    expect(PRIORITY_ALIASES.low).toBe(PRIORITY.LOW);
    expect(PRIORITY_ALIASES.medium).toBe(PRIORITY.MEDIUM);
    expect(PRIORITY_ALIASES.high).toBe(PRIORITY.HIGH);
  });

  it('uses 0..3 as the level range', () => {
    expect(Object.values(PRIORITY).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('TABS', () => {
  it('includes the glance tab (target of the open action for query no-op)', () => {
    expect(TABS.GLANCE).toBe('glance');
  });

  it('lists the five v1 dayGLANCE tabs', () => {
    expect(Object.values(TABS).sort()).toEqual(
      ['glance', 'goals', 'inbox', 'settings', 'timeline'].sort(),
    );
  });
});

describe('RETURN_VARS', () => {
  it('every value starts with the %dg_ prefix', () => {
    for (const value of Object.values(RETURN_VARS)) {
      expect(value.startsWith('%dg_')).toBe(true);
    }
  });

  it('RETURN_VAR_TYPES has an entry for every RETURN_VARS value', () => {
    const declared = Object.values(RETURN_VARS).sort();
    const typed = Object.keys(RETURN_VAR_TYPES).sort();
    expect(typed).toEqual(declared);
  });

  it('QUERY_RETURN_VARS holds the 10 query-action variables', () => {
    expect(Object.values(QUERY_RETURN_VARS)).toHaveLength(10);
  });

  it('UNIVERSAL_RETURN_VARS holds the 4 inbound-action variables', () => {
    expect(Object.values(UNIVERSAL_RETURN_VARS).sort()).toEqual([
      '%dg_error',
      '%dg_success',
      '%dg_task_id',
      '%dg_warning',
    ]);
  });

  it('RETURN_VARS combines query and universal vars (14 total, no overlap)', () => {
    const query = Object.values(QUERY_RETURN_VARS);
    const universal = Object.values(UNIVERSAL_RETURN_VARS);
    expect(Object.values(RETURN_VARS)).toHaveLength(query.length + universal.length);
    for (const v of query) expect(universal).not.toContain(v);
  });

  it('SUCCESS is typed as boolean', () => {
    expect(RETURN_VAR_TYPES[UNIVERSAL_RETURN_VARS.SUCCESS]).toBe('boolean');
  });
});

describe('ANDROID_ACTIONS', () => {
  it('every action is namespaced under app.dayglance.', () => {
    for (const value of Object.values(ANDROID_ACTIONS)) {
      expect(value.startsWith('app.dayglance.')).toBe(true);
    }
  });
});

describe('SOURCE_APPS', () => {
  it('lists the three v1 GLANCE family members', () => {
    expect(Object.values(SOURCE_APPS).sort()).toEqual([
      'app.dayglance',
      'app.lastglance',
      'app.lifeglance',
    ]);
  });
});

describe('UPDATED_FIELDS', () => {
  it('contains exactly the six locked fields', () => {
    expect([...UPDATED_FIELDS].sort()).toEqual(
      ['notes', 'priority', 'project', 'recurring', 'tags', 'title'].sort(),
    );
  });
});

describe('type exports are usable', () => {
  it('each named type accepts the corresponding constant value', () => {
    const action: Action = ACTIONS.CREATE;
    const event: Event = EVENTS.COMPLETED;
    const entityType: EntityType = ENTITY_TYPES.TASK;
    const priority: PriorityLevel = PRIORITY.HIGH;
    const tab: Tab = TABS.GLANCE;
    const returnVar: ReturnVar = RETURN_VARS.COUNT_TODAY;
    const androidAction: AndroidAction = ANDROID_ACTIONS.NOTIFY;
    const sourceApp: SourceApp = SOURCE_APPS.DAYGLANCE;
    const updatedField: UpdatedField = 'title';

    expect([
      action,
      event,
      entityType,
      priority,
      tab,
      returnVar,
      androidAction,
      sourceApp,
      updatedField,
    ]).toHaveLength(9);
  });
});
