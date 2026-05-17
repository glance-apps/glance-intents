# Claude Code prompt: update `glance-family-roadmap.md`

## Context

The family roadmap describes the GLANCE-family intent protocol implementation as gated on the Google Play production review clearing. That gate has been removed: intent protocol work is starting now. Additionally, the protocol is being implemented via a new shared package, `@glance-apps/intents`, mirroring the `@glance-apps/sync` pattern. Update the roadmap to reflect these changes.

This is a documentation-only edit. No code changes.

## Scope of changes

### 1. Update the current-state section

The "Current state (May 2026)" section's bullet on the intent protocol currently reads: "Ready for implementation on the dayGLANCE side (but focusing on iOS/macOS launch first)."

Replace with: "In active implementation. The protocol is being implemented via a new shared package, `@glance-apps/intents`, mirroring the `@glance-apps/sync` extraction pattern. Schema decisions are locked (see `glance-intents-package.md`). Phase 1 (package scaffolding and publication) is the active work."

### 2. Update the "Driving constraints" section

The current text describes Google Play production review as a near-term forcing function that limits dayGLANCE core changes. This is no longer the operative rule for intent protocol work.

Update the section to reflect:
- The Google Play review remains in progress, but intent protocol work is proceeding in parallel — not gated on the review clearing
- The original "external and additive only" rule remains good practice during the review window for unrelated work, but doesn't block protocol implementation
- Apple Developer enrollment is cleared and macOS app is shipped (this is already accurate, no change)

The rewrite shouldn't be defensive about the decision — just describe the current operating state. The roadmap is a working doc; updating it as decisions change is the normal mode.

### 3. Update the "Sequencing" section

The current "Right now: Google Play production application review and iOS development" subsection and "After Google Play production application clears" subsection assume the intent protocol is gated on the review.

Restructure as follows:

**"Right now" subsection:** intent protocol Phase 1 (package scaffolding and publication) and Phase 2 (dayGLANCE consumption) are the active work. List the critical-path PR sequence summarized from `glance-intents-package.md` — high level only, not exhaustive. Note that TRMNL X work and Obsidian companion work continue in parallel as before.

**Remove the "After Google Play production application clears" subsection** entirely. The "invasive dayGLANCE work that was too risky during testing" framing no longer applies — protocol implementation is proceeding now.

**"Parallel tracks" subsection:** the lastGLANCE section needs updating. The "dayGLANCE integration" sub-item should now reference the shared package: "dayGLANCE integration via the intent protocol over WebDAV, consuming `@glance-apps/intents`. Manual mode (`do this today`) first, then auto-schedule on cadence threshold, then completion loopback." Otherwise lastGLANCE's sequencing is accurate.

**"Parallel tracks" subsection:** the lifeGLANCE section is accurate as written.

### 4. Update the "Architectural decisions recorded here" section

Add a new bullet:

```
- **Shared protocol surfaces become packages.** Following the `@glance-apps/sync` precedent, the intent protocol is implemented as `@glance-apps/intents`, a shared package consumed by each GLANCE app that participates in cross-app coordination. Schema, normalizers, and envelope helpers live in the package; handlers, polling loops, and UI live in each app. Future shared surfaces (e.g., a hypothetical encryption helper, a shared types package for cross-app entity references) follow the same pattern.
```

### 5. Add bidirectional Goal↔Milestone linking to the lifeGLANCE planning

Currently the roadmap doesn't mention the bidirectional Goal↔Milestone linking feature. Add a paragraph either inside the lifeGLANCE parallel track or as a forward-looking note (your call which reads better). Content:

```
lifeGLANCE will adopt the intent protocol for bidirectional Goal↔Milestone linking with dayGLANCE. User-facing surface: a "track in [other app]" checkbox in each app's create/edit form, with a visual badge on linked cards. State changes (date, completion) sync via the existing protocol. This sits as Phase 5 of the intent protocol work in `glance-intents-package.md`, scheduled after lifeGLANCE v1.7 (Android).
```

### 6. Update the "Open questions" section

Remove the bullet about "lifeGLANCE mobile/Electron parallelism with intent-protocol work" — the answer is now "intent protocol work and lifeGLANCE mobile work proceed in parallel, no longer gated on the Play Store review." Either remove it or replace with a more current open question; nothing pressing.

The other open questions remain valid as written.

### 7. Cross-reference the package doc

In the "What this roadmap does not cover" section, add a bullet:

```
- The package-level build plan for `@glance-apps/intents`. That's tracked in `glance-intents-package.md`, which holds the locked schema decisions, PR sequences, and versioning policy.
```

## What to leave alone

- The "Footnote: GLANCEhub" section is fine as written
- The temporal lenses framing section is fine
- The "Architectural decisions recorded here" existing bullets (just adding one)
- The Stream Deck and TRMNL plugin discussions

## Verification

- The doc no longer implies intent protocol work is gated on the Google Play review
- The shared package pattern is documented as an architectural decision
- lifeGLANCE Goal↔Milestone linking is mentioned and cross-referenced to the package doc
- The roadmap doesn't duplicate content that lives in `glance-intents-package.md`; it points there for detail

## What to flag in the PR description

- Any section where the old "wait for Play Store review" framing was so embedded that the rewrite changed the reading more than expected
- Whether the "Right now" subsection got too dense after consolidating the post-review work into it (might need a small reorg)
