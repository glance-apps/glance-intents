// The task id a receiver gives the task it makes from a `create`, derived so
// that every device (and the sender) arrives at the same id without talking to
// each other. Two devices that each process the same create make one task, the
// sync engine merges them as one row, and the app that sent it can name the
// task before the receiver has even seen the intent (lastGLANCE's
// send-to-dayGLANCE returns it, so an assistant can move the block afterwards).
//
// The id is the seed's SHA-256, its first 16 bytes formatted as a version 4
// UUID (RFC 9562 version and variant bits set). For a create the seed is
// createKey(source_app, source_entity_id, due), with `due` normalized exactly
// as the receiver normalizes it: taskIdFor composes the two.
//
// These ids are already stored in users' data. The output must never change:
// a different id would no longer match the task an earlier delivery made, and
// a re-delivered create would make a second one. The tests pin it.

import { createKey } from './create-key.js';

/** A deterministic UUID-shaped id from any seed string: the same seed, the same id. */
export async function deterministicTaskId(seed: string): Promise<string> {
  const data = new TextEncoder().encode(seed);
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
  hash[6] = (hash[6]! & 0x0f) | 0x40; // version 4
  hash[8] = (hash[8]! & 0x3f) | 0x80; // variant 10xx
  let h = '';
  for (const b of hash.subarray(0, 16)) h += b.toString(16).padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The id of the task a `create` with these provenance fields makes:
 * deterministicTaskId(createKey(source_app, source_entity_id, due)). `due` is
 * the normalized due (normalizeDue), or undefined for an undated create (the
 * receiver's inbox).
 */
export async function taskIdFor(
  source_app: string,
  source_entity_id: string,
  due: string | undefined,
): Promise<string> {
  return deterministicTaskId(await createKey(source_app, source_entity_id, due));
}
