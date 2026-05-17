# Claude Code prompt: update `lifeGLANCE-roadmap-and-lives-spec.md`

## Context

The lifeGLANCE roadmap doesn't yet mention the bidirectional Goal↔Milestone linking integration with dayGLANCE. Add a section describing the feature, its sequencing, and the package adoption.

This is a doc-only addition. No changes to existing content beyond cross-referencing.

## Scope of changes

### 1. Add a new section after the existing "Lives (v2.0)" section

Title: `## dayGLANCE integration: Goal↔Milestone linking`

Content:

```
Bidirectional integration with dayGLANCE: any user can mark a milestone in lifeGLANCE as "track as Goal in dayGLANCE," or mark a Goal in dayGLANCE as "track in lifeGLANCE." Either origination point creates the mirrored record in the other app, and state changes (target date, completion) sync via the GLANCE intent protocol.

### User-facing surface

- **In lifeGLANCE:** the milestone create/edit form gets a "track as dayGLANCE Goal" checkbox, enabled only for future-dated milestones. When checked, lifeGLANCE emits an outbound `create` action to dayGLANCE with `source_app=app.lifeglance` and `source_entity_id=<milestone_id>`, with `due` set to the milestone date.
- **In dayGLANCE:** Goals get a "track in lifeGLANCE" checkbox. When checked, dayGLANCE emits an outbound `create` action to lifeGLANCE. lifeGLANCE receives the inbound `create` and creates a corresponding milestone.
- **Visual signal:** both apps render a small badge on the card of a linked record, indicating "this is linked to a [Goal/Milestone] in [other app]."
- **Date sync:** changing the date on either side fires a state update via the protocol's `notify` (or a re-emitted `create` that the receiving app's idempotency logic treats as an update). The pair stays in sync.
- **Completion sync:** when the user marks the Goal complete in dayGLANCE, dayGLANCE emits `notify` with `event=completed`. lifeGLANCE receives it and marks the corresponding milestone as completed (semantics to be resolved: date update vs badge — see open questions below).

### Pre-existing pair linking

Not supported. If a user has a Goal in dayGLANCE and a milestone in lifeGLANCE that are conceptually the same thing, the supported workflow is to delete one and recreate it via the integrated checkbox flow. The protocol's `create`-as-update idempotency does not extend to retroactively linking two pre-existing records; supporting that case would require a new `link` action and additional UI on both sides that doesn't justify its complexity for v1.

### Sequencing

This is Phase 5 of the intent protocol work in `glance-intents-package.md`. It sits after:

- `@glance-apps/intents@1.0.0` is published (Phase 1)
- dayGLANCE consumes the package and ships the WebDAV transport + outbound `notify` (Phase 2 critical path)
- lifeGLANCE v1.7 (Android) ships, putting lifeGLANCE on the same platform footprint that needs cross-app integration

The package adoption inside lifeGLANCE is straightforward — same shape as lastGLANCE's adoption, applied to a second app. The work is mostly lifeGLANCE-side: outbound `create` emission, inbound `notify` consumption, plus a new wrinkle (inbound `create` handling, since lifeGLANCE can also receive Goal→Milestone pushes from dayGLANCE).

### Open questions

- **Milestone completion semantics.** Future-dated milestones tracked as Goals: when the Goal completes in dayGLANCE, does the lifeGLANCE milestone (a) update its date to the actual completion date and become a past milestone, (b) stay at the originally-planned date with a "completed on X" badge, or (c) use a new "planned" milestone state that resolves at completion time? Resolve before scoping the Phase 5 PRs.
- **Default Chapter membership for dayGLANCE-originated milestones.** When dayGLANCE pushes a new milestone to lifeGLANCE via inbound `create`, which Chapter (if any) does it land in? Suggest from date overlap as the existing milestone-creation flow does? Always uncategorized? User pref?
- **Past-dated milestones marked as Goals.** Should the checkbox be disabled, or should it create a past-due Goal in dayGLANCE? Default to disabled for v1.
- **`deleted` handling.** When a Goal is deleted in dayGLANCE, does the linked milestone in lifeGLANCE auto-delete, prompt the user, or stay (unlinked)? Default to "prompt the user" for v1; deletion is destructive on the lifeGLANCE side.
```

### 2. Cross-reference the package doc in the existing "Sequencing rationale" section

Add a sentence at the end of the "Sequencing rationale" subsection:

```
Cross-app integration via the GLANCE intent protocol is sequenced as Phase 5 in `glance-intents-package.md`, after v1.7 Android ships. lifeGLANCE will consume `@glance-apps/intents` rather than re-implementing protocol logic locally.
```

### 3. Add to "Platform packaging notes"

Add a bullet at the end:

```
- Cross-app coordination (with dayGLANCE) is via the shared `@glance-apps/intents` package over the WebDAV event log transport, consistent with the rest of the GLANCE family
```

## What to leave alone

- The Lives feature spec — unaffected
- The Chapters polish work — unaffected
- The v1.6 sync architecture and v1.7 Android sequencing — unaffected
- The export-as-artifact strategic note — unaffected
- The "Prompt principles for Claude Code" section — unaffected
- All open questions on the Lives feature — unaffected

## Verification

- A "dayGLANCE integration: Goal↔Milestone linking" section exists
- The sequencing rationale cross-references the package doc
- The Phase 5 timing (after v1.7 Android) is documented
- The "pre-existing pair linking" workaround is explicit
- The open questions are listed and scoped

## What to flag in the PR description

- Whether the new section sits more naturally after "Lives (v2.0)" or earlier in the doc
- Whether any of the open questions feels pressing enough to want resolved before Phase 5 starts (vs at Phase 5 scoping time)
