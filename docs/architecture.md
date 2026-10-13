# Loreframe architecture

Loreframe extends Foundry VTT 14's Journal editor. It does not replace it. This note maps the code; the rules
contributors must keep are in [`CLAUDE.md`](../CLAUDE.md).

## Layers

```text
src/
  core/            Foundry-free engine: registries, renderer, element tree, parser, links,
                   user templates
  content-templates/ Built-in templates (data) and their renderers (element trees)
  editor/          ProseMirror-level logic: insertion, block document operations, toolbar,
                   integrity plugin, editor tracker, document drops, dropdown menu
  applications/    ApplicationV2 windows: Template Library, Block Inspector, Template Editor
                   (pure *-model.ts + thin window classes)
  integrations/    System adapter boundary, integration manager, NPC value mapping,
                   dnd5e adapter, drop flow
  view/            View-mode enhancements (Wiki contents)
  foundry/         The only typed boundary to Foundry globals
  runtime.ts       Foundry-bound services shared by hooks, windows and the API
  api.ts           Public module API
  main.ts          Hook wiring
```

Most logic is unit-tested without Foundry. `core/`, `content-templates/`, `editor/` and the `*-model.ts` files run
against a reduced copy of Foundry's ProseMirror schema (`tests/helpers/schema.ts`).

## Rendering pipeline

```text
LoreframeTemplateDefinition (data)
  → resolveValues (field defaults < preset values < explicit values)
  → built-in renderer → TreeElement
  → TemplateRenderer (root attributes, preset class, option attributes, secret wrapper, embed)
  → serializeTree (tag/attribute allow-list, escaping, safe URLs) → HTML
  → ProseMirror.dom.parseString → document nodes
```

Blocks are identified only by `data-loreframe-*` attributes. `readBlockValues` reads property values back from the
document. `rebuildBlockTransaction` re-renders a block and grafts the old rich-text regions and slots into it, so
edits made with the inspector never destroy writing.

## Safety properties

- **No executable content.** Templates, presets, user templates and import packages are data. Renderers are
  built in. Markup is produced only by `serializeTree`, which has an allow-list. HTML parsing for text extraction
  happens in inert `<template>` elements.
- **GM-only content** uses Foundry secret blocks, which `TextEditor.enrichHTML` strips for players.
  Presentation-only hiding (the Wiki infobox's "hidden" placement) is never used for secrets.
- **Permissions.**
  - Edits require an editable ProseMirror view: Foundry only makes one for users allowed to update the page.
  - File choices go through Foundry's FilePicker.
  - Actor snapshots require Observer access to the Actor.
  - User templates live in the user's own setting.
- **Versions.** A block whose version differs from its registered template is not rebuilt: outdated, newer and
  invalid blocks stay exactly as stored.
- **Failures.** Errors are logged with context, and user actions that fail show a localized notification. Unknown
  or malformed blocks are never removed.

## Compatibility decisions

- **Editor entry points.**
  - The `getProseMirrorMenuDropDowns` hook provides the single dropdown.
  - The `createProseMirrorEditor` hook adds our plugins. The drop plugin is prepended, because Foundry registers its
    content-link plugin before this hook runs.
  - The chat input is detected by its plugin key, not by the placeholder plugin slot that every editor has.
- **Tables in the editor** are drawn through a node view (`div.tableWrapper > table`) that has no node attributes.
  Table styles therefore also target that structure.
- **Secret reveal.** Foundry rewrites a secret's opening tag with a regex that starts at `<section`. Blocks
  therefore never emit other `<section>` tags, and secrets carry nothing but their class.
- **Styles.**
  - CSS is unlayered and namespaced (`.loreframe*` classes and `data-loreframe-*` attributes).
  - Colour tokens are declared on `.theme-light` / `.theme-dark`, so the nearest themed ancestor wins.
