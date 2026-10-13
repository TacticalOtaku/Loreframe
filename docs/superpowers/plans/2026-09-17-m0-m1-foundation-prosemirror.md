# Loreframe M0 + M1 — Foundation & ProseMirror Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A buildable, testable TypeScript Foundry VTT 14.367 module that loads without console errors, exposes a single "Loreframe" dropdown in the Journal ProseMirror editor, inserts one semantic Callout block with a fresh instance id, and keeps that block intact through save → close → reopen → reload.

**Architecture:** Loreframe blocks are plain semantic HTML built only from tags Foundry's ProseMirror schema already preserves (`aside`, `div`, `section`, `header`, headings, `p`); every `class` and `data-*` attribute survives through Foundry's `AttributeCapture`. The editor entry point is one dropdown registered via the `getProseMirrorMenuDropDowns` hook; its commands render fresh HTML per insertion and place it with a pure, unit-tested transaction helper. Runtime ProseMirror comes from Foundry's global `ProseMirror`; `prosemirror-*` npm packages are dev-only (types + tests).

**Tech Stack:** TypeScript 6.0, Vite 8 (library mode), Sass, Vitest 5 + happy-dom, ESLint 10 + typescript-eslint, Stylelint, Prettier, Handlebars (Foundry-provided).

**Spec:** `F:\Downloads\LOREFRAME_DEVELOPMENT_SPEC.md` (sections 0, 5, 7, 10–13, 27, 37, 39–43, 47, 51 M0/M1)

## Verified Foundry 14.367 facts (from `D:\Foundry\Foundry Virtual Tabletop\resources\app`)

- `common/prosemirror/schema.mjs`: `header, main, section, article, aside, nav, footer, div, address` are nodes with `content: "block*"`, `defining: true`. Inline text directly inside them is NOT allowed — always wrap in `p`/`h*`.
- `schema/attribute-capture.mjs` + `constants.mjs ALLOWED_HTML_ATTRIBUTES["*"]`: `class`, `data-*`, `aria-*`, `role` are preserved on every node.
- `menu.mjs:556`: `Hooks.callAll("getProseMirrorMenuDropDowns", menu, menus)`; `menus` is `Record<string, {title, cssClass, icon?, entries}>`.
- `menu.mjs:_onAction`: an entry is found by `action` string across **all** dropdowns → actions must be globally unique (`loreframe-*`), then `cmd(state, dispatch, view)` runs, the dropdown closes, the editor refocuses.
- `dropdown.mjs:_renderMenuItem`: `title` passes through `_loc()` (localization key OK) and is **not escaped**.
- `ProseMirror.dom.parseString(html)` returns a `doc` node; `ProseMirror.state` is the full `prosemirror-state` module.
- `CONFIG.TextEditor.inserts` renders static HTML under Format → Custom → cannot mint a new instance id per insert; not used.
- v14 supports detached windows (`foundry.applications.detached`) — never assume the global `document`; use `element.ownerDocument`.
- `ALLOWED_HTML_TAGS` includes all structural tags used here, so server-side HTML cleaning keeps them.

## Global Constraints

- Target Foundry VTT `14.367` (`compatibility.minimum "14"`, `verified "14.367"`, `maximum "14"`); dnd5e is optional and not touched in M0/M1.
- Source is TypeScript; no React/Vue/Svelte/Angular/Bootstrap/Tailwind/jQuery UI.
- No prototype monkey-patching, no DOM polling, no `setInterval`, no global MutationObserver, no TinyMCE.
- All CSS scoped under `.loreframe*`; never style bare `button`, `input`, `img`, `h2`, `.window-content`, `.editor`.
- All visible strings via localization keys `LOREFRAME.*` in `lang/en.json` and `lang/ru.json`.
- No `eval`, `new Function`, inline handlers, `javascript:` URLs; all interpolated text is HTML-escaped.
- No empty `catch`; errors logged with `Loreframe |` prefix.
- Block markup: `class="loreframe-block loreframe-<template>"`, `data-loreframe-template`, `data-loreframe-version`, `data-loreframe-instance`; fields use `data-loreframe-field`.
- Module id: `loreframe`. Public API at `game.modules.get("loreframe").api`.
- TypeScript pinned to `~6.0.3` (typescript-eslint 8.70 peer range is `<6.1.0`).

## File Structure

