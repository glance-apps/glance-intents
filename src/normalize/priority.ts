import { PRIORITY_ALIASES, type PriorityLevel } from '../constants/index.js';

const STRINGIFIED_INTS: Record<string, PriorityLevel> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
};

export function normalizePriority(
  input: number | string | undefined,
): PriorityLevel | undefined {
  if (input === undefined) return undefined;

  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0 || input > 3) {
      throw new Error(`invalid priority: ${input}`);
    }
    return input as PriorityLevel;
  }

  const lower = input.toLowerCase();
  const stringifiedInt = STRINGIFIED_INTS[lower];
  if (stringifiedInt !== undefined) return stringifiedInt;

  const alias = PRIORITY_ALIASES[lower];
  if (alias !== undefined) return alias;

  throw new Error(`invalid priority: ${input}`);
}
