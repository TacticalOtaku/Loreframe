import { describe, expect, it } from "vitest";
import {
  addItems,
  buildInspectorModel,
  changedValues,
  moveItem,
  readInspectorForm,
  addLinks,
  readPresetForm,
  removeItem,
  sectionsToRemove,
} from "../src/applications/block-inspector/inspector-model";
import { testCore } from "./helpers/core";

const core = testCore();
const def = (id: string) => core.templates.get(id)!;

describe("buildInspectorModel", () => {
  it("groups text and image fields under General and options under Options", () => {
    const model = buildInspectorModel(def("image-text"), {
      image: "worlds/map.webp",
      alt: "Map",
      side: "right",
    });
    expect(model.sections.map((s) => [s.id, s.fields.map((f) => f.id)])).toEqual([
      ["general", ["image", "alt"]],
      ["options", ["side"]],
    ]);
    const side = model.sections[1]!.fields[0]!;
    expect(side).toMatchObject({ type: "select", value: "right" });
    expect(side.options).toEqual([
      { value: "left", label: "LOREFRAME.Option.side.left" },
      { value: "right", label: "LOREFRAME.Option.side.right" },
    ]);
    expect(model.lists).toEqual([]);
  });

  it("leaves rich-text fields out: they are edited in the Journal", () => {
    const model = buildInspectorModel(def("note"), { title: "Title" });
    expect(model.sections.flatMap((s) => s.fields.map((f) => f.id))).toEqual(["title"]);
    expect(model.richTextHint).toBe(true);
  });

  it("describes gallery items with preview sources", () => {
    const model = buildInspectorModel(def("gallery"), {
      mode: "feature",
      items: [
        { src: "a.webp", alt: "A", caption: "Cap" },
        { src: "", alt: "Empty", caption: "" },
      ],
    });
    const [list] = model.lists;
    expect(list).toMatchObject({ fieldId: "items", kind: "images", label: "LOREFRAME.Field.Images" });
    expect(list!.images.map((e) => [e.index, e.src, e.preview, e.first, e.last])).toEqual([
      [0, "a.webp", "a.webp", true, false],
      [1, "", "modules/loreframe/assets/placeholders/image.svg", false, true],
    ]);
  });

  it("reports that a template has nothing to configure", () => {
    const model = buildInspectorModel(def("tags"), {});
    expect(model.sections).toEqual([]);
    expect(model.empty).toBe(true);
  });
});

describe("readInspectorForm", () => {
  it("reads declared fields with their types and rebuilds the item list", () => {
    const values = readInspectorForm(def("gallery"), {
      mode: "captioned",
      "items.0.src": "a.webp",
      "items.0.alt": " A ",
      "items.0.caption": "One",
      "items.1.src": "b.webp",
      "items.1.alt": "B",
      "items.1.caption": "",
      stray: "ignored",
    });
    expect(values).toEqual({
      mode: "captioned",
      items: [
        { src: "a.webp", alt: "A", caption: "One" },
        { src: "b.webp", alt: "B", caption: "" },
      ],
    });
  });

  it("reads booleans and ignores select values outside the options", () => {
    const definition = {
      ...def("divider"),
      fields: [...(def("divider").fields ?? []), { id: "compact", type: "boolean" as const, label: "x" }],
    };
    expect(readInspectorForm(definition, { style: "neon", compact: true })).toEqual({ compact: true });
    expect(readInspectorForm(definition, { style: "line" })).toEqual({ style: "line", compact: false });
  });
});

describe("changedValues", () => {
  it("keeps only values that differ, comparing item lists deeply", () => {
    const items = [{ src: "a", alt: "A", caption: "" }];
    expect(
      changedValues(
        { title: "T", side: "left", items },
        { title: "T", side: "right", items: [{ ...items[0]! }] },
      ),
    ).toEqual({ side: "right" });
    expect(changedValues({ items }, { items: [] })).toEqual({ items: [] });
  });
});

describe("item operations", () => {
  const items = [
    { src: "a", alt: "", caption: "" },
    { src: "b", alt: "", caption: "" },
    { src: "c", alt: "", caption: "" },
  ];

  it("moves items within bounds", () => {
    expect(moveItem(items, 0, 1).map((i) => i.src)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 2, 1).map((i) => i.src)).toEqual(["a", "b", "c"]);
    expect(moveItem(items, 0, -1)).toBe(items);
  });

  it("removes items and adds new ones with an alt text derived from the file name", () => {
    expect(removeItem(items, 1).map((i) => i.src)).toEqual(["a", "c"]);
    expect(addItems(items, ["worlds/art/Old%20Keep_north-gate.webp"]).at(-1)).toEqual({
      src: "worlds/art/Old%20Keep_north-gate.webp",
      alt: "Old Keep north gate",
      caption: "",
    });
  });
});

