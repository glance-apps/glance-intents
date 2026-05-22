# @glance-apps/intents

Shared intent protocol for the GLANCE family of apps. Implements the protocol specified in [`dayglance-intent-protocol.md`](./docs/dayglance-intent-protocol.md), consumed by dayGLANCE, lastGLANCE, and lifeGLANCE.

The package provides Zod schemas, normalizers, idempotency helpers, and WebDAV envelope helpers — the building blocks. HTTP clients, polling loops, GC cadence, and UI feedback stay app-side.

## Installation

```sh
npm install @glance-apps/intents
# or: pnpm add @glance-apps/intents
# or: yarn add @glance-apps/intents
```

Requires Node 20+ (uses Web Crypto via `globalThis.crypto`). Browser-compatible.

## Usage

### Validate an inbound intent

When a consumer reads an event file off WebDAV (or receives an Android broadcast, or parses a URL), it passes the raw JSON through `parseEnvelope`:

```typescript
import { parseEnvelope } from '@glance-apps/intents';

const raw = JSON.parse(await fetchEventFile(filename));
const envelope = parseEnvelope(raw);

// envelope is now a typed, discriminated-union Envelope.
switch (envelope.action) {
  case 'create':
    // envelope.payload is CreatePayload
    break;
  case 'notify':
    // envelope.payload is NotifyPayload
    break;
  // ...
}
```

`parseEnvelope` throws on validation failure — malformed envelopes are exceptional, not silently filterable.

### Build an outbound intent

When emitting an event (e.g. dayGLANCE emitting a `notify` after a task completion), construct the envelope with `buildEnvelope` and write it to WebDAV using your existing client:

```typescript
import { ACTIONS, EVENTS, buildEnvelope, filenameFor } from '@glance-apps/intents';

const envelope = buildEnvelope({
  action: ACTIONS.NOTIFY,
  emittedBy: 'app.dayglance',
  payload: {
    event_id: 'evt_42',
    source_app: 'app.lastglance',
    source_entity_id: 'chore_42',
    event: EVENTS.COMPLETED,
    task_id: 'tsk_8a91',
    title: 'Replace HVAC filter',
    timestamp: '2026-05-17T14:30:22Z',
    completed_at: '2026-05-17T14:30:22Z',
  },
});

await webdavClient.put(`/GLANCE/events/${filenameFor(envelope)}`, JSON.stringify(envelope));
```

`buildEnvelope` is generic over `action` so the payload is type-checked against the matching schema — passing a `create` action with a notify-shaped payload is a compile error.

`emitted_at` defaults to `new Date()` and `event_id` defaults to a generated `eventId()` (with timestamp aligned to `emitted_at`) — pass them explicitly only for testability or replay.

### Encrypt an outbound intent (optional)

When intents encryption is enabled, pass the consumer's derived `CryptoKey` to `buildEncryptedEnvelope`. The action and full payload are encrypted; only the routing and idempotency fields stay in the plaintext header:

```typescript
import { ACTIONS, EVENTS, buildEncryptedEnvelope, filenameFor } from '@glance-apps/intents';

// key is a CryptoKey derived from the user's sync passphrase —
// key derivation lives in the consumer's existing sync-encryption code.
const encrypted = await buildEncryptedEnvelope(
  {
    action: ACTIONS.NOTIFY,
    emittedBy: 'app.dayglance',
    payload: {
      event_id: 'evt_42',
      source_app: 'app.lastglance',
      source_entity_id: 'chore_42',
      event: EVENTS.COMPLETED,
      task_id: 'tsk_8a91',
      title: 'Replace HVAC filter',
      timestamp: '2026-05-17T14:30:22Z',
    },
  },
  key,
);

await webdavClient.put(`/GLANCE/events/${filenameFor(encrypted)}`, JSON.stringify(encrypted));
```

Only `create` and `notify` actions are encryptable. `query`, `open`, and `complete` carry no user-readable payload and always use the plaintext path.

### Read an event file that may be encrypted

When polling WebDAV, check whether each file is encrypted before deciding which parser to call. Use the typed errors to handle failures gracefully:

```typescript
import {
  NotEncryptedError,
  WrongKeyError,
  MalformedEnvelopeError,
  parseEnvelope,
  parseEncryptedEnvelope,
} from '@glance-apps/intents';

const raw = JSON.parse(await fetchEventFile(filename));

if ((raw as { encrypted?: unknown }).encrypted === true) {
  if (!key) {
    logWarning(filename, 'skipped: no decryption key configured');
    return;
  }
  try {
    const envelope = await parseEncryptedEnvelope(raw, key);
    handleEnvelope(envelope);
  } catch (e) {
    if (e instanceof WrongKeyError) logWarning(filename, 'decryption failed: wrong key');
    else if (e instanceof MalformedEnvelopeError) logWarning(filename, `malformed: ${e.message}`);
    else throw e;
  }
} else {
  const envelope = parseEnvelope(raw);
  handleEnvelope(envelope);
}
```

Plaintext and encrypted envelopes coexist in the same WebDAV directory; the consumer handles both.

### Normalize user input before validation

Schemas validate shape; normalizers turn flexible inputs into canonical forms. The handler typically composes them:

```typescript
import { normalizeDue, normalizePriority, normalizeTags } from '@glance-apps/intents';

normalizePriority('HIGH');                       // → 3
normalizePriority(2);                            // → 2

normalizeDue('tomorrow');                        // → { due: '2026-05-18', all_day: true }
normalizeDue('2026-05-20T14:00:00Z');            // → { due: '2026-05-20T14:00:00Z', all_day: false }

normalizeTags({ title: 'fix sink #home #urgent', tags: 'errands' });
// → { title: 'fix sink', tags: ['home', 'urgent', 'errands'] }
```

