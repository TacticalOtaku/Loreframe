# Loreframe M4 — Base Components & Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The spec §17 basic blocks and layout structures exist as production-quality templates that work in both themes and collapse gracefully in narrow Journal windows (spec §51 M4).

**Architecture:** Every template is data + a small renderer returning an element tree. Layout regions are slots (`data-loreframe-slot`) that accept other blocks; content regions are fields. Layouts use `flex-wrap` with per-column flex bases, so columns stack by themselves when the Journal is narrow — no viewport or container queries needed. GM-only templates are wrapped in a plain Foundry secret section outside the block root, because Foundry's reveal toggle rewrites the secret's opening tag.

**Spec:** §17, §22, §27–30, §39, §51 M4.

## Verified Foundry 14.367 facts

- `common/prosemirror/schema/secret-node.mjs`: `section.secret`, `content: "block+"`, id generated on parse when missing, `id` managed.
- `client/applications/elements/secret-block.mjs` `toggleRevealed`: finds the secret with `/<section[^i]+id="ID"[^>]*>/` and replaces the whole opening tag with `<section class="secret[ revealed]" id="ID">` → a secret must carry no other attributes (an `i` before `id` breaks the match; anything else is erased).
- `client/applications/ux/text-editor.mjs` `enrichHTML`: `secrets: false` removes `section.secret:not(.revealed)` — Journal page view passes `secrets: page.isOwner`.
- `schema/image-node.mjs`: `img[src]` is a block node; the menu's image prompt replaces the selected image with a new node (captured attributes lost) → image fields are a container element around the `img`.
- `schema/tables.mjs`: `tableNodes({ tableGroup: "block", cellContent: "block+" })` → cell text in `<p>`.
- `schema/lists.mjs`: `li` content is `paragraph block*`.

## Global Constraints

As M0–M3. Plus: no new colour literals outside `_tokens.scss`; ornaments via CSS; every image has alt text; placeholder text localized; no container/viewport queries inside Journal content.

## File Structure

```text
src/types.ts                               + definition `slots`, `secret`; TreeElement `slot`
src/core/element-tree.ts                   + table tags, figure rules
src/core/template-registry.ts              + slots validation; focusField may name a slot
src/core/template-renderer.ts              + secret wrapper; RenderContext.localize
src/editor/insert.ts                       focus slot; secret wrapper counts as the block
src/editor/node-attrs.ts                   + isSecretWrapper()
src/editor/block-integrity-plugin.ts       + unique secret ids for copies
src/content-templates/shared.ts            + image(), slot(), labelHeading() helpers
src/content-templates/basic/*.ts           callout (+read-aloud, gm-note, secret), subtitle, quote,
                                           image-text, hero-image, key-value, tags, stats-row
src/content-templates/layouts/*.ts         columns (halves, 33/66, 66/33, thirds, sidebars),
                                           hero-content, media-content, card-grid
assets/placeholders/image.svg              neutral image placeholder
styles/templates/_*.scss                   one partial per component family
lang/*.json                                template names, descriptions, placeholders
tests/…                                    renderer/serializer/registry/insert/plugin updates
```

## Tasks

1. **Infrastructure** (tests first): serializer table tags + slot rules; registry `slots` and focusField-over-slots; renderer `secret` wrapper (no attributes besides `class="secret"`); `RenderContext.localize`; insertion treats a secret wrapper whose only child is a block root as the block; plugin renames duplicated secret ids on paste/drop.
2. **Basic blocks**: subtitle, quote, read-aloud, gm-note, secret, image-text, hero-image, key-value, tags, stats-row — each round-trips through the test schema, has localized defaults, a focus target, and no bare text in containers.
3. **Layouts**: columns family, hero-content, media-content, card-grid — slots declared, placeholder paragraphs, focus on the first slot.
4. **Styles**: component partials, read-aloud frame, secret wrapper integration, flex-wrap layouts, image placeholder, table styling, tags; light/dark.
5. **Live verification**: insert every template, save, reload; secret hidden from a non-owner render (`enrichHTML` with `secrets:false`) and Reveal toggles while the block keeps its attributes; image replaced via Foundry's image prompt keeps the field; table rows added via Foundry's table menu; narrow Journal (360 px) stacks columns; both themes; console clean.
