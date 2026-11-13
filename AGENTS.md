# Loreframe — project rules

Authoring layer for the Foundry VTT 14.367 Journal ProseMirror editor. The approved spec is the source of
truth: `F:\Downloads\LOREFRAME_DEVELOPMENT_SPEC.md` (copy it into `docs/` if that path disappears).
Milestone plans live in `docs/superpowers/plans/`.

## Commands

- `npm run check` — typecheck + ESLint + Stylelint + Vitest + build. Must be green before claiming anything.
- `npm run release` — check + `tools/package.mjs`: validates module.json against package.json (version, GitHub
  release URLs, listed files) and writes `../loreframe-v<version>.zip` next to the other modules' archives (no source
  maps). As in the sibling modules, `manifest` is the raw `main`-branch module.json.
- `npm run deploy` — copies `dist/` to `%LOCALAPPDATA%/FoundryVTT/Data/modules/loreframe` (or `FOUNDRY_DATA`).

## Foundry API truth

Never guess v14 APIs. Read the installed client source: `D:\Foundry\Foundry Virtual Tabletop\resources\app`
(`client/`, `common/prosemirror/`, `public/css/foundry2.css`). Typings for what we use live only in
`src/foundry/globals.d.ts`; `src/editor/node-attrs.ts` is the only place that knows about the schema's
internal `_preserve` attribute.

## Architecture invariants

- Blocks are plain HTML built from tags the core schema already keeps (`aside/div/section/header`,
  headings, `p`). Containers are `block*`: never put bare text directly in them.
- Semantics live in `data-loreframe-*`; classes are styling only. Label headings carry `data-no-toc`.
- One editor entry: the `loreframe` dropdown from `getProseMirrorMenuDropDowns`. Actions are prefixed
  `loreframe-` (Foundry resolves actions across all dropdowns).
- Runtime ProseMirror is the global `ProseMirror`; `prosemirror-*` npm packages are dev-only (types/tests).
- Colour tokens are declared on `.theme-light` / `.theme-dark` elements so the nearest themed ancestor wins.
- Templates are data (`LoreframeTemplateDefinition`) that name a built-in renderer; renderers return an element
  tree and `serializeTree` (`src/core/element-tree.ts`) is the only path to markup — it owns the allow-list.
  The public API cannot register renderers.
- `TemplateRenderer` owns the root attributes; blocks are identified only via `parseBlocks` (never classes).
  Unknown/newer/invalid blocks are never modified; migrations work on a copy and keep the original on failure.
- `block-integrity-plugin` keeps blocks whole on foreign paste (closed clipboard slice) and re-issues
  instance ids for pasted/dropped copies. Insertion selects `definition.focusField`.
- Blocks nest only inside `data-loreframe-slot` regions (TreeElement `slot`); from any other part of a block,
  insertion goes after that block. Menu and library both insert through `insertTemplateIntoView`.
- The library inserts into `EditorTracker.active()` (last focused editor) unless opened from an editor menu,
  which pins that editor. `src/runtime.ts` holds the Foundry-bound services.
- Every Foundry editor has a placeholder `chatInput` plugin slot; detect the chat input only via
  `isChatEditor` (ChatInputPlugin key). Checking the slot name disables Loreframe plugins everywhere.
- GM-only templates (`secret: true`) render a bare `<section class="secret">` around the block root: Foundry's
  reveal toggle rewrites that tag with a regex, so it must carry no other attributes. Image fields wrap `<img>`.
- Never rebuild a block whose `data-loreframe-version` differs from its template (`blockVersionState`): newer and
  invalid blocks are read-only for Loreframe; outdated ones go through `migrateBlockTransaction` only after the
  author confirms. Versions are positive integers.
- The block toolbar follows the WAI-ARIA toolbar pattern (Alt+F10, arrows, Home/End, Escape, roving tab stop).
  Actor snapshots require Observer access. The inspector opens beside the editor's window.
- Select/boolean values live on the block root as `data-loreframe-opt-<field>`; the inspector reads a block back
  with `readBlockValues` (`src/editor/block-document.ts`) and rebuilds it with `rebuildBlockTransaction`, which
  keeps rich-text fields, slot contents, the instance id and the secret wrapper (id + revealed). Edit, duplicate
  and delete go through `runtime` (`updateBlock`/`duplicateBlock`/`deleteBlock`); the block toolbar only calls them.
- Rebuilds never drop writing: property regions whose value did not change are taken over from the old block
  (formatting survives), and nodes outside fields/slots without a `loreframe*` class are moved below the block
  (`movedOutOfBlock`). Hence renderer output outside fields/slots must always carry a `loreframe*` class (tested
  for every built-in template).
- `htmlToText` drops Foundry secrets unless `keepSecrets` (GM-only destinations); use `secretText` to route them.
- Menu titles are rendered as HTML by Foundry (`dropdown.mjs`): escape user-given names. Use
  `ProseMirror.state.Plugin`, not the legacy `ProseMirror.Plugin` re-export.
- Inspector windows are keyed by editor + instance id (ids are unique per document only).
- ApplicationV2 Handlebars parts must render exactly one root element (hence inspector `body` + `footer` parts).
- Presets are only a root class (`loreframe-preset--<id>`); built-ins live in `src/content-templates/presets.ts`.
  The inspector's preset select uses form key `_preset`; fields may set `inspectorGroup` (general/sections/style).