`normalizeRecurring` expands the shorthand strings (`daily`, `weekdays`, `weekly`, `monthly`, `yearly`) to canonical RRULEs and passes full RRULE strings through unchanged.

### Generate idempotency keys

At-least-once delivery is the norm across every transport. Two helpers cover the dedup concerns:

```typescript
import { createKey, eventId } from '@glance-apps/intents';

// Emitter uses eventId() to stamp each outbound event.
const id = eventId();                     // → '20260517T143022Z-7f3a9c'

// Receiver uses createKey() to recognize that an inbound create matches
// an existing task (same source_app + source_entity_id + due → same key).
const key = await createKey('app.lastglance', 'chore_42', '2026-05-20');
// → '<64 hex chars, SHA-256>'
```

`createKey` is async (Web Crypto); `eventId` is sync. Inputs to `createKey` are expected to be already-normalized — the handler composes `normalizeDue` → `createKey`.

## Public API

Organized by module. Every named export is intentional and governed by semver.

### Constants

`SCHEMA_VERSION`, `ACTIONS`, `EVENTS`, `ENTITY_TYPES`, `PRIORITY`, `PRIORITY_ALIASES`, `TABS`, `QUERY_RETURN_VARS`, `UNIVERSAL_RETURN_VARS`, `RETURN_VARS`, `RETURN_VAR_TYPES`, `ANDROID_ACTIONS`, `SOURCE_APPS`, `UPDATED_FIELDS`. Each ships with a matching narrow-literal type (`Action`, `Event`, `EntityType`, `PriorityLevel`, `Tab`, `QueryReturnVar`, `UniversalReturnVar`, `ReturnVar`, `AndroidAction`, `SourceApp`, `UpdatedField`).

### Schemas

Flat: `CreateSchema`, `CompleteSchema`, `OpenSchema`, `QuerySchema`, `NotifySchema`, `EnvelopeSchema`, `EncryptedEnvelopeSchema`, plus inferred types `CreatePayload`, `CompletePayload`, `OpenPayload`, `QueryPayload`, `NotifyPayload`, `Envelope`, `EncryptedEnvelope`.

Versioned: `schemas.v1.*` for the same surface, so consumers that explicitly pin a protocol version can do so without breaking when v2 lands alongside.

### Normalizers

`normalizePriority`, `normalizeRecurring`, `normalizeTags`, `normalizeDue`. Types: `NormalizeTagsInput`, `NormalizeTagsOutput`, `NormalizeDueOutput`.

### Idempotency

`eventId(now?)`, `createKey(source_app, source_entity_id, due)`.

### Crypto helpers

`encryptAesGcm(plaintext, key)`, `decryptAesGcm(ciphertext, iv, key)`. Both async, operating on `CryptoKey` (Web Crypto API). Per-call random 12-byte IV; no IV reuse.

Error classes (all extend `Error`): `NoKeyError`, `WrongKeyError`, `NotEncryptedError`, `MalformedEnvelopeError`.

### WebDAV envelope helpers

Plaintext: `buildEnvelope`, `parseEnvelope`, `filenameFor`, `parseFilename`. Types: `ActionPayloadMap`, `BuildEnvelopeArgs`, `ParsedFilename`.

Encrypted: `buildEncryptedEnvelope(args, key)`, `parseEncryptedEnvelope(raw, key)`. Both async. `buildEncryptedEnvelope` is generic over `EncryptableAction` (`'create' | 'notify'`). Types: `EncryptableAction`, `BuildEncryptedEnvelopeArgs`.

## Versioning

The package version tracks the protocol's `schema_version` directly:

- `1.x.y` → protocol v1
- `2.0.0` → protocol v2 (breaking, coordinated multi-app upgrade)

Within v1, additive minor bumps are non-breaking; consumers can upgrade freely. When v2 ships, `src/schemas/v2/*` lives alongside `src/schemas/v1/*` so consumers can validate against both.

Full versioning policy (what counts as breaking, minor, patch) is documented in [`dayglance-intent-protocol.md`](./docs/dayglance-intent-protocol.md) under "Versioning."

## Notes for consumers

- **`NotifySchema` validates shape only.** Event-conditional rules from the spec — `previous_due` present when `event === 'rescheduled'`, `completed_at == timestamp` when `event === 'completed'` — are enforced by the emitter, not by the schema. If you need to enforce them at receive time, do a second-pass check on your end.
- **Normalize before validating in some flows.** The schema accepts ISO date strings as `due`; `normalizeDue` accepts `today`/`tomorrow`/`undefined` and produces ISO strings. Call the normalizer first, then validate.
- **`createKey` assumes normalized inputs.** The handler is expected to call `normalizeDue` before `createKey` so relative inputs like `"today"` and the literal date they resolve to produce the same key.
- **`schemas.v1.*` is the stable namespace for protocol v1.** Use the namespaced form if you want to be explicit about which version you validate against; use the flat form for convenience.
- **Encryption is per-app, per-user, opt-in.** Plaintext and encrypted envelopes coexist in the same WebDAV directory. Consumers without a key skip encrypted events; they don't hard-fail.
- **The package does not derive keys.** `buildEncryptedEnvelope` and `parseEncryptedEnvelope` accept a `CryptoKey` you derive from the user's passphrase using your existing sync-encryption code. Only `create` and `notify` are encryptable; the other three actions always use the plaintext path.
- **Runtime dependency: `zod`.** Kept as a single external import; tsup does not bundle it. Consumers can use their own zod version (any `^4`).

## License

MIT — see [LICENSE](./LICENSE).
