# Claude Code prompt: update `dayglance-intent-protocol.md`

## Context

The intent protocol spec at `dayglance-intent-protocol.md` was written before several open decisions were settled. The decisions have been resolved (see `glance-intents-package.md` for the full record). Update the spec to reflect the locked decisions and remove the stale "Open decisions" framing.

This is a documentation-only edit. No code changes.

## Scope of changes

### 1. Close the "Open decisions" table near the bottom of the doc

Replace the entire "Open decisions" section with a "Resolved decisions" section (or fold each resolution into the relevant action section and remove the table entirely — your judgment on what reads better). The resolutions are:

- **Multiple title match on `complete`:** complete soonest-due + `%dg_warning`
- **"In progress" definition:** active timed window (task with `startTime` and `duration` where current time falls within `startTime` to `startTime + duration`)
- **"Next up" definition:** next timed task today with a `startTime` after now
- **Web transport for `query`:** no-op + UI (open to GLANCE tab, no state read)

The `complete`, `query`, and web-transport sections already describe these behaviors as recommendations. Update them to remove the "recommendation" hedge — these are now locked.

### 2. Update the `notify` action section

- Replace the existing prose around `updated` events with: "`updated` fires only on changes to: `title`, `notes`, `tags`, `priority`, `project`, `recurring`. Explicitly not: `completed_at` (use `completed`/`uncompleted`), `due` (use `rescheduled`), internal/UI state, sort order, focus flags, color changes, tag reorderings."
- Add explicit rule: "Multi-field changes in a single save = one `updated` event, not one per field. The event represents the state transition; the payload carries the new state; consumers diff against their own last-known state if they care which fields moved."
- Add `entity_type` to the fields table as an optional string. Description: "Type of entity that changed state; e.g. `task`, `goal`. dayGLANCE sets this on emission; consumers may filter on it or ignore it."

### 3. Update the `query` action section

- Add two return variables to the returned-variables table:
  - `%dg_count_inbox` (Integer): "Incomplete tasks in Inbox"
  - `%dg_in_progress_remaining_min` (Integer): "Minutes remaining in active task; 0 if none"
- Update the "Fields" subsection: remove the line about `scope` ("Optional field `scope` may narrow the query in the future..."). Replace with: "`query` takes no parameters in v1. Future versions may add a `scope` field; consumers should not send unknown fields."

### 4. Add a "Versioning" section

Add a new section near the top of the doc (after "Overview" or "Status"). Content:

```
## Versioning

`schema_version` versions the entire protocol — envelope, all action payloads, all enum values. The implementing package `@glance-apps/intents` tracks the protocol version directly: package version `1.x.y` corresponds to protocol `schema_version` 1, package version `2.0.0` ships protocol `schema_version` 2 and is a coordinated multi-app upgrade.

**Breaking changes (major bump):**
- Removing a field, renaming a field, changing a field's type
- Removing an enum value
- Removing an action
- Changing required/optional status of a field
- Changing normalization behavior in a way that produces different outputs for the same input

**Non-breaking changes (minor bump):**
- Adding an optional field
- Adding a new enum value to a forward-compatible enum (where the spec documents that consumers should tolerate unknown values; `notify.event` qualifies, `priority` does not)
- Adding a new action
- Adding a new return variable to `query`

**Patch changes:**
- Bug fixes in validators or normalizers that bring behavior in line with the documented spec
```

### 5. Family-wide framing pass

Throughout the doc, where the framing implies dayGLANCE-centricity, soften to "the GLANCE intent protocol." Specifically:

- The doc's title can stay as-is (it's a dayGLANCE-repo file) but add a leading sentence to the Overview: "Despite the historical name, this is the universal cross-app contract for the GLANCE family. Any GLANCE app can act as an emitter or consumer of any action; the schema is symmetric. The doc retains 'dayglance' framing where the implementation is genuinely dayGLANCE-specific (e.g., the `%dg_` return-variable prefix on Tasker)."
- The "Consumers" section currently leads with Tasker and lastGLANCE. Add a third subsection for **lifeGLANCE** noting that bidirectional Goal↔Milestone linking is a planned consumer; minimal content (1-2 paragraphs) since the integration sits in Phase 5 and isn't built yet.

### 6. Update the build order section

The existing build-order section in the doc is now obsolete (it predates the package extraction). Replace with a pointer:

```
## Build order

The package and consumer implementations are sequenced in `glance-intents-package.md`. Summary:

1. `@glance-apps/intents@1.0.0` is published as the shared package containing schemas, normalizers, idempotency helpers, and WebDAV envelope helpers.
2. dayGLANCE consumes the package, implements the shared `handleIntent` handler, ships the WebDAV transport and outbound `notify` emission.
3. lastGLANCE consumes the package, wires outbound `create` and inbound `notify` consumption.
4. Android intent transport and web URL transport ship in dayGLANCE as additive surfaces over the same `handleIntent`.
5. lifeGLANCE adopts the package for bidirectional Goal↔Milestone integration.
```

## What to leave alone

- All schemas and field definitions (other than the `entity_type` addition and the two new `query` return variables)
- All transport sections (WebDAV, Android intents, web URL) — they're accurate as written
- The "Shared handler" section — accurate
- The "Shared-protocol efficiencies" section — accurate
- The relationship-to-deep-linking section — accurate

## Verification

- The doc reads as a complete spec, not a draft with open decisions
- `entity_type` appears in the `notify` payload table
- `%dg_count_inbox` and `%dg_in_progress_remaining_min` appear in the `query` returned variables table
- A "Versioning" section exists with the breaking/minor/patch rules
- The "Open decisions" table is gone (folded in or replaced)
- The build order points at `glance-intents-package.md`
- No internal contradictions: if a recommendation in one section is locked, no other section should still call it a recommendation

## What to flag in the PR description

- Any internal contradictions in the original doc that surfaced during editing
- Any place where the family-wide framing felt awkward to apply (e.g., sections that are genuinely dayGLANCE-only)
- Whether the "Open decisions" table is best replaced with a "Resolved decisions" section or folded into the action sections inline
