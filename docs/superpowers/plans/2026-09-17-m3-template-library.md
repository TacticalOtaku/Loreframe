# Loreframe M3 — Template Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users browse, search, preview and insert templates from an ApplicationV2 library window without deep editor menus; favorites and recent make it faster with use (spec §51 M3).

**Architecture:** A pure `buildLibraryModel()` turns registry + preferences + UI state into view data (tested without Foundry). The window is a thin `HandlebarsApplicationMixin(ApplicationV2)` with three parts (`nav`, `browser`, `preview`) re-rendered selectively; search filters rendered cards in the DOM with the same matcher the model uses (no re-render per keystroke). Insertion target: an `EditorTracker` fed by a tiny ProseMirror plugin (last focused, still connected, editable view); opening the library from an editor menu pins that editor. Menu and library share one `insertTemplateIntoView()`, which also records recent use.

**Tech Stack:** as before.

**Spec:** §13–16, §30–31, §37, §40, §42, §49, §51 M3, §53.

## Verified Foundry 14.367 facts

- `client/applications/api/handlebars-application.mjs`: `render({parts})` re-renders only listed parts; `_preparePartContext(partId, context, options)`; focus is restored across re-render when the focused element has an `id` or `name` (`_preSyncPartState`); `scrollable` selectors keep scroll.
- `client/applications/api/application.mjs`: clicks on `[data-action]` call `DEFAULT_OPTIONS.actions[action]` with `this` = app, `(event, target)`.
- ProseMirror menu dropdowns are built once per editor view (`menu.mjs` defines `dropdowns` at construction) → Favorites/Recent in the editor menu refresh when the editor is reopened.

## Global Constraints

As M0–M2. Plus: no global DOM observers; search debounce 120 ms; preview HTML only from `TemplateRenderer` (triple-stash allowed only for it); every icon-only control has `aria-label`; cards keyboard-accessible; layout driven by container queries on the window (≥ 900 px three panes, 600–899 two panes + preview strip, < 600 list + preview strip).

## File Structure

```text
src/core/preferences.ts                              Preferences (favorites, recent) over injected storage
src/applications/template-library/library-model.ts   buildLibraryModel(), matchesQuery(), searchText()
src/applications/template-library/template-library.ts ApplicationV2 window (rewritten)
src/editor/editor-tracker.ts                         EditorTracker + buildEditorTrackerPlugin()
src/editor/insert-template.ts                        insertTemplateIntoView()
src/editor/menu.ts                                   + Favorites / Recent groups, uses insertTemplateIntoView
src/api.ts                                           + insertTemplate(templateId)
templates/applications/library-{nav,browser,preview}.hbs
styles/applications/_template-library.scss           rewritten
lang/*.json                                          library + category keys
tests/preferences.test.ts, library-model.test.ts, editor-tracker.test.ts, insert-template.test.ts, menu.test.ts, api.test.ts
```

## Interfaces

```ts
interface PreferenceStorage { get(key: "favorites" | "recent"): string[]; set(key, value: string[]): Promise<unknown> }
class Preferences { favorites(): string[]; isFavorite(id): boolean; toggleFavorite(id): Promise<boolean>; recent(): string[]; recordUse(id): Promise<void> }  // recent: newest first, unique, max 15

type LibraryCategoryId = "all" | "favorites" | "recent" | LoreframeTemplateCategory;
interface LibraryState { category: LibraryCategoryId; query: string; selectedId: string | null }
interface LibraryCard { id; name; description; icon; favorite; systemBadge: string | null; selected; searchText; previewHtml }
interface LibraryCategory { id: LibraryCategoryId; label; icon; count; active }
interface LibraryModel { categories: LibraryCategory[]; cards: LibraryCard[]; selected: LibraryCard | null; empty: "favorites" | "recent" | "category" | null; canInsert: boolean }
buildLibraryModel(input: { templates: LoreframeTemplateDefinition[]; favorites; recent; state; localize; renderPreview(id): string; canInsert: boolean }): LibraryModel
matchesQuery(searchText: string, query: string): boolean   // all whitespace-separated terms, case/diacritic-insensitive

class EditorTracker { track(view); untrack(view); markActive(view); active(): EditorView | null }
buildEditorTrackerPlugin({ Plugin, tracker }): Plugin

insertTemplateIntoView(view, templateId, deps: { templates; renderNew; parseHtml; stateModule; recordUse(id); notifyError(key) }): boolean
```

## Tasks (each: failing tests → implement → `npm run check`)

1. **Preferences.** toggle add/remove order; recent dedupe, newest first, cap 15; storage errors propagate (no silent catch); returns copies.
2. **Library model + search.** categories: All/Favorites/Recent always, then non-empty template categories in fixed order, counts; favorites/recent views filter and order (recent by recency, unknown ids dropped); system badge only for system templates; selection defaults to first card, keeps explicit selection if present in category, else first; empty states; `matchesQuery` over name/description/tags/aliases/category label; localized strings; preview rendered only for the selected card (lazy).
3. **Editor tracker + plugin.** focus marks active; destroyed/disconnected/non-editable views are skipped; most recently focused wins; untrack on destroy.
4. **insertTemplateIntoView + menu groups.** records recent only on success; uses definition.focusField; read-only refused; errors notified. Menu: Favorites and Recent groups first (only when non-empty, unknown ids skipped), library entry pins its editor.
5. **Window.** parts nav/browser/preview; actions selectCategory/selectTemplate/toggleFavorite/insert; search input debounced DOM filter + "no results" state; double-click and Enter insert selected; `aria-pressed`, `aria-current`, `aria-label`; insert disabled with hint when no editable editor.
6. **API.** `insertTemplate(templateId): boolean` into the active editor.
7. **Styles + live verification.** Light/Dark; widths 1000/760/480; long Russian labels; keyboard: Tab order, Enter, Escape; favorites/recent persist after reload; insert from library into open editor; console clean.
