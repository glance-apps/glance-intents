# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet. Future changes land here._

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
