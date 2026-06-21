# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet. Future changes land here._

## [1.4.0] - 2026-06-21

Adds GLANCEvault row codec helpers — the building blocks for a database-backed intents transport — alongside the existing WebDAV envelope helpers. Codec only: envelope-to-row encode/decode and since-cursor parsing, no HTTP/cursor/poller. The transport itself (HTTP, receive-cursor management, polling) stays app-owned, exactly like the WebDAV transport. WebDAV remains fully intact and the default; the vault helpers are additive and opt-in by import. The wire format matches the GLANCEvault `intents` endpoints: camelCase fields and an opaque base64-string envelope.

### Added

- **`vault/`** — `buildIntentRow(envelope, ttl)`: takes a structured plaintext or encrypted envelope and encodes the insert-only row a client POSTs to `POST /intents/batch` — `{ eventId, envelope, expiresAt }` with `envelope` as a base64 string (UTF-8 JSON of the envelope, opaque to the server). The envelope's `event_id` is lifted to the top-level `eventId` (the server's idempotency key, read from the row, not from inside the opaque envelope), so re-POSTing is a harmless no-op. TTL is explicit (`{ ttlMs }`, computed from the envelope's `emitted_at` for a byte-identical idempotent re-send, or `{ expiresAt }`). The outbound row carries no `seq` (server-assigned, inbound-only) and no `accountId` (a top-level field of the batch body, not the row), so sending is structurally incapable of advancing a receive cursor.
- **`vault/`** — `parseIntentRow(raw)`: validates a row returned from `GET /intents/list` — `{ eventId, envelope, seq, expiresAt, serverMtime }`, camelCase, no `account_id`, `envelope` a base64 string — and decodes the base64 envelope back into the structured object. Exposes the server-assigned `seq` a receiver advances its cursor over. The decoded `envelope` is returned opaque; route it to `parseEnvelope` or `parseEncryptedEnvelope` based on its `encrypted` flag, exactly as the WebDAV read path does.
- **`vault/`** — `isExpired(row, now?)`: pure TTL check against `expiresAt`, for skipping a row that is past its window but not yet swept by the server's prune.
- **`vault/`** — `parseSince(raw)` / `formatSince(cursor)`: parse and format the integer `since` cursor used on the list request (default `0` = full backlog). Cursor persistence and advancement remain app-owned (the package holds no cursor state).
- **`vault/`** — exported Zod schemas `OutboundIntentRowSchema`, `IntentEventRowSchema` (both validate the camelCase base64-string wire shape), and types `IntentEnvelope`, `OutboundIntentRow`, `IntentEventRow`, `IntentRowTtl`.

## [1.3.3] - 2026-06-07

### Fixed

- **`schemas/v1/create`** — `CreateSchema` now accepts the optional `entity_type` string field (already present on `NotifySchema`). The `.strict()` constraint was rejecting any create envelope that included `entity_type`, throwing `MalformedEnvelopeError`. dayGLANCE uses this field to distinguish `goal` vs `task` intents on creation.

## [1.3.2] - 2026-06-03

### Added

- **`schemas/v1/`** — `NotifySchema` now accepts an optional `completed_by_user_id` field (`string`). Carries the sync ID of the user who completed the task, enabling receiving apps to attribute the completion. Defined alongside `completed_at`.

## [1.3.1] - 2026-06-03

### Added

- **`schemas/v1/`** — `CreateSchema` now accepts an optional `assigned_user_ids` field (`string[]`). Carries the list of user IDs a chore/task is assigned to, enabling cross-app multi-user filtering. Passes strict validation unchanged.

## [1.3.0] - 2026-05-25

Adds HKDF-per-envelope key derivation helpers (Phase 2.7). Consumers no longer need the cloud sync passphrase in memory at emit/poll time — only the cached intents root key, derived once at setup, is required. The `buildEncryptedEnvelope` / `parseEncryptedEnvelope` API shape is unchanged; what changes is the consumer-side implementation of the `deriveKey` callback.

### Added

- **`crypto/`** — `deriveIntentsRootKey(passphrase, sharedRootSalt)`: derives the intents root key from the cloud sync passphrase and a shared WebDAV-stored salt (PBKDF2-SHA-256, 310,000 iterations, 256-bit output imported as a non-extractable HKDF `CryptoKey` with `usages: ['deriveKey']`). Called once at intents-encryption setup; result is safe to cache in IndexedDB.
- **`crypto/`** — `deriveEnvelopeKey(rootKey, envelopeSalt)`: derives a per-envelope AES-256-GCM key (HKDF-SHA-256 with fixed info string `"glance-intents-envelope-v1"`) from the cached intents root key and the per-envelope salt. Returns a non-extractable `CryptoKey` with `usages: ['encrypt', 'decrypt']`. Use this inside the `deriveKey` callback passed to `buildEncryptedEnvelope` and `parseEncryptedEnvelope`:
  ```ts
  const deriveKey = (salt: Uint8Array) => deriveEnvelopeKey(cachedRootKey, salt);
  ```

### Notes

- The `buildEncryptedEnvelope` and `parseEncryptedEnvelope` signatures are unchanged. The `deriveKey: (salt: Uint8Array) => Promise<CryptoKey>` callback is the same; only the consumer's implementation changes (HKDF against cached root key instead of PBKDF2 against passphrase).
- **Phase 2.7 migration:** consumers should replace the Phase 2.6 `sync.deriveKeyForSalt` callback with a closure over the cached intents root key using `deriveEnvelopeKey`. The cloud sync passphrase is only needed at intents-encryption setup to call `deriveIntentsRootKey`; it is not needed at emit or poll time.
- `@glance-apps/sync`'s `deriveKeyForSalt` export (from `1.1.0`) is no longer used by the intents encrypted path in Phase 2.7, but remains valid for any other consumer.
- Phase 2.6 encrypted envelopes (derived via `sync.deriveKeyForSalt` / PBKDF2-per-envelope) cannot be decrypted by Phase 2.7 consumers. Wipe the shared WebDAV intents directory before Phase 2.7 testing. No production data is affected — encrypted intents were never successfully shipped end-to-end.
- HKDF is universally available on all target platforms (Chrome 67+, Safari 11.1+, Firefox 57+, Android WebView, Electron, iOS WKWebView). No polyfill needed.
- Pre-work Q1 finding: HKDF and AES-GCM are separate Web Crypto algorithm types — a single `CryptoKey` cannot carry both `deriveKey` and `encrypt/decrypt` usages. The intents root key is HKDF-typed (usages: `['deriveKey']`); per-envelope keys are AES-GCM-typed (usages: `['encrypt', 'decrypt']`). A non-extractable HKDF `CryptoKey` is fully usable as IKM in `crypto.subtle.deriveKey()`; `extractable: false` only blocks `exportKey`.

## [1.2.0] - 2026-05-25

Fixes cross-app encrypted intent delivery (Phase 2.6). Encrypted envelopes now carry a per-envelope random salt, mirroring `@glance-apps/sync`'s per-file salt pattern. Two apps sharing the same passphrase now successfully decrypt each other's events. Requires `@glance-apps/sync@1.1.0` or later on the consumer side.

### Changed

- **`webdav/`** — `buildEncryptedEnvelope` and `parseEncryptedEnvelope` signatures changed from `(…, key: CryptoKey)` to `(…, deriveKey: (salt: Uint8Array<ArrayBuffer>) => Promise<CryptoKey>)`. The emitter generates a fresh random 16-byte salt per envelope and calls `deriveKey(salt)` to obtain the key; the consumer extracts the salt from the envelope and calls `deriveKey(salt)` to obtain the matching key. Consumers pass `sync.deriveKeyForSalt` as the callback.

### Added

- **`schemas/v1/`** — `EncryptedEnvelopeSchema` now requires a `salt` field (`encrypted: true` envelopes without it, or with a malformed value, fail with `MalformedEnvelopeError`). The `salt` field is base64-encoded and must decode to exactly 16 bytes.

### Notes

- `1.1.0` encrypted envelopes (no `salt` field) fail `MalformedEnvelopeError` under the new schema. No production data is affected — cross-app encrypted envelopes never worked under `1.1.0` and no user had a functioning two-app setup using the encrypted path.
- Plaintext envelopes, `buildEnvelope`, and `parseEnvelope` are unchanged.
- `getSessionKey()` in `@glance-apps/sync` is no longer used on the encrypted intents path; `deriveKeyForSalt` (new in `@glance-apps/sync@1.1.0`) replaces it for this use case.

## [1.1.0] - 2026-05-22

Adds optional AES-GCM envelope encryption for `create` and `notify` actions (Phase 2.5). Non-breaking: plaintext envelopes remain valid and all existing APIs are unchanged.

### Added

- **`crypto/`** — AES-GCM encrypt/decrypt primitives (`encryptAesGcm`, `decryptAesGcm`). Operate on `CryptoKey` objects (Web Crypto API); key derivation is the consumer's responsibility. Four typed error classes exported: `NoKeyError`, `WrongKeyError`, `NotEncryptedError`, `MalformedEnvelopeError`.
- **`schemas/v1/`** — `EncryptedEnvelopeSchema` and `EncryptedEnvelope` type. The encrypted envelope retains `schema_version`, `event_id`, `emitted_at`, `emitted_by`, `encrypted: true`, `iv` (base64), `payload_ciphertext` (base64), and optionally `source_app`, `source_entity_id`, `due` (hoisted from the payload for filtering and idempotency without bulk decryption). The `action` and full payload live in the ciphertext only.
- **`webdav/`** — `buildEncryptedEnvelope(args, key)` and `parseEncryptedEnvelope(raw, key)`. Only `create` and `notify` actions are encryptable (`EncryptableAction` type exported). `buildEncryptedEnvelope` encrypts the full `{ action, payload }` and hoists `source_app`, `source_entity_id`, and `due` to the plaintext header. `parseEncryptedEnvelope` decrypts and validates through `EnvelopeSchema`, returning a typed `Envelope` on success; throws typed errors on failure.

### Notes

- Per-event random IV (12 bytes / 96-bit); no IV reuse.
- Consumers without a key skip encrypted events by catching `WrongKeyError` or checking for `encrypted: true` before calling `parseEncryptedEnvelope`.
- Plaintext and encrypted envelopes coexist in the same WebDAV directory.

## [1.0.1] - 2026-05-17

1.0.0 was published with a build pipeline gap — the tarball did not include compiled output. 1.0.1 is the first usable release; its content matches the intended scope of 1.0.0. A `prepublishOnly` script now guards against recurrence.

Initial public release. Implements protocol `schema_version` 1 with full schema validation, normalization, idempotency helpers, and WebDAV envelope utilities. See `dayglance-intent-protocol.md` for the protocol spec this package implements.

### Added

- **`constants/`** — canonical wire-format constants: `SCHEMA_VERSION`, `ACTIONS`, `EVENTS`, `ENTITY_TYPES`, `PRIORITY` + `PRIORITY_ALIASES`, `TABS`, `QUERY_RETURN_VARS` (10) + `UNIVERSAL_RETURN_VARS` (4) + combined `RETURN_VARS` + `RETURN_VAR_TYPES`, `ANDROID_ACTIONS`, `SOURCE_APPS`, `UPDATED_FIELDS`. Each ships with a matching narrow-literal type (`Action`, `Event`, `EntityType`, `PriorityLevel`, `Tab`, `QueryReturnVar`, `UniversalReturnVar`, `ReturnVar`, `AndroidAction`, `SourceApp`, `UpdatedField`).
- **`schemas/v1/`** — Zod schemas for the five protocol actions (`CreateSchema`, `CompleteSchema`, `OpenSchema`, `QuerySchema`, `NotifySchema`) and the WebDAV file envelope (`EnvelopeSchema`, a discriminated union on `action` that validates the payload against the matching action schema). Inferred TypeScript types (`CreatePayload`, `CompletePayload`, `OpenPayload`, `QueryPayload`, `NotifyPayload`, `Envelope`) exported alongside each schema. Versioned namespace re-export at `schemas.v1.*` so v2 can coexist alongside v1 when the protocol bumps.
- **`normalize/`** — four pure normalizers: `normalizePriority` (int|string → canonical `PriorityLevel`), `normalizeRecurring` (shorthand or full RRULE → canonical RRULE), `normalizeTags` (extracts inline `#tags` from title, merges with `tags` field, dedupes, lowercases), `normalizeDue` (date-only/datetime/`today`/`tomorrow` → canonical ISO string with implied `all_day`). `normalizeDue` accepts an injected `now` for deterministic relative-day testing.
- **`idempotency/`** — `eventId(now?)` returns a lexically-sortable `YYYYMMDDTHHMMSSZ-xxxxxx` string for use as the unique identifier on a `notify` event; `createKey(source_app, source_entity_id, due)` returns a `Promise<string>` SHA-256 hex digest used by the `create` handler to recognize that an incoming payload matches an existing task. Web Crypto throughout.
- **`webdav/`** — `buildEnvelope({ action, payload, emittedBy, emittedAt?, eventId? })` constructs and validates the WebDAV file envelope with type-safe coupling between `action` and `payload` (passing a mismatched pair is a TypeScript error). `parseEnvelope(raw)` validates an unknown input against the v1 envelope schema and returns a typed `Envelope`. `filenameFor(envelope)` returns the `<event_id>.json` filename for storage; `parseFilename(name)` parses that format back into `{ event_id, timestamp }` or returns `null` on mismatch. No HTTP, no I/O, no polling — those stay app-side.
- **Build pipeline:** TypeScript strict (ES2022, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`), tsup dual ESM/CJS + `.d.ts`/`.d.cts` output (zod kept external), Vitest with `@vitest/coverage-v8`, ESLint flat config + Prettier, GitHub Actions CI running install/lint/typecheck/test/build on push and PR.
- **README:** installation, four usage examples (validate inbound, build outbound, normalize input, generate idempotency keys), enumerated public API, versioning policy, consumer notes.

### Notes

- Single runtime dependency: `zod ^4`. Kept as a single external import; tsup does not bundle it.
- Requires Node 20+ (uses Web Crypto via `globalThis.crypto`); browser-compatible.
- 248 tests, 100% line/branch/function/statement coverage across every file in `src/`.
