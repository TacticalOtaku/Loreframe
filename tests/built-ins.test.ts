import { describe, expect, it } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { BUILT_IN_TEMPLATES } from "../src/content-templates";
import { insertBlockTransaction } from "../src/editor/insert";
import en from "../lang/en.json";
import ru from "../lang/ru.json";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const SPEC_BLOCKS = [
  "heading",
  "subtitle",
  "divider",
  "quote",
  "read-aloud",
  "note",
  "warning",
  "lore",
  "gm-note",
  "secret",
  "image-text",
  "hero-image",
  "key-value",
  "tags",
  "stats-row",
  "gallery",
];
const SPEC_NPC = ["npc-card", "npc-dossier"];
const SPEC_LAYOUTS = [
  "two-columns",
  "columns-narrow-wide",
  "columns-wide-narrow",
  "three-columns",
  "sidebar-left",
  "sidebar-right",
  "hero-content",
  "media-content",
  "card-grid",
];

function lookup(lang: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], lang);
}

function attr(node: PMNode, name: string): string | undefined {
  return (node.attrs._preserve as Record<string, string> | undefined)?.[name];
}

describe("built-in templates", () => {
  it("cover the spec §17 blocks and layouts and the §20 NPC structures", () => {
    const blocks = BUILT_IN_TEMPLATES.filter((t) => t.type === "block" && t.category !== "npc").map(
      (t) => t.id,
    );
    expect(BUILT_IN_TEMPLATES.filter((t) => t.category === "npc").map((t) => t.id)).toEqual(SPEC_NPC);
    const layouts = BUILT_IN_TEMPLATES.filter((t) => t.type === "layout").map((t) => t.id);
    expect(blocks).toEqual(SPEC_BLOCKS);
    expect(layouts).toEqual(SPEC_LAYOUTS);
  });

  it.each(BUILT_IN_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s has English and Russian copy",
    (_id, def) => {
      const keys = [
        def.name,
        def.description ?? "",
        ...(def.fields ?? []).flatMap((f) => [
          f.label,
          ...(f.defaultKey ? [f.defaultKey] : []),
          ...(f.type === "select" ? (f.options ?? []).map((o) => `LOREFRAME.Option.${f.id}.${o}`) : []),
        ]),
      ];
      for (const key of keys) {
        expect(typeof lookup(en, key), key).toBe("string");
        expect(typeof lookup(ru, key), key).toBe("string");
      }
    },
  );

  describe.each(BUILT_IN_TEMPLATES.map((t) => [t.id] as const))("%s", (id) => {
    const core = testCore({ localize: (key) => `‹${key.split(".").at(-1)}›` });
    const definition = core.templates.get(id)!;
    const html = core.renderer.render(id, { instanceId: "x1" });
    const doc = parseString(html);

    it("parses into one top-level node and round-trips unchanged", () => {
      expect(doc.childCount).toBe(1);
      const once = serializeString(doc);
      expect(serializeString(parseString(once))).toBe(once);
      expect(once).toContain(`data-loreframe-template="${id}"`);
    });

    it("is hidden in a Foundry secret exactly when it is GM-only", () => {
      expect(doc.firstChild!.type.name === "secret").toBe(Boolean(definition.secret));
    });

    it("marks every declared slot and field it renders", () => {
      const slots: string[] = [];
      doc.descendants((node) => {
        const slot = attr(node, "data-loreframe-slot");
        if (slot) slots.push(slot);
      });
      expect(slots).toEqual([...(definition.slots ?? [])]);
    });

    it("selects its focus target after insertion", () => {
      const state = EditorState.create({ doc: parseString("<p>Before</p>") });
      const start = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7)));
      const next = start.apply(
        insertBlockTransaction(start, doc.firstChild!, pmState, { focusField: definition.focusField }),
      );
      const { $from } = next.selection;
      if (!definition.focusField) {
        expect(next.selection.from).toBeGreaterThan(7);
        return;
      }
      let inTarget = false;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        const name = attr(node, "data-loreframe-field") ?? attr(node, "data-loreframe-slot");
        if (name === definition.focusField) inTarget = true;
      }
      expect(inTarget).toBe(true);
      expect(next.selection.empty).toBe($from.parent.content.size === 0);
    });
  });
});

describe("built-in presets", () => {
  it.each(["editorial", "minimal", "arcane", "bestiary"])("%s is registered with copy", (id) => {
    const preset = testCore().presets.get(id)!;
    expect(typeof lookup(en, preset.name)).toBe("string");
    expect(typeof lookup(ru, preset.name)).toBe("string");
  });
});

describe("image fields", () => {
  it("survive Foundry's image prompt replacing the <img> node", () => {
    // common/prosemirror/menu.mjs _insertImagePrompt: select the image, then replaceSelectionWith(new image node).
    const core = testCore();
    const doc = parseString(core.renderer.render("image-text", { instanceId: "i1" }));
    let imagePos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "image") imagePos = pos;
    });
    const state = EditorState.create({ doc });
    const selected = state.apply(state.tr.setSelection(pmState.NodeSelection.create(state.doc, imagePos)));
    const replaced = selected.apply(
      selected.tr.replaceSelectionWith(
        state.schema.nodes.image!.create({ src: "worlds/art/keep.webp", alt: "Keep" }),
      ),
    );
    const html = serializeString(replaced.doc);
    expect(html).toContain(
      '<div data-loreframe-field="image" class="loreframe-media__image"><img src="worlds/art/keep.webp" alt="Keep"></div>',
    );
  });
});
