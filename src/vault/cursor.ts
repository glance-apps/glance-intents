// The GLANCEvault receive cursor is a single integer: the highest intent `seq`
// a receiver has consumed. Listing intents asks the vault for everything with
// seq strictly greater than this value. These helpers only parse and format
// that token. Persisting it — and, critically, keeping the receive cursor
// separate from any send-side bookkeeping — is the app's job, exactly as it is
// for the WebDAV transport's localStorage/settings cursor. The package owns no
// cursor state.

// Parse a stored or incoming cursor token into a seq. `null` / `undefined` /
// `''` mean "no cursor yet" → `null` (list from the beginning). Anything that
// isn't a non-negative integer throws, so a corrupt cursor fails loud rather
// than silently skipping or re-reading the backlog.
export function parseSince(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`invalid intents cursor: ${String(raw)}`);
  }
  return n;
}

// Format a cursor for the list request's `since` parameter. `null` (no cursor
// yet) formats as `'0'`: seq is ≥ 1, so `since=0` returns the full backlog.
export function formatSince(cursor: number | null): string {
  if (cursor === null) return '0';
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new RangeError(`invalid intents cursor: ${String(cursor)}`);
  }
  return String(cursor);
}
