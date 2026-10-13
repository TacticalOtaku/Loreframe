import { describe, expect, it } from "vitest";
import { TemplateRegistry } from "../src/core/template-registry";
import type { LoreframeTemplateDefinition } from "../src/types";

const deps = {
  hasRenderer: (id: string) => ["callout", "heading"].includes(id),
  hasPreset: (id: string) => ["editorial", "compact"].includes(id),
};

function def(overrides: Partial<LoreframeTemplateDefinition> = {}): LoreframeTemplateDefinition {
  return {
    id: "note",
    version: 1,
    name: "LOREFRAME.Template.Note.Name",
    category: "blocks",
    type: "block",
    renderer: "callout",
    ...overrides,
  };
}

function registry(): TemplateRegistry {
  return new TemplateRegistry(deps);
}

describe("TemplateRegistry", () => {
  it("registers, retrieves and unregisters templates", () => {
    const reg = registry();
    reg.register(def());
    expect(reg.has("note")).toBe(true);
    expect(reg.get("note")?.renderer).toBe("callout");
    expect(reg.unregister("note")).toBe(true);
    expect(reg.has("note")).toBe(false);
    expect(reg.get("note")).toBeUndefined();
    expect(reg.unregister("note")).toBe(false);
  });

  it("stores frozen copies so callers cannot mutate registered definitions", () => {
    const reg = registry();
    const source = def({ tags: ["a"] });
    reg.register(source);
    source.name = "changed";
    const stored = reg.get("note");
    expect(stored?.name).toBe("LOREFRAME.Template.Note.Name");
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored?.tags)).toBe(true);
  });

  it.each([
    [def({ id: "Bad Id" }), /id/],
    [def({ id: "" }), /id/],
    [def({ version: 0 }), /version/],
    [def({ version: 1.5 }), /version/],
    [def({ name: "" }), /name/],
    [def({ renderer: "unknown" }), /renderer/],
    [def({ presets: ["editorial", "neon"] }), /preset/],
    [def({ category: "misc" as never }), /category/],
    [def({ type: "widget" as never }), /type/],
    [
      def({
        fields: [
          { id: "title", type: "text", label: "x" },
          { id: "title", type: "text", label: "y" },
        ],
      }),
      /field/,
    ],
    [def({ fields: [{ id: "kind", type: "select", label: "x", options: [] }] }), /option/],
    [def({ focusField: "body", fields: [{ id: "title", type: "text", label: "x" }] }), /focus/],
  ])("rejects invalid definitions %#", (definition, message) => {
    expect(() => registry().register(definition)).toThrow(message);
  });

  it("rejects duplicate ids", () => {
    const reg = registry();
    reg.register(def());
    expect(() => reg.register(def())).toThrow(/already registered/);
  });

  it("lists by category and type in registration order", () => {
    const reg = registry();
    reg.register(def({ id: "note" }));
    reg.register(def({ id: "two-columns", category: "layouts", type: "layout", renderer: "heading" }));
    reg.register(def({ id: "lore" }));
    expect(reg.list().map((d) => d.id)).toEqual(["note", "two-columns", "lore"]);
    expect(reg.list({ category: "blocks" }).map((d) => d.id)).toEqual(["note", "lore"]);
    expect(reg.list({ type: "layout" }).map((d) => d.id)).toEqual(["two-columns"]);
  });

  it("filters system-specific templates by the active system", () => {
    const reg = registry();
    reg.register(def({ id: "agnostic" }));
    reg.register(def({ id: "explicit-null", system: null }));
    reg.register(def({ id: "npc-5e", system: "dnd5e" }));
    expect(reg.list({ systemId: "dnd5e" }).map((d) => d.id)).toEqual(["agnostic", "explicit-null", "npc-5e"]);
    expect(reg.list({ systemId: "pf2e" }).map((d) => d.id)).toEqual(["agnostic", "explicit-null"]);
  });
});

describe("TemplateRegistry slots", () => {
  const base = (overrides: Partial<LoreframeTemplateDefinition>): LoreframeTemplateDefinition => ({
    id: "columns",
    version: 1,
    name: "n",
    category: "layouts",
    type: "layout",
    renderer: "callout",
    ...overrides,
  });

  it("accepts declared slots and lets the focus target be a slot", () => {
    const reg = new TemplateRegistry(deps);
    reg.register(base({ slots: ["column-1", "column-2"], focusField: "column-1" }));
    expect(reg.get("columns")?.slots).toEqual(["column-1", "column-2"]);
  });

  it.each([
    [base({ slots: ["Bad Slot"] }), /slot/],
    [base({ slots: ["a", "a"] }), /slot/],
    [base({ slots: ["title"], fields: [{ id: "title", type: "text", label: "x" }] }), /slot/],
  ])("rejects invalid slots %#", (definition, message) => {
    expect(() => new TemplateRegistry(deps).register(definition)).toThrow(message);
  });
});

describe("TemplateRegistry field rules", () => {
  const base = (fields: LoreframeTemplateDefinition["fields"]): LoreframeTemplateDefinition => ({
    id: "fielded",
    version: 1,
    name: "n",
    category: "blocks",
    type: "block",
    renderer: "callout",
    fields,
  });

  it("requires lowercase field ids because HTML attribute names are case-insensitive", () => {
    expect(() =>
      new TemplateRegistry(deps).register(base([{ id: "imageSide", type: "text", label: "x" }])),
    ).toThrow(/field/);
  });

  it("accepts items fields and alt bindings to image fields", () => {
    const reg = new TemplateRegistry(deps);
    reg.register(
      base([
        { id: "image", type: "image", label: "x" },
        { id: "alt", type: "text", label: "x", imageAltFor: "image" },
        { id: "items", type: "items", label: "x" },
      ]),
    );
    expect(reg.has("fielded")).toBe(true);
  });

  it("rejects alt bindings that do not point at an image field", () => {
    expect(() =>
      new TemplateRegistry(deps).register(
        base([
          { id: "title", type: "text", label: "x" },
          { id: "alt", type: "text", label: "x", imageAltFor: "title" },
        ]),
      ),
    ).toThrow(/imageAltFor/);
  });

  it("accepts known inspector groups only", () => {
    const reg = new TemplateRegistry(deps);
    reg.register(
      base([
        { id: "name", type: "text", label: "x", inspectorGroup: "general" },
        { id: "show-notes", type: "boolean", label: "x", inspectorGroup: "sections" },
        { id: "density", type: "select", label: "x", options: ["a"], inspectorGroup: "style" },
      ]),
    );
    expect(() =>
      new TemplateRegistry(deps).register(
        base([{ id: "x", type: "text", label: "x", inspectorGroup: "misc" as "general" }]),
      ),
    ).toThrow(/inspectorGroup/);
  });
});
