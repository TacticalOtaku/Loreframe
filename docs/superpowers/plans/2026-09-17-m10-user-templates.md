# Loreframe M10 — User Presets/Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users create useful variants of templates — duplicate, rename, choose sections, options and preset, "Save
as My Template" — with safe persistence and bounded import/export, without a page builder (spec §32, §33, §51 M10).

**Architecture:**
- *User template* (`src/core/user-templates.ts`): `{schemaVersion: 1, id: "user-…", name, description, base, preset,
  values}` where values are only the base template's select/boolean fields. Pure data, validated by
  `sanitizeUserTemplate` on every read and write; names are plain text.
- *Insertion recipe*: inserting a user template inserts its **base** template with the stored preset and values, so
  blocks stay editable and portable when the user template changes or disappears. Recent use records the user id.
- *Storage*: user-scoped world setting `loreframe.userTemplates` (follows the Foundry user across devices), limit 100.
- *Import/export*: `{format: "loreframe-templates", schemaVersion: 1, templates}`, max 256 KB, invalid entries
  skipped, ids re-issued; export through `foundry.utils.saveDataToFile`, import through a file input.
- *UI*: Library category "My Templates" (edit, duplicate, delete with confirmation, export, import, export all);
  "Save as my template…" for any template; a template editor window reusing the inspector's section/option/style
  groups (shared `inspector-sections.hbs` partial); "Save as template…" in the block inspector.

**Spec:** §16, §32, §33, §51 M10.

## Verified Foundry 14.367 facts

- `common/constants.mjs` `SETTING_SCOPES.USER`: stored per user in the settings database.
- `client/utils/helpers.mjs`: `saveDataToFile(data, type, filename)`, `readTextFromFile(file)`.
- `client/applications/handlebars.mjs`: `getTemplate(path)` registers the partial under its path; parts preload
  partials through `templates`.
- `client/applications/ui/notifications.mjs`: `format` arguments are escaped.

## Tasks (each: failing tests → implement → `npm run check`)

1. User template model, store, validation, import/export.
2. Library model: My Templates category, user cards, preset handling, search, favorites/recent.
3. Template editor model and window; shared inspector partial; inspector "Save as template…".
4. Runtime wiring (setting, insert entry, previews, change notifications); library actions and toolbar.
5. Handlebars parse test for all application templates.
6. Live: create from library and from the inspector, insert, edit, duplicate, delete, export, import (valid,
   partially invalid, malicious), narrow library, light theme, console.