```text
module.json                      manifest (copied to dist)
package.json / tsconfig.json / vite.config.ts / vitest.config.ts
eslint.config.js / .stylelintrc.json / .prettierrc.json / .gitignore
CLAUDE.md                        project rules for future sessions
tools/deploy.mjs                 copy dist → Foundry Data/modules/loreframe
lang/en.json, lang/ru.json
templates/applications/template-library.hbs
styles/loreframe.scss            entry; imports partials below
styles/tokens/_tokens.scss       --lf-* semantic tokens, light + dark
styles/foundations/_base.scss    .loreframe namespace base
styles/components/_editor-menu.scss
styles/templates/_block.scss     shared .loreframe-block rules
styles/templates/_callout.scss
styles/applications/_template-library.scss
src/main.ts                      hook wiring only
src/constants.ts                 MODULE_ID, SETTINGS keys, TEMPLATE_PATHS
src/types.ts                     shared domain types
src/foundry/globals.d.ts         minimal ambient typings for used Foundry APIs (boundary)
src/utils/logger.ts              prefixed logger with debug gate
src/utils/html.ts                escapeHtml
src/core/settings.ts             registerSettings, getters
src/core/instance-id.ts          newInstanceId()
src/content-templates/basic/callout.ts   render Callout HTML
src/editor/insert.ts             pure insertBlockNode(state, node, pmState)
src/editor/menu.ts               buildLoreframeDropdown + hook handler
src/applications/template-library/template-library.ts  ApplicationV2 proof
src/api.ts                       public API object
tests/html.test.ts, tests/callout.test.ts, tests/insert.test.ts, tests/menu.test.ts, tests/settings.test.ts
tests/helpers/schema.ts          PM test schema mimicking Foundry's container + attribute capture
```

---

