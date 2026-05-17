// Generates an event ID of the form `YYYYMMDDTHHMMSSZ-XXXXXX` where the
// suffix is 6 hex chars (3 random bytes). The compact UTC timestamp prefix
// sorts lexically by time, which matters for consumers that order events by
// event_id directly. The random suffix is sized for at-least-once delivery
// at the expected single-digit events/second/device peak; collision risk
// inside any one second is ~1 in 16 million.

function compactIsoUtc(d: Date): string {
  // toISOString always emits UTC with `Z` suffix and fractional seconds.
  // Strip separators and the fractional portion: 2026-05-17T14:30:22.123Z
  // → 20260517T143022Z.
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

export function eventId(now: Date = new Date()): string {
  return `${compactIsoUtc(now)}-${randomHex(3)}`;
}
