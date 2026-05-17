# Claude Code prompt: update `lastglance-app-spec.md`

## Context

The lastGLANCE spec describes the dayGLANCE integration as being built against the intent protocol directly. With the protocol now being implemented as a shared package (`@glance-apps/intents`), the spec's integration section should reflect that lastGLANCE consumes the package rather than re-implementing protocol logic locally.

This is a minor doc update — most of the spec is unaffected.

## Scope of changes

### 1. Update the "dayGLANCE integration" section

In the "Contract" subsection, add a sentence at the top:

```
lastGLANCE consumes the shared `@glance-apps/intents` package for schema validation, normalization, idempotency key generation, and WebDAV envelope handling. The package is published independently and is the source of truth for the protocol shape; lastGLANCE-side logic is limited to outbound `create` emission, inbound `notify` consumption, standalone-mode detection, and UI.
```

### 2. Update the "Build plan" section

Item #1 (`dayGLANCE integration`) currently describes the work without referencing the package. Update to:

```
1. **dayGLANCE integration** — adopt `@glance-apps/intents` for schemas, normalizers, idempotency keys, and WebDAV envelope helpers. Outbound `create` action emitted to dayGLANCE when user schedules a chore manually or auto-schedule fires; inbound subscription to `notify` events (WebDAV poll on web/iOS/Electron, Android broadcast on Android when applicable) that logs a CompletionEvent with `source="dayglance"` for `event=completed`. Detect dayGLANCE absence and WebDAV absence independently at runtime; hide integration UI accordingly. Per-chore `auto_schedule_to_dayglance` toggle lives in the chore edit form. WebDAV endpoint config lives in app settings, independently configurable from any sync endpoint lastGLANCE may have.
```

### 3. Add a note about `uncompleted` handling

In the "Inbound to lastGLANCE" bullet under the "Contract" subsection, the existing line reads: "Other events (`rescheduled`, `deleted`, `updated`) can be handled later; v1 only needs `completed`."

Update to: "Other events (`uncompleted`, `rescheduled`, `deleted`, `updated`) are accepted by the package's schema but ignored by lastGLANCE in v1. If a user wants to remove a completion that originated from a dayGLANCE un-completion, they delete the CompletionEvent manually in lastGLANCE."

### 4. Cross-reference the package doc

In the "Status" → "Decisions made" subsection, add a bullet:

```
- **Shared `@glance-apps/intents` package for protocol implementation.** Following the `@glance-apps/sync` precedent, lastGLANCE consumes the published package rather than re-implementing protocol logic. Schema decisions and package build plan are in `glance-intents-package.md`.
```

## What to leave alone

- Core thesis, visual concept, data model — unaffected
- Standalone-first decision — unaffected
- All architectural notes
- The "What's NOT in v1" section
- The "What's built" inventory

## Verification

- The "dayGLANCE integration" section makes clear that lastGLANCE depends on `@glance-apps/intents`
- The build plan reflects package adoption
- `uncompleted` handling is explicit (ignored in v1)
- The package doc is cross-referenced

## What to flag in the PR description

- Any place where the original spec's integration framing conflicts with the package-based approach (should be minimal — the spec was written transport-agnostic)
