import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  normalizeDue,
  normalizePriority,
  normalizeRecurring,
  normalizeTags,
  type NormalizeDueOutput,
  type NormalizeTagsOutput,
} from '../normalize/index.js';

describe('normalizePriority', () => {
  it.each([0, 1, 2, 3] as const)('passes through valid integer %i', (n) => {
    expect(normalizePriority(n)).toBe(n);
  });

  it('returns undefined for undefined input', () => {
    expect(normalizePriority(undefined)).toBeUndefined();
  });

  it.each([
    ['none', 0],
    ['low', 1],
    ['medium', 2],
    ['high', 3],
  ] as const)('maps lowercase alias "%s" to %i', (s, n) => {
    expect(normalizePriority(s)).toBe(n);
  });

  it.each([
    ['NONE', 0],
    ['LOW', 1],
    ['MEDIUM', 2],
    ['HIGH', 3],
  ] as const)('maps uppercase alias "%s" to %i', (s, n) => {
    expect(normalizePriority(s)).toBe(n);
  });

  it.each([
    ['None', 0],
    ['Low', 1],
    ['Medium', 2],
    ['High', 3],
  ] as const)('maps mixed-case alias "%s" to %i', (s, n) => {
    expect(normalizePriority(s)).toBe(n);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['3', 3],
  ] as const)('parses stringified integer "%s" → %i', (s, n) => {
    expect(normalizePriority(s)).toBe(n);
  });

  it.each([4, -1, 1.5, 100])('throws on out-of-range/non-integer number %s', (n) => {
    expect(() => normalizePriority(n)).toThrow(/invalid priority/);
  });

  it.each(['urgent', 'normal', 'highest', '', '4', 'med'])(
    'throws on unrecognized string "%s"',
    (s) => {
      expect(() => normalizePriority(s)).toThrow(/invalid priority/);
    },
  );

  it('return type narrows to PriorityLevel | undefined', () => {
    const result = normalizePriority('high');
    expectTypeOf(result).toEqualTypeOf<0 | 1 | 2 | 3 | undefined>();
  });
});

describe('normalizeRecurring', () => {
  it.each([
    ['daily', 'FREQ=DAILY'],
    ['weekdays', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
    ['weekly', 'FREQ=WEEKLY'],
    ['monthly', 'FREQ=MONTHLY'],
    ['yearly', 'FREQ=YEARLY'],
  ])('expands shorthand "%s" to RRULE', (input, expected) => {
    expect(normalizeRecurring(input)).toBe(expected);
  });

  it.each(['DAILY', 'WeekDays', 'Weekly', 'MONTHLY', 'Yearly'])(
    'expands shorthand case-insensitively: "%s"',
    (input) => {
      expect(normalizeRecurring(input)).toMatch(/^FREQ=/);
    },
  );

  it('passes through a full RRULE unchanged', () => {
    const rrule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR';
    expect(normalizeRecurring(rrule)).toBe(rrule);
  });

  it('does not validate RRULE syntax beyond the FREQ= prefix', () => {
    // Garbage after FREQ= passes through; the consumer's RRULE library
    // will reject it at use time.
    expect(normalizeRecurring('FREQ=GARBAGE;NONSENSE')).toBe('FREQ=GARBAGE;NONSENSE');
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeRecurring(undefined)).toBeUndefined();
  });

  it.each(['every other day', 'FREQDAILY', '', 'never', 'freq=DAILY'])(
    'throws on unrecognized input "%s"',
    (input) => {
      expect(() => normalizeRecurring(input)).toThrow(/invalid recurring/);
    },
  );
});

describe('normalizeTags', () => {
  it('returns empty defaults when both inputs are undefined', () => {
    expect(normalizeTags({})).toEqual({ title: '', tags: [] });
  });

  it('extracts inline #tags from title only', () => {
    expect(normalizeTags({ title: 'fix sink #home #urgent' })).toEqual({
      title: 'fix sink',
      tags: ['home', 'urgent'],
    });
  });

  it('parses tags field only', () => {
    expect(normalizeTags({ tags: 'home, deep-work' })).toEqual({
      title: '',
      tags: ['home', 'deep-work'],
    });
  });

  it('merges inline and explicit tags', () => {
    expect(normalizeTags({ title: 'fix sink #home', tags: 'urgent, errands' })).toEqual({
      title: 'fix sink',
      tags: ['home', 'urgent', 'errands'],
    });
  });

  it('dedupes when inline tag also appears in tags field', () => {
    expect(normalizeTags({ title: 'fix sink #home', tags: 'home, urgent' })).toEqual({
      title: 'fix sink',
      tags: ['home', 'urgent'],
    });
  });

  it('lowercases case-mismatched duplicates into one tag', () => {
    expect(normalizeTags({ title: 'do #Home', tags: 'home' })).toEqual({
      title: 'do',
      tags: ['home'],
    });
  });

  it('strips leading # from explicit tags', () => {
    expect(normalizeTags({ tags: '#home, #work, errands' })).toEqual({
      title: '',
      tags: ['home', 'work', 'errands'],
    });
  });

  it('returns empty array for empty tags field', () => {
    expect(normalizeTags({ title: 'plain', tags: '' })).toEqual({ title: 'plain', tags: [] });
  });

  it('treats whitespace-only entries in tags field as empty', () => {
    expect(normalizeTags({ tags: 'home, , work, ' })).toEqual({
      title: '',
      tags: ['home', 'work'],
    });
  });

  it('does NOT extract tags from URL fragments (no whitespace before #)', () => {
    expect(normalizeTags({ title: 'see https://example.com/#anchor' })).toEqual({
      title: 'see https://example.com/#anchor',
      tags: [],
    });
  });

  it('collapses double spaces left by tag removal', () => {
    expect(normalizeTags({ title: 'fix #home the sink' })).toEqual({
      title: 'fix the sink',
      tags: ['home'],
    });
  });

  it('trims trailing whitespace after tag at end of title', () => {
    expect(normalizeTags({ title: 'fix the sink #home' })).toEqual({
      title: 'fix the sink',
      tags: ['home'],
    });
  });

  it('strips tag at start of title', () => {
    expect(normalizeTags({ title: '#home fix the sink' })).toEqual({
      title: 'fix the sink',
      tags: ['home'],
    });
  });

  it('only extracts whitespace-bounded #tags: "#a #b#c" → tags [a, b], title "#c"', () => {
    // The regex requires whitespace (or start) before #, so #c with no space
    // before it is left in the title.
    expect(normalizeTags({ title: '#a #b#c' })).toEqual({
      title: '#c',
      tags: ['a', 'b'],
    });
  });

  it('accepts hyphens, underscores, and digits in tag names', () => {
    expect(normalizeTags({ title: 'wip #deep-work #proj_42 #v1' })).toEqual({
      title: 'wip',
      tags: ['deep-work', 'proj_42', 'v1'],
    });
  });

  it('skips a bare # in the title', () => {
    expect(normalizeTags({ title: 'price # 5' })).toEqual({
      title: 'price # 5',
      tags: [],
    });
  });

  it('output title is always a string when title is undefined', () => {
    expect(normalizeTags({ tags: 'x' }).title).toBe('');
  });

  it('return type is NormalizeTagsOutput', () => {
    const result: NormalizeTagsOutput = normalizeTags({ title: 'x' });
    expectTypeOf(result.tags).toEqualTypeOf<string[]>();
    expectTypeOf(result.title).toEqualTypeOf<string>();
  });
});

