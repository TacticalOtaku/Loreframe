# Loreframe M11 — Final Polish & Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stable, coherent, visually polished module on Foundry 14.367 (spec §42–§50, §51 M11, §53).

## Review areas and outcomes

1. **Migration checks (§46, §47).** The inspector and `updateBlock` rebuilt blocks regardless of their stored
   version, which would destroy markup of blocks made by another template version.
   - Fix: `blockVersionState` guards every rebuild.
   - Outdated blocks go through `migrateBlockTransaction` (MigrationService on a copy), only after the author
     confirms.
   - The parser and the guard accept only positive integer versions.
2. **Permissions (§44).**
   - Actor snapshots require Observer access to the Actor.
   - Edits require an editable view.
   - Files go through FilePicker.
   - User templates are stored in the user's own setting.
3. **Accessibility (§31, §49).**
   - The block toolbar follows the WAI-ARIA toolbar pattern: Alt+F10, arrow keys, Home/End, Escape, roving tab stop.
   - The Edit button is hidden for unknown templates.
   - Focus rings and reduced motion are handled centrally.
4. **Security (§43).** An audit of `innerHTML`, triple-stash output, dialog content, URLs and imports.
   - HTML is parsed only in inert templates.
   - Previews show only renderer output.
   - Dialog arguments are escaped.
   - `serializeTree` rejects unsafe URLs.
5. **Error handling (§47).** Every `catch` logs with context, and failed user actions notify.
6. **Performance (§42).** Available templates are looked up once per library render; there are no timers or global
   observers.
7. **Compatibility (§45).** No prototype patches. Top-level CSS selectors are namespaced or declare only `--lf-*`
   tokens. Drop handling is targeted.
8. **Polish.** The inspector opens beside the Journal window instead of the screen centre.
9. **Documentation.** `README.md`, `CHANGELOG.md`, `docs/architecture.md`.
10. **Final verification (§48, §50).** The Foundry integration flow, the browser flows, and a visual sweep of the
    library, inspector, NPC, Location, Gallery and Wiki in light and dark themes at standard and narrow widths,
    plus a console check.
