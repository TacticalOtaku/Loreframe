# Loreframe M9 — dnd5e Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dnd5e Actor data produces a Loreframe NPC card or dossier (snapshot), chosen when an Actor is dropped into a
Journal editor, without dnd5e knowledge in core code (spec §34, §35, §37, §51 M9).

**Architecture:**
- *Adapter boundary* (`src/integrations/types.ts`): `LoreframeSystemAdapter {id, systemId, documentTypes, canHandle,
  getNpcData}` returning system-neutral `LoreframeNpcData`. Public API: `registerSystemAdapter`.
- *Integration manager* (`src/integrations/integration-manager.ts`): the only place that compares the active game
  system; honours the world setting `enableIntegrations`; isolates adapter errors.
- *Mapping* (`src/integrations/npc-values.ts`, pure): `LoreframeNpcData` → NPC template values. Snapshot only; a
  content link to the source Actor is included. Empty data never becomes placeholder text; empty dossier sections
  are switched off. Private (GM) text only ever goes into the dossier's Foundry secret.
- *dnd5e adapter* (`src/integrations/dnd5e/`): reads `system.details` (type label, species, alignment, CR,
  ideal/bond/flaw, character appearance/trait, public/private biography) and class levels; HTML → plain text.
- *Drop flow*: a ProseMirror `handleDrop` plugin placed **before** Foundry's `contentLinks` plugin (which is added
  before `createProseMirrorEditor`) claims drops whose document type an active adapter handles. A DialogV2 offers
  "Foundry link / NPC Card / NPC Dossier" (link is the default, last choice remembered for the session). Documents
  the adapter cannot map fall back to Foundry's standard link.

**Spec:** §34–§37, §44, §51 M9.

## Verified facts

- `client/applications/ux/prosemirror-editor.mjs:212–226`: `contentLinks` is set before the hook; plugins run in
  `Object.values(plugins)` order.
- `common/prosemirror/content-link-plugin.mjs`: `TextEditor.getDragEventData`, `TextEditor.getContentLink(data)`.
- dnd5e 5.3.3 `NPCData`/`CharacterData`: `details.{biography.{value,public}, alignment, ideal, bond, flaw, race,
  type(label), cr}`; characters add `details.{appearance, trait}`; `dnd5e.utils.formatCR`.
- `DialogV2.wait({buttons, content})` resolves the button callback result or null when dismissed.

## Tasks (each: failing tests → implement → `npm run check`)

1. Adapter types, integration manager, `registerSystemAdapter`.
2. HTML → text and NPC value mapping.
3. dnd5e adapter against fake actors shaped like dnd5e 5.3.3 data.
4. Drop plugin (ordering, claiming rules) and insertion at a document position.
5. Drop flow with the choice dialog; wiring in `main.ts`.
6. Live: drop an NPC from the sidebar and from a compendium; link / card / dossier; GM biography only in the
   secret; setting off → Foundry default; other document types untouched; undo; console.