describe('normalizeDue', () => {
  // Fixed local-timezone now: May 15, 2026 at noon local. Local-time getters
  // always return 2026-05-15 regardless of test runner's timezone.
  const NOON_LOCAL = new Date(2026, 4, 15, 12, 0, 0);

  it('returns {} for undefined input', () => {
    expect(normalizeDue(undefined)).toEqual({});
  });

  it('treats date-only string as all-day', () => {
    expect(normalizeDue('2026-05-20')).toEqual({ due: '2026-05-20', all_day: true });
  });

  it('treats datetime with Z offset as timed (not all-day)', () => {
    expect(normalizeDue('2026-05-20T14:00:00Z')).toEqual({
      due: '2026-05-20T14:00:00Z',
      all_day: false,
    });
  });

  it('treats datetime with numeric offset as timed', () => {
    expect(normalizeDue('2026-05-20T14:00:00+05:00')).toEqual({
      due: '2026-05-20T14:00:00+05:00',
      all_day: false,
    });
  });

  it('treats datetime with negative offset as timed', () => {
    expect(normalizeDue('2026-05-20T14:00:00-08:00')).toEqual({
      due: '2026-05-20T14:00:00-08:00',
      all_day: false,
    });
  });

  it('passes through datetime without offset (treated as local; see PR description)', () => {
    expect(normalizeDue('2026-05-20T14:00:00')).toEqual({
      due: '2026-05-20T14:00:00',
      all_day: false,
    });
  });

  it('accepts datetime with fractional seconds', () => {
    expect(normalizeDue('2026-05-20T14:00:00.123Z')).toEqual({
      due: '2026-05-20T14:00:00.123Z',
      all_day: false,
    });
  });

  it.each(['today', 'TODAY', 'Today'])(
    'maps "%s" (case-insensitive) to the local date of `now`',
    (input) => {
      expect(normalizeDue(input, NOON_LOCAL)).toEqual({ due: '2026-05-15', all_day: true });
    },
  );

  it.each(['tomorrow', 'TOMORROW', 'Tomorrow'])(
    'maps "%s" (case-insensitive) to the next local calendar day',
    (input) => {
      expect(normalizeDue(input, NOON_LOCAL)).toEqual({ due: '2026-05-16', all_day: true });
    },
  );

  it('rolls over month boundary for "tomorrow"', () => {
    const may31 = new Date(2026, 4, 31, 12, 0, 0);
    expect(normalizeDue('tomorrow', may31)).toEqual({ due: '2026-06-01', all_day: true });
  });

  it('rolls over year boundary for "tomorrow"', () => {
    const dec31 = new Date(2026, 11, 31, 12, 0, 0);
    expect(normalizeDue('tomorrow', dec31)).toEqual({ due: '2027-01-01', all_day: true });
  });

  it('uses now=new Date() when omitted (smoke check; format only)', () => {
    const result = normalizeDue('today');
    expect(result.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.all_day).toBe(true);
  });

  it.each([
    'yesterday',
    'next week',
    '',
    'soon',
    '2026/05/20',
    '5/20/2026',
    '2026-05-20 14:00:00',
  ])('throws on unrecognized input "%s"', (input) => {
    expect(() => normalizeDue(input)).toThrow(/invalid due/);
  });

  it.each(['2026-13-01', '2026-02-30', '2026-00-15', '2026-05-32'])(
    'throws on impossible calendar date "%s"',
    (input) => {
      expect(() => normalizeDue(input)).toThrow(/invalid due/);
    },
  );

  it('return type is NormalizeDueOutput', () => {
    const result: NormalizeDueOutput = normalizeDue('2026-05-20');
    expectTypeOf(result.due).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.all_day).toEqualTypeOf<boolean | undefined>();
  });
});
