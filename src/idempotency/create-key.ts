// Derives a deterministic SHA-256 key from a `create` payload's provenance
// fields. The handler uses this to recognize that an incoming `create`
// matches an existing task and should update rather than duplicate.
//
// Inputs are assumed to be already-normalized — the caller composes
// normalizeDue() before calling createKey() so that relative inputs like
// "today" and the literal date they resolve to produce the same key.
//
// Pipe (`|`) is the separator because it can't appear in a normalized
// reverse-DNS source_app or in an ISO date/datetime. If a consumer
// somehow passes a pipe inside source_entity_id, the key still uniquely
// identifies *that* (source_app, source_entity_id, due) tuple — the
// concern is only that two different tuples might collide, which the
// separator's absence from the other field shapes prevents.

export async function createKey(
  source_app: string,
  source_entity_id: string,
  due: string | undefined,
): Promise<string> {
  const input = `${source_app}|${source_entity_id}|${due ?? ''}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}