- Optional sections are boolean `show-<field>` toggles; only rich-text sections may be toggled (a hidden text
  property would be lost), and the inspector confirms before removing written sections. Renderers omit empty
  text fields, and `readBlockValues` reads a missing text field as `""`.
- Secrets nested inside a block use `TreeElement.secret` (bare `<section class="secret">`). Block markup must not
  use other `<section>` tags: the reveal regex starts at `<section`. In view mode Foundry wraps secrets in
  `<secret-block>`, so CSS must not assume `section.secret` is a direct child.
- Empty image fields and gallery items keep the placeholder image (editable); CSS hides them outside
  `.ProseMirror`/library preview. Shared preset styling (`--lf-preset-*`) lives in `styles/templates/_presets.scss`.
- Foundry links stay native text `@UUID[uuid]{label}` (`src/core/links.ts`); `links` fields render them in
  `ul > li > p` and read them back by parsing. Foundry enriches them on display only.
- System knowledge lives only in `src/integrations/<system>/` behind `LoreframeSystemAdapter`;
  `IntegrationManager` is the only place that compares game system ids (plus the template system filter) and
  honours `enableIntegrations`. Adapter output is plain text; GM-only text goes only into Foundry secrets.
- Document drops: `loreframeDocumentDrop` must be prepended (`prependPlugin`) — Foundry adds `contentLinks` before
  `createProseMirrorEditor`. It claims only document types an active adapter handles; snapshots, no live binding.
  Foundry's own drop replaces a non-empty selection with a labelled link (native behaviour).
- "My Templates" (`src/core/user-templates.ts`) are declarative insertion recipes (base id + preset + select/boolean
  values) stored in the user-scoped `userTemplates` setting and re-validated on every read. Inserted blocks carry the
  base template id. Import/export is a bounded JSON package; names are plain text and always escaped.
- Change notifications: `runtime.notifyUserTemplatesChanged()` / `EditorTracker.onChange` keep open windows
  (library Insert button, My Templates list) current; unsubscribe on close.
- `.hbs` files are parsed in tests (`tests/templates-hbs.test.ts`); shared inspector field groups live in the
  `inspector-sections.hbs` partial (preload it via the part's `templates`).
- View-mode enhancements live in `src/view/` and run from the `renderJournalEntryPageSheet` hook (`app.isView`).
  Stored HTML holds only inert markers (`data-loreframe-contents`); editor-only hints are `data-loreframe-hint`
  attributes shown by CSS, so pages read without Loreframe carry no misleading text.
- "Hidden" presentation options (e.g. Wiki infobox) keep content in the document and hide it with CSS outside
  the editor — never use this for GM-only content (use Foundry secrets).
- In the editor, prosemirror-tables renders tables as `div.tableWrapper > table` without node attributes: table
  styles must also target `.<block> .tableWrapper > table`.
- Composition: renderers call `embed(templateId, {key})` to nest a full block (instance id `<parent>-<key>`);
  put embedded blocks in a slot so rebuilds keep them. Only regions stored in the document (rich text, slots) may
  be toggled; `writtenRegions` decides whether a toggle needs confirmation.
- Layout regions wrap via flex bases (no container/viewport queries in Journal content); CSS is unlayered and
  therefore beats Foundry's `@layer` rules without `!important`.

## Live verification (world `test`, dnd5e 5.3.3)

- A newly deployed module is only discovered after returning to Setup (`game.shutDown()`) and relaunching.
- Join as user `Claude` (GM, no password). QA journal: "Loreframe QA".
- The built-in browser pane may report a 0×0 viewport; emulate 1440×900 for screenshots. Under emulation,
  clicks inside ProseMirror can land at the wrong document position and `End`/`Escape` key actions are not
  delivered faithfully — place the caret with the DOM Selection API and dispatch `KeyboardEvent`s with `code`.
  Its `key` action sends no `code`/text, so Enter/Space do not activate buttons: simulate keyboard activation
  with a `click` event whose `detail` is 0. Screenshots can lag behind the DOM — verify state via JS.
  The pane document is often unfocused, so `element.focus()` fires no focus event: dispatch `FocusEvent("focus")`
  on the `.ProseMirror` element before using the active-editor tracker.
- The user may be playing in world `test` at the same time: never shut down or relaunch it without asking.
- Chain `npm run check > log && npm run deploy` — piping check into `grep` hides its failure.
- `foundry.utils` is a module namespace: assigning to it is silently ignored, so it cannot be stubbed. To test file
  exports without downloading, intercept `URL.createObjectURL` and `HTMLAnchorElement.prototype.dispatchEvent`.
  Imports can be driven by setting `input.files` from a `DataTransfer` and dispatching `change`.
- The browser pane can lose the session (back on `/join`): log in again as `Claude`.
- Document drops can be simulated with `new DataTransfer()` + `setData("text/plain", JSON.stringify({type, uuid}))`.
- Module CSS is loaded via `@import` in a `<style>` tag: reload the client to pick up a redeployed stylesheet.
- Synthetic Shift+key events need `keyCode` for prosemirror-keymap (e.g. redo `Shift-Mod-z`: `keyCode: 90`).
- Restore any client setting you change (e.g. `core.uiConfig` colour scheme) after checking themes.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `TacticalOtaku/Loreframe` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` and `docs/adr/` at the repo root). See `docs/agents/domain.md`.