describe("inspector groups and presets", () => {
  const presets = core.presets.listFor(def("npc-dossier"));

  it("groups NPC fields as General, Sections and Style, with the preset first in Style", () => {
    const model = buildInspectorModel(
      def("npc-card"),
      { name: "Vel", "show-notes": false, portrait: "top", density: "compact" },
      { preset: "arcane", presets },
    );
    expect(model.sections.map((s) => [s.id, s.label, s.fields.map((f) => f.id)])).toEqual([
      [
        "general",
        "LOREFRAME.Inspector.General",
        ["name", "ancestry", "occupation", "image", "alt", "personality", "goal", "location"],
      ],
      ["sections", "LOREFRAME.Inspector.Sections", ["show-notes"]],
      ["style", "LOREFRAME.Inspector.Style", ["_preset", "portrait", "density"]],
    ]);
    const style = model.sections[2]!.fields;
    expect(style[0]).toMatchObject({
      type: "select",
      label: "LOREFRAME.Inspector.Preset",
      value: "arcane",
      options: presets.map((p) => ({ value: p.id, label: p.name })),
    });
    expect(model.sections[1]!.fields[0]).toMatchObject({ type: "boolean", value: false });
  });

  it("offers no preset choice when a template has fewer than two presets", () => {
    const model = buildInspectorModel(def("image-text"), {}, { preset: null, presets: [] });
    expect(model.sections.flatMap((s) => s.fields.map((f) => f.id))).not.toContain("_preset");
  });

  it("reads the chosen preset only when the template offers it", () => {
    expect(readPresetForm({ _preset: "minimal" }, presets)).toBe("minimal");
    expect(readPresetForm({ _preset: "unknown" }, presets)).toBeNull();
    expect(readPresetForm({}, presets)).toBeNull();
    expect(readInspectorForm(def("npc-card"), { _preset: "minimal", name: "A" })).toEqual({
      name: "A",
      "show-notes": false,
    });
  });

  it("lists written sections that an edit switches off", () => {
    const original = { "show-voice": true, "show-fears": true, "show-goals": false };
    const edited = { "show-voice": false, "show-fears": false, "show-goals": false };
    expect(sectionsToRemove(def("npc-dossier"), original, edited, ["fears", "goals", "notes"])).toEqual([
      "fears",
    ]);
    expect(sectionsToRemove(def("npc-dossier"), original, { "show-voice": true }, ["voice"])).toEqual([]);
  });
});

describe("inspector link lists", () => {
  const def = (id: string) => core.templates.get(id)!;
  const poi = [
    { uuid: "Scene.s1", label: "Harbour", note: "Dock" },
    { uuid: "", label: "Lighthouse", note: "" },
  ];

  it("describes every links field as its own list, in field order", () => {
    const model = buildInspectorModel(def("location"), { poi, npcs: [], factions: [] });
    expect(model.lists.map((l) => [l.fieldId, l.kind, l.links.length])).toEqual([
      ["poi", "links", 2],
      ["npcs", "links", 0],
      ["factions", "links", 0],
    ]);
    expect(model.lists[0]!.links.map((e) => [e.index, e.uuid, e.linked, e.first, e.last])).toEqual([
      [0, "Scene.s1", true, true, false],
      [1, "", false, false, true],
    ]);
  });

  it("reads link rows from the form and trims them", () => {
    const values = readInspectorForm(def("location"), {
      "poi.0.uuid": " Scene.s1 ",
      "poi.0.label": "Harbour",
      "poi.0.note": "Dock ",
      "npcs.0.uuid": "",
      "npcs.0.label": "",
      "npcs.0.note": "",
    });
    expect(values.poi).toEqual([{ uuid: "Scene.s1", label: "Harbour", note: "Dock" }]);
    // Rows left completely empty are dropped instead of rendering blank entries.
    expect(values.npcs).toEqual([]);
    expect(values.factions).toEqual([]);
  });

  it("adds dropped documents once, labelled with their names", () => {
    const next = addLinks(poi, [
      { uuid: "Actor.a1", label: "Mira" },
      { uuid: "Scene.s1", label: "Harbour again" },
    ]);
    expect(next).toEqual([...poi, { uuid: "Actor.a1", label: "Mira", note: "" }]);
    expect(addLinks([], [{ uuid: "", label: "" }])).toEqual([{ uuid: "", label: "", note: "" }]);
  });
});
