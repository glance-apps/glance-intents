// Shorthand → RRULE expansion lives here, not in src/constants/, because it's
// normalization logic (a transformation) rather than a wire-format constant.
const SHORTHAND_TO_RRULE: Record<string, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

export function normalizeRecurring(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;

  const lower = input.toLowerCase();
  const expansion = SHORTHAND_TO_RRULE[lower];
  if (expansion !== undefined) return expansion;

  // Full RRULE — case-sensitive per RFC 5545. Beyond the prefix check we
  // don't validate syntax; that requires a real RRULE parser which is a
  // consumer-side concern.
  if (input.startsWith('FREQ=')) return input;

  throw new Error(`invalid recurring: ${input}`);
}
