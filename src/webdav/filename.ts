import type { Envelope } from '../schemas/v1/index.js';

// Matches the eventId format: YYYYMMDDTHHMMSSZ-<6..8 hex>.json. The 6..8
// range tolerates a future widening of the random suffix without breaking
// older filenames; current eventId() emits exactly 6.
const FILENAME_RE = /^(\d{8}T\d{6}Z-[a-f0-9]{6,8})\.json$/;

export interface ParsedFilename {
  event_id: string;
  timestamp: string;
}

export function filenameFor(envelope: Envelope): string {
  return `${envelope.event_id}.json`;
}

export function parseFilename(filename: string): ParsedFilename | null {
  // Path separators are the caller's responsibility to strip — operating on
  // a basename here means we don't have to pick between '/' and '\' and
  // don't quietly accept directory-traversal inputs.
  if (filename.includes('/') || filename.includes('\\')) return null;

  const match = FILENAME_RE.exec(filename);
  if (!match) return null;

  const event_id = match[1]!;
  const dashIndex = event_id.indexOf('-');
  const timestamp = event_id.slice(0, dashIndex);
  return { event_id, timestamp };
}
