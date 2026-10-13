# Loreframe M5 — Gallery, Block Toolbar & Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gallery works as the first complex nested structure (modes, add/remove/reorder, captions, alt text, responsive) and survives editing and reload (spec §51 M5). Its image management needs the contextual block toolbar (§23) and the block inspector (§24), so both arrive here and work for every template.

**Architecture:**
- *Block document* (pure ProseMirror helpers): find a block by instance id or by cursor; read its property values back from the document; rebuild it by rendering the template with new values and **grafting** author content (rich-text fields and slots) from the old block, so property edits never destroy writing; duplicate and delete as single transactions.
- *Values*: select/boolean options are stored on the block root as `data-loreframe-opt-<field>`; image fields read `src` from the field's `<img>`; a text field may bind to an image's `alt`; gallery items are a new `items` value type (`{src, alt, caption}[]`).
- *Toolbar*: a ProseMirror plugin view renders a compact bar next to the block that holds the selection (Edit, Duplicate, Delete); it lives in the `<prose-mirror>` element, never inside the editable DOM.
- *Inspector*: an ApplicationV2 form built from a pure model (definition + values → sections), using Foundry's `<file-picker>` element; Apply re-reads the block, overlays only changed values, and dispatches one transaction to the same editor.

**Spec:** §18, §23, §24, §31, §42, §44, §47, §51 M5.

## Verified Foundry 14.367 facts

- `client/applications/apps/file-picker.mjs`: `new FilePicker.implementation({ type: "image", current, callback }).browse()`; `client/applications/elements/file-picker.mjs`: `<file-picker name type value>` form element.
- `client/applications/elements/prosemirror-editor.mjs`: `<prose-mirror>` contains `div.editor-content` (the EditorView DOM).
- `schema/other.mjs` `figure`: `image? figcaption? block*`; `figcaption`: `inline+` (no empty captions).
- Image clicks in Journal view mode are handled by Foundry (image popout), so no custom lightbox is needed.

## Global Constraints

As M0–M4. Plus: the toolbar exists only while a block is selected and never inside `view.dom`; all toolbar/inspector labels localized with `aria-label`s; inspector does not edit rich text (§24); edits require `view.editable` (§44); nothing is written if the block vanished while the inspector was open (user notified).

## Tasks (each: failing tests → implement → `npm run check`)

1. **Values & options**: `items` field type and validation; root `data-loreframe-opt-*`; `imageAltFor` binding; serializer allows `figure`/`figcaption` structure for gallery items.
2. **Gallery template**: modes uniform/portrait/landscape/feature/captioned; items field; empty caption omitted; placeholder items; styles.
3. **Block document**: find/enclosing, read values (text, image, alt binding, options, items), graft rebuild (keeps rich text, slots, instance id, secret id), duplicate (fresh identities), delete (including secret wrapper).
4. **Toolbar plugin**: shows for the enclosing block, hides otherwise; buttons call callbacks with view + instance id; keyboard reachable; destroyed with the view.
5. **Inspector**: pure form model (sections General/Options/Items), form parsing, item add/remove/move; ApplicationV2 window; Apply/Cancel; stale-block handling.
6. **Wiring + live verification**: insert gallery; add/reorder/remove images via inspector with FilePicker; captions/alt; switch modes; edit Note title via inspector keeps body text; duplicate/delete from toolbar; save/reload; narrow width; both themes; console clean.
