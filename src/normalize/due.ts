const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_WITH_OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const DATETIME_NO_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export interface NormalizeDueOutput {
  due?: string;
  all_day?: boolean;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Round-trip via UTC to catch e.g. 2026-02-30 → 2026-03-02.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeDue(input: string | undefined, now: Date = new Date()): NormalizeDueOutput {
  if (input === undefined) return {};

  const lower = input.toLowerCase();

  if (lower === 'today') {
    return { due: formatLocalDate(now), all_day: true };
  }

  if (lower === 'tomorrow') {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return { due: formatLocalDate(t), all_day: true };
  }

  const dateMatch = DATE_ONLY_RE.exec(input);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    if (!isValidCalendarDate(Number(y), Number(m), Number(d))) {
      throw new Error(`invalid due: ${input}`);
    }
    return { due: input, all_day: true };
  }

  if (DATETIME_WITH_OFFSET_RE.test(input)) {
    return { due: input, all_day: false };
  }

  // Datetime without offset: pass through unchanged with all_day=false.
  // The normalizer's job is shape, not timezone discipline; consumers'
  // date libraries decide how to interpret the missing offset (typically
  // as local time per ISO 8601).
  if (DATETIME_NO_OFFSET_RE.test(input)) {
    return { due: input, all_day: false };
  }

  throw new Error(`invalid due: ${input}`);
}
