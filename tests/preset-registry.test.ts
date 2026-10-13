import { describe, expect, it } from "vitest";
import { PresetRegistry, resolveValues } from "../src/core/preset-registry";
import type { LoreframeTemplateDefinition } from "../src/types";

const definition: LoreframeTemplateDefinition = {
  id: "npc",
  version: 1,
  name: "n",
  category: "npc",
  type: "block",
  renderer: "npc",
  presets: ["compact", "missing", "editorial"],
  fields: [
    { id: "name", type: "text", label: "l", defaultKey: "KEY.Name" },
    { id: "portrait", type: "select", label: "l", options: ["left", "right"], default: "left" },
    { id: "secrets", type: "boolean", label: "l", default: true },
  ],
};

const localize = (key: string) => `«${key}»`;

describe("PresetRegistry", () => {
  it("registers and lists presets in the template's declared order, skipping unknown ids", () => {
    const presets = new PresetRegistry();
    presets.register({ id: "editorial", name: "E" });
    presets.register({ id: "compact", name: "C" });
    expect(presets.get("compact")?.name).toBe("C");
    expect(presets.listFor(definition).map((p) => p.id)).toEqual(["compact", "editorial"]);
  });

  it("rejects invalid or duplicate presets", () => {
    const presets = new PresetRegistry();
    presets.register({ id: "editorial", name: "E" });
    expect(() => presets.register({ id: "editorial", name: "again" })).toThrow(/already/);
    expect(() => presets.register({ id: "Bad id", name: "x" })).toThrow(/id/);
    expect(() => presets.register({ id: "ok", name: "" })).toThrow(/name/);
  });
});

describe("resolveValues", () => {
  it("uses field defaults, localizing defaultKey", () => {
    expect(resolveValues(definition, null, {}, localize)).toEqual({
      name: "«KEY.Name»",
      portrait: "left",
      secrets: true,
    });
  });

  it("applies preset values over defaults and explicit values over both", () => {
    const preset = { id: "compact", name: "C", values: { portrait: "right", secrets: false } };
    expect(resolveValues(definition, preset, { secrets: true, name: "Arannis" }, localize)).toEqual({
      name: "Arannis",
      portrait: "right",
      secrets: true,
    });
  });

  it("drops unknown keys and values of the wrong type", () => {
    const values = resolveValues(
      definition,
      null,
      { unknown: "x", secrets: "yes", portrait: "up" },
      localize,
    );
    expect(values).toEqual({ name: "«KEY.Name»", portrait: "left", secrets: true });
  });
});

describe("resolveValues items", () => {
  const gallery: LoreframeTemplateDefinition = {
    id: "gallery",
    version: 1,
    name: "n",
    category: "gallery",
    type: "block",
    renderer: "gallery",
    fields: [
      {
        id: "items",
        type: "items",
        label: "l",
        default: [{ src: "a.webp", alt: "A", caption: "" }],
      },
    ],
  };

  it("accepts well-formed item lists and copies them", () => {
    const items = [{ src: "b.webp", alt: "B", caption: "Bee" }];
    const values = resolveValues(gallery, null, { items }, localize);
    expect(values.items).toEqual(items);
    expect(values.items).not.toBe(items);
  });

  it("falls back to the default for malformed lists", () => {
    const bad = [{ src: 5 }, "x"];
    expect(resolveValues(gallery, null, { items: bad }, localize).items).toEqual([
      { src: "a.webp", alt: "A", caption: "" },
    ]);
  });
});
