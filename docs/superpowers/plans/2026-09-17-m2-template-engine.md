# Loreframe M2 — Template Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple registered templates render, insert, parse and are identified after reload (spec §51 M2), with versioning, presets, unique instance ids and a safe migration foundation.

**Architecture:** Definitions are data (`LoreframeTemplateDefinition`, spec §9) that name a built-in renderer by id. Renderers return a typed element tree, never HTML strings; one serializer turns trees into HTML, enforcing an allow-list of tags/attributes/classes and the ProseMirror rule that containers hold no bare text. The renderer service wraps every tree in the durable root attributes (§10). The parser reads blocks back from DOM only through `data-loreframe-*`. Migrations transform a cloned element and leave the original untouched on any failure (§46–47). A small ProseMirror plugin re-issues instance ids for pasted/dropped copies.

**Tech Stack:** as M0/M1 (TypeScript 6.0, Vitest + happy-dom, real `prosemirror-*` in tests).

**Spec:** `F:\Downloads\LOREFRAME_DEVELOPMENT_SPEC.md` §8–11, §13, §33, §37–38, §43, §46–47, §51 M2.

## Verified Foundry 14.367 facts

- `client/applications/elements/prosemirror-editor.mjs` → `TextEditor.create({engine:"prosemirror", plugins})` → `ProseMirrorEditor.create` → `Hooks.callAll("createProseMirrorEditor", uuid, plugins, options)`; `plugins` is a mutable record — Journal editors pass through it.
- Global `ProseMirror` exports `Plugin`, `PluginKey` (legacy exports in `common/prosemirror/_module.mjs`), not `Slice`/`Fragment`.
- prosemirror-view marks paste/drop transactions with meta `uiEvent` = `"paste"` / `"drop"`.

## Global Constraints

Same as M0/M1 plan, plus:
- Templates are declarative; third parties may register definitions that reference built-in renderer ids only. No code in definitions (§9, §33).
- Serializer allow-list — tags: `aside div section header footer article figure figcaption h1–h6 p hr img blockquote ul ol li`; attributes: `data-loreframe-*`, `data-no-toc`, `alt`, `src` (http/https/relative only), `role`, `aria-*`; classes: `loreframe…` only.
- Unknown, newer or malformed blocks are never modified or removed.
- New hook only with a concrete use: `loreframeRegisterTemplates(api)` at `init` so other modules can register.

## File Structure

```text
src/types.ts                              definition, field, preset, element-tree, parsed-block types
src/core/element-tree.ts                  serializeTree() with allow-list validation
src/core/template-registry.ts             TemplateRegistry
src/core/preset-registry.ts               PresetRegistry + resolveValues() merge
src/core/renderer-registry.ts             built-in renderer lookup
src/core/template-renderer.ts             TemplateRenderer.render()
src/core/template-parser.ts               parseBlocks()
src/core/migration-service.ts             MigrationService.migrateHtml()
src/core/loreframe-core.ts                createCore(): wires the above; used by main/api/menu
src/content-templates/basic/callout.ts    callout renderer + note/lore/warning definitions (replaces M1 renderCallout)
src/content-templates/basic/heading.ts    heading renderer + definition (title + subtitle)
src/content-templates/basic/divider.ts    divider renderer + definition
src/content-templates/index.ts            registerBuiltIns(core)
src/editor/instance-id-plugin.ts          appendTransaction plugin for duplicate ids
src/editor/node-attrs.ts                  + setHtmlAttribute()
src/editor/menu.ts                        entries generated from the registry
src/api.ts                                + registerTemplate / unregisterTemplate / registerPreset
styles/templates/_heading.scss, _divider.scss
tests/element-tree.test.ts, template-registry.test.ts, preset-registry.test.ts,
tests/template-renderer.test.ts, template-parser.test.ts, migration-service.test.ts,
tests/instance-id-plugin.test.ts, menu.test.ts (updated), callout.test.ts (updated), api.test.ts
```

## Interfaces