### Task 1: Tooling scaffold (package, TS, Vite, lint, test, manifest, deploy)

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.stylelintrc.json`, `.prettierrc.json`, `.gitignore`, `module.json`, `tools/deploy.mjs`, `src/main.ts` (stub), `styles/loreframe.scss` (stub), `lang/en.json`, `lang/ru.json`, `tests/smoke.test.ts`.

**Interfaces:** Produces npm scripts `build`, `typecheck`, `lint`, `test`, `deploy`, `check` (= typecheck+lint+test+build). Build output: `dist/scripts/loreframe.js`, `dist/styles/loreframe.css`, plus copied `module.json`, `lang/`, `templates/`, `assets/`.

- [ ] Step 1: `git init`, write `.gitignore` (`node_modules/`, `dist/`, `artifacts/`, `*.zip`).
- [ ] Step 2: write `package.json` with devDependencies: `typescript ~6.0.3`, `vite ^8.3.0`, `vitest ^5.0.1`, `happy-dom ^20.14.5`, `sass ^1.104.1`, `eslint ^10.10.0`, `@eslint/js ^10.0.1`, `typescript-eslint ^8.70.0`, `globals ^17.12.0`, `stylelint ^17.15.0`, `stylelint-config-standard-scss ^17.0.0`, `prettier ^3.9.7`, `prosemirror-model ^1.25.4`, `prosemirror-state ^1.4.4`, `prosemirror-view ^1.41.8`, `prosemirror-transform ^1.12.0`; `npm install`.
- [ ] Step 3: `vite.config.ts` — lib mode, entry `src/main.ts`, format `es`, `fileName: "scripts/loreframe"`, `cssFileName: "styles/loreframe"`, `emptyOutDir: true`, sourcemaps on, plus an inline plugin copying `module.json`, `lang`, `templates`, `assets` into `dist` on `closeBundle`.
- [ ] Step 4: `module.json` — id `loreframe`, `esmodules: ["scripts/loreframe.js"]`, `styles: ["styles/loreframe.css"]`, `languages` en/ru, compatibility 14/14.367/14, `relationships.systems` empty (dnd5e is optional, declared in a later milestone as `recommends`).
- [ ] Step 5: `tools/deploy.mjs` — resolve target `process.env.FOUNDRY_DATA ?? %LOCALAPPDATA%/FoundryVTT/Data` + `/modules/loreframe`; refuse if `dist/module.json` missing; remove target dir only if it contains `module.json` with `"id": "loreframe"`; copy `dist` recursively.
- [ ] Step 6: write `tests/smoke.test.ts` asserting `module.json` id/compatibility and that every key in `en.json` exists in `ru.json` (and vice versa).
- [ ] Step 7: run `npm run check` → all green; `dist/` contains the expected files.

### Task 2: Shared foundations — constants, logger, escapeHtml, instance ids, settings

**Files:** Create `src/constants.ts`, `src/types.ts`, `src/foundry/globals.d.ts`, `src/utils/logger.ts`, `src/utils/html.ts`, `src/core/instance-id.ts`, `src/core/settings.ts`; tests `tests/html.test.ts`, `tests/settings.test.ts`.

**Interfaces (produced):**
```ts
export const MODULE_ID = "loreframe";
export const SETTINGS = { debug: "debug", favorites: "favorites", recent: "recent", enableIntegrations: "enableIntegrations" } as const;
export function escapeHtml(value: unknown): string;
export const logger: { debug(...a: unknown[]): void; info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
export function newInstanceId(): string;          // foundry.utils.randomID(16)
export function registerSettings(): void;          // called on "init"
export function getSetting<K extends SettingKey>(key: K): SettingValue<K>;
```

- [ ] Step 1: failing tests: `escapeHtml('<a href="x">&\'')` → `&lt;a href=&quot;x&quot;&gt;&amp;&#39;`; `escapeHtml(null)` → `""`; `registerSettings()` calls `game.settings.register` for the four keys with scopes `client, client, client, world` and `config` false for favorites/recent (use a stubbed `globalThis.game`).
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS. Step 5: `npm run check`.

### Task 3: Callout block renderer (the one M1 semantic block)

**Files:** Create `src/content-templates/basic/callout.ts`, `styles/templates/_block.scss`, `styles/templates/_callout.scss`; test `tests/callout.test.ts`.

**Interfaces:**
```ts
export type CalloutVariant = "note" | "lore" | "warning";
export interface CalloutOptions { variant: CalloutVariant; title: string; body: string; instanceId: string }
export const CALLOUT_TEMPLATE_ID = "callout";
export const CALLOUT_VERSION = 1;
export function renderCallout(o: CalloutOptions): string;
```
Markup:
```html
<aside class="loreframe-block loreframe-callout loreframe-callout--note" data-loreframe-template="callout" data-loreframe-version="1" data-loreframe-instance="ID" data-loreframe-variant="note">
  <h4 class="loreframe-callout__title" data-loreframe-field="title">Note</h4>
  <div class="loreframe-callout__body" data-loreframe-field="body"><p>Body</p></div>
</aside>
```
- [ ] Step 1: failing tests: attributes present; title and body escaped; parsing via `DOMParser` yields no text nodes directly under `aside`/`div` other than whitespace; unknown variant throws.
- [ ] Step 2–4: red → implement → green.
- [ ] Step 5: styles using only `--lf-*` tokens; variant sets `--lf-callout-accent`; no global selectors.

### Task 4: Pure insertion transaction

**Files:** Create `src/editor/insert.ts`, `tests/helpers/schema.ts`; test `tests/insert.test.ts`.

**Interfaces:**
```ts
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
type StateModule = Pick<typeof import("prosemirror-state"), "TextSelection" | "Selection">;
export function insertBlockTransaction(state: EditorState, block: PMNode, pm: StateModule): Transaction;
```
Behaviour:
1. cursor in an empty top-level-ish textblock → replace that textblock with `block`;
2. otherwise insert `block` right after the textblock containing the cursor (`$from.after(depth)`), via `replaceRangeWith` so the transform finds a valid position;
3. if the inserted block ends up as the last child of its parent, append an empty paragraph after it (so the user can keep writing);
4. place the cursor at the end of the last textblock inside the inserted block;
5. with a non-empty selection → replace the selection with the block (`replaceSelectionWith`), then steps 3–4.

- [ ] Step 1: test schema = paragraph, heading, text, `aside`/`div` (`block*`, `defining`, attrs `classes` + `_preserve` with parse/serialize capturing `class`/`data-*`), `doc: block+`.
- [ ] Step 2: failing tests for cases 1, 2, 3, 4, 5 and "attributes survive `DOMSerializer` → `DOMParser` round trip".
- [ ] Step 3–4: implement → green.

### Task 5: Editor dropdown + hook wiring

**Files:** Create `src/editor/menu.ts`; modify `src/main.ts`; create `styles/components/_editor-menu.scss`; test `tests/menu.test.ts`.

**Interfaces:**
```ts
export const DROPDOWN_KEY = "loreframe";
export interface MenuDeps { renderBlockHtml(variant: CalloutVariant): string; parseHtml(html: string): PMNode; stateModule: StateModule; openLibrary(): void }
export function buildLoreframeDropdown(deps: MenuDeps): ProseMirrorDropDownConfig;
export function onGetProseMirrorMenuDropDowns(menu: ProseMirrorMenuLike, menus: Record<string, ProseMirrorDropDownConfig>): void;
```
Dropdown (two levels max, spec §13):
```text
Loreframe ▾
  Quick Blocks ▸  Note | Lore | Warning
  ───────────
  Open Template Library…
```
Favorites/Recent groups appear in M3 when there is data to show.

- [ ] Step 1: failing tests: config has `cssClass: "loreframe"`, an icon, title key `LOREFRAME.Editor.Menu`; every action starts with `loreframe-` and is unique; nesting depth ≤ 2; the Note entry's `cmd` dispatches a transaction whose doc contains `data-loreframe-template="callout"`; the Library entry calls `openLibrary` and dispatches nothing; `cmd` returns `false` and logs when `menu.view.editable` is false.
- [ ] Step 2–4: red → implement → green.
- [ ] Step 5: `main.ts`: `Hooks.once("init")` → settings, `Hooks.on("getProseMirrorMenuDropDowns", …)`; `Hooks.once("ready")` → set `module.api`, `Hooks.callAll("loreframeReady", api)`.

### Task 6: ApplicationV2 proof — Template Library shell

**Files:** Create `src/applications/template-library/template-library.ts`, `templates/applications/template-library.hbs`, `styles/applications/_template-library.scss`, `styles/tokens/_tokens.scss`, `styles/foundations/_base.scss`, `src/api.ts`.

**Interfaces:**
```ts
export function openTemplateLibrary(): TemplateLibraryApplication; // singleton; brings to top if open
export interface LoreframeApi { openTemplateLibrary(): void; readonly version: string }
export function createApi(): LoreframeApi;
```
Class is defined lazily inside a factory (Foundry globals do not exist at module evaluation in tests). `HandlebarsApplicationMixin(ApplicationV2)`, id `loreframe-template-library`, classes `["loreframe", "loreframe-library"]`, `window.title "LOREFRAME.Library.Title"`, `window.icon "fa-solid fa-swatchbook"`, `resizable: true`, `position {width: 720, height: 520}`, one part `main`. Content: three-pane grid skeleton (categories / grid / preview) with an honest empty state "Template catalogue arrives in the next milestone" — localized.

- [ ] Step 1: tokens: `--lf-background, --lf-surface, --lf-surface-raised, --lf-border, --lf-border-strong, --lf-text, --lf-text-muted, --lf-accent, --lf-accent-hover, --lf-accent-contrast, --lf-danger, --lf-warning, --lf-success, --lf-shadow-sm, --lf-shadow-md, --lf-radius-sm, --lf-radius-md`, spacing `--lf-space-1..6`, type `--lf-font-display/body`, `--lf-text-meta/body/heading/display`, `--lf-control-height`, `--lf-icon-size`, `--lf-focus-ring`, `--lf-duration`, `--lf-divider`. Defined on `.loreframe, .loreframe-block` scope, light values under `.theme-light` ancestors and dark values under `.theme-dark` ancestors, deriving from Foundry's `--color-*` variables where they exist.
- [ ] Step 2: implement app + template + api; `npm run check`.

### Task 7: Live Foundry verification (M0 + M1 acceptance)

- [ ] `npm run build && npm run deploy`; enable module in world `test`; reload.
- [ ] Console: no `Loreframe` errors, `game.modules.get("loreframe").api` present.
- [ ] Journal: create entry → text page → edit → Loreframe dropdown visible once → insert Note between two paragraphs → type in body → save → close → reopen view mode → reopen edit mode → `F5` reload → markup still has `data-loreframe-instance` and same id.
- [ ] Verify Light and Dark themes, standard and narrow page widths, Template Library opens from the menu and via API, Escape closes it.
- [ ] Disable module (view HTML in page) → content readable (title + body text present).
- [ ] Code review pass (`superpowers:requesting-code-review`), UI polish pass, milestone report.
