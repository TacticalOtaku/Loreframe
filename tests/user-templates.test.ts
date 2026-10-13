import { describe, expect, it, vi } from "vitest";
import {
  configurableFields,
  EXPORT_FORMAT,
  sanitizeUserTemplate,
  USER_TEMPLATE_LIMIT,
  UserTemplateStore,
  type UserTemplate,
} from "../src/core/user-templates";
import { testCore } from "./helpers/core";

const core = testCore();
const deps = { templates: core.templates, presets: core.presets };

const merchant = {
  schemaVersion: 1,
  id: "user-merchant",
  name: "Merchant NPC",
  description: "Shopkeepers",
  base: "npc-dossier",
  preset: "minimal",
  values: { "show-rumours": false, "show-fears": false, portrait: "right" },
};

function store(initial: unknown = []) {
  let saved: unknown = initial;
  let n = 0;
  const write = vi.fn(async (value: unknown) => {
    saved = value;
  });
  const s = new UserTemplateStore({ ...deps, read: () => saved, write, newId: () => `id${++n}` });
  return { s, write, saved: () => saved as UserTemplate[] };
}

describe("configurableFields", () => {
  it("offers only option and section fields", () => {
    expect(configurableFields(core.templates.get("npc-card")!).map((f) => f.id)).toEqual([
      "show-notes",
      "portrait",
      "density",
    ]);
    expect(configurableFields(core.templates.get("gallery")!).map((f) => f.id)).toEqual(["mode"]);
  });
});

describe("sanitizeUserTemplate", () => {
  it("accepts the spec §33 shape and keeps only valid configuration", () => {
    const result = sanitizeUserTemplate(
      { ...merchant, values: { ...merchant.values, portrait: "sideways", name: "Bob", extra: 1 } },
      deps,
    );
    expect(result).toEqual({
      ...merchant,
      values: { "show-rumours": false, "show-fears": false },
    });
  });

  it.each([
    ["schema version", { ...merchant, schemaVersion: 2 }],
    ["id", { ...merchant, id: "merchant" }],
    ["id characters", { ...merchant, id: "user-<b>" }],
    ["empty name", { ...merchant, name: "   " }],
    ["long name", { ...merchant, name: "x".repeat(81) }],
    ["unknown base", { ...merchant, base: "nope" }],
    ["unsupported preset", { ...merchant, preset: "bestiary-x" }],
    ["values type", { ...merchant, values: [] }],
    ["not an object", "merchant"],
  ])("rejects an invalid %s", (_label, raw) => {
    expect(sanitizeUserTemplate(raw, deps)).toBeNull();
  });

  it("treats names as plain text and trims them", () => {
    const result = sanitizeUserTemplate({ ...merchant, name: "  <b>Merchant</b>\u0007 " }, deps);
    expect(result?.name).toBe("<b>Merchant</b>");
    expect(sanitizeUserTemplate({ ...merchant, preset: null }, deps)?.preset).toBeNull();
  });
});

describe("UserTemplateStore", () => {
  it("lists only valid stored templates", () => {
    const { s } = store([merchant, { ...merchant, id: "user-broken", base: "gone" }, 42]);
    expect(s.list().map((t) => t.id)).toEqual(["user-merchant"]);
    expect(s.get("user-merchant")?.name).toBe("Merchant NPC");
    expect(s.get("user-broken")).toBeUndefined();
    expect(store("garbage").s.list()).toEqual([]);
  });

  it("creates, updates, duplicates and removes templates with generated ids", async () => {
    const { s, saved } = store();
    const created = await s.create({
      base: "npc-card",
      name: "Guard",
      preset: "bestiary",
      values: { density: "compact", "show-notes": false },
    });
    expect(created).toMatchObject({ id: "user-id1", schemaVersion: 1, base: "npc-card", description: "" });
    expect(saved()).toHaveLength(1);

    const renamed = await s.update(created.id, { name: "City Guard", values: { density: "comfortable" } });
    expect(renamed).toMatchObject({
      name: "City Guard",
      values: { density: "comfortable" },
      preset: "bestiary",
    });

    const copy = await s.duplicate(created.id, "City Guard (copy)");
    expect(copy).toMatchObject({ id: "user-id2", name: "City Guard (copy)", base: "npc-card" });
    expect(s.list().map((t) => t.id)).toEqual(["user-id1", "user-id2"]);

    expect(await s.remove("user-id1")).toBe(true);
    expect(await s.remove("user-id1")).toBe(false);
    expect(saved().map((t) => t.id)).toEqual(["user-id2"]);
  });

  it("keeps stored templates it cannot use now when it saves others", async () => {
    // The base may only be missing for a while (a module disabled, an older Loreframe).
    const broken = { ...merchant, id: "user-broken", base: "gone" };
    const { s, saved } = store([broken, merchant]);
    await s.create({ base: "note", name: "Note", preset: null, values: {} });
    await s.update("user-merchant", { name: "Trader" });
    expect(await s.remove("user-id1")).toBe(true);
    await s.import(JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 1, templates: [merchant] }));
    expect(saved()[0]).toEqual(broken);
    expect(saved().map((t) => [t.id, t.name])).toEqual([
      ["user-broken", "Merchant NPC"],
      ["user-merchant", "Trader"],
      ["user-id2", "Merchant NPC"],
    ]);
  });

  it("refuses invalid data and more than the limit", async () => {
    const { s, write } = store();
    await expect(s.create({ base: "nope", name: "X", preset: null, values: {} })).rejects.toThrow(/invalid/i);
    await expect(s.update("user-missing", { name: "X" })).rejects.toThrow(/not found/i);
    expect(write).not.toHaveBeenCalled();

    const full = Array.from({ length: USER_TEMPLATE_LIMIT }, (_, i) => ({ ...merchant, id: `user-t${i}` }));
    await expect(
      store(full).s.create({ base: "note", name: "One more", preset: null, values: {} }),
    ).rejects.toThrow(/limit/i);
  });

  it("exports templates as a bounded JSON package", () => {
    const { s } = store([merchant]);
    const json = JSON.parse(s.exportJson());
    expect(json).toEqual({ format: EXPORT_FORMAT, schemaVersion: 1, templates: [merchant] });
    expect(JSON.parse(s.exportJson(["user-none"])).templates).toEqual([]);
  });

  it("imports valid templates under new ids and reports what was skipped", async () => {
    const { s } = store([merchant]);
    const text = JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: 1,
      templates: [
        merchant,
        { ...merchant, base: "gone" },
        { ...merchant, name: "Innkeeper", id: "user-inn" },
      ],
    });
    expect(await s.import(text)).toEqual({ added: 2, skipped: 1 });
    expect(s.list().map((t) => [t.id, t.name])).toEqual([
      ["user-merchant", "Merchant NPC"],
      ["user-id1", "Merchant NPC"],
      ["user-id2", "Innkeeper"],
    ]);
  });

  it.each([
    ["not JSON", "{"],
    ["wrong format", JSON.stringify({ format: "other", schemaVersion: 1, templates: [] })],
    ["newer schema", JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 2, templates: [] })],
    ["too large", " ".repeat(300_000)],
    ["script payload", JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 1, templates: "alert(1)" })],
  ])("rejects an import that is %s", async (_label, text) => {
    const { s, write } = store();
    await expect(s.import(text)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
});