```ts
// src/types.ts
export type LoreframeTemplateCategory = "blocks" | "layouts" | "npc" | "locations" | "wiki" | "gallery" | "campaign" | "system";
export type LoreframeTemplateType = "block" | "layout" | "page";
export type FieldType = "text" | "richText" | "image" | "select" | "boolean";
export interface LoreframeTemplateField { id: string; type: FieldType; label: string; defaultKey?: string; default?: string | boolean; options?: string[] }
export interface LoreframeTemplateDefinition {
  id: string; version: number; name: string; description?: string;
  category: LoreframeTemplateCategory; type: LoreframeTemplateType;
  icon?: string; thumbnail?: string;
  renderer: string; rendererOptions?: Record<string, string | number | boolean>;
  fields?: LoreframeTemplateField[]; presets?: string[]; system?: string | null;
  tags?: string[]; aliases?: string[];
}
export interface LoreframePresetDefinition { id: string; name: string; values?: Record<string, string | boolean> }
export type TemplateValues = Record<string, string | boolean>;
export type TreeChild = TreeElement | string;
export interface TreeElement { tag: string; classes?: string[]; field?: string; attrs?: Record<string, string>; children?: TreeChild[] }
export interface RenderContext { definition: LoreframeTemplateDefinition; values: TemplateValues; preset: string | null }
export type TemplateRendererFn = (ctx: RenderContext) => TreeElement;
export type BlockStatus = "current" | "outdated" | "newer" | "unknown" | "invalid";
export interface ParsedBlock { element: Element; templateId: string; version: number | null; instanceId: string | null; preset: string | null; status: BlockStatus; fields: Map<string, Element> }

// core
serializeTree(tree: TreeElement): string                                   // throws LoreframeMarkupError
class TemplateRegistry { register(def, {hasRenderer, hasPreset}); unregister(id): boolean; get(id); has(id); list(filter?: {category?; type?; systemId?: string}): Def[] }
class PresetRegistry { register(p); get(id); listFor(def): Preset[] }
resolveValues(def, preset | null, explicit: TemplateValues, localize): TemplateValues   // field defaults < preset values < explicit
class TemplateRenderer { render(templateId, {instanceId, preset?, values?}): string }
parseBlocks(root: ParentNode, registry: Pick<TemplateRegistry,"get">): ParsedBlock[]
interface TemplateMigration { templateId: string; from: number; migrate(el: Element): void }  // produces from+1
class MigrationService { register(m); migrateHtml(html): { html: string; changed: boolean; issues: MigrationIssue[] } }
createCore({ localize, newInstanceId, systemId }): LoreframeCore
buildInstanceIdPlugin({ Plugin, newInstanceId }): Plugin
setHtmlAttribute(node, name, value): Record<string, unknown>   // returns new attrs
```

## Tasks (each: failing tests → implement → `npm run check`)

1. **Types + element-tree serializer.** Tests: escapes text/attrs; rejects unknown tag, `on*`/`style`/`href` attrs, `javascript:` and `data:` src, non-`loreframe` classes, bare text in containers; `field` → `data-loreframe-field`.
2. **TemplateRegistry.** Tests: register/get/has/unregister; rejects bad id, non-integer version, missing renderer, unknown preset, duplicate id; list by category/type; system filter (`null` always, `"dnd5e"` only when systemId matches); returned definitions are frozen copies.
3. **PresetRegistry + resolveValues.** Tests: register/get; `listFor` honours `definition.presets` order and skips unknown; merge precedence; `defaultKey` localized; unknown value keys dropped.
4. **Renderers + TemplateRenderer + built-ins (note/lore/warning/heading/divider).** Tests: root carries class `loreframe-block loreframe-<id>`, template/version/instance/preset attrs; preset class `loreframe-preset--<id>`; invalid instance id rejected; unknown template throws; callout labels keep `data-no-toc`; every built-in parses cleanly through the test ProseMirror schema and round-trips.
5. **Parser.** Tests: finds blocks in document order; statuses current/outdated/newer/unknown/invalid; fields map excludes nested blocks' fields; ignores class-only look-alikes.
6. **MigrationService.** Tests: chain 1→2→3 applied in order and version attr updated; missing step → original html unchanged + issue; throwing step → unchanged + issue + logged; unknown/newer blocks untouched; `changed:false` returns the input string identical.
7. **Instance-id plugin.** Tests: pasted copy of existing block gets new id while original keeps its id (also when pasted before the original); non-paste transactions untouched; two blocks pasted with same id both renamed apart from original.
8. **Core wiring, menu from registry, API, hook.** Tests: menu entries generated from registry (`blocks` → Quick Blocks, `layouts` → Layouts, `page` → Structures; empty groups omitted; depth ≤ 2); API register/unregister/registerPreset delegates and rejects invalid input; `loreframeRegisterTemplates` receives the api.
9. **Live verification.** Deploy → reload → insert Note, Heading, Divider → copy/paste a block (new id) → save → F5 → `parseBlocks` on page content identifies all blocks → old `callout` block from M1 stays intact as `unknown` → Light/Dark, narrow → console clean.
