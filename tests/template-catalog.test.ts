import { describe, expect, it, vi } from "vitest";
import {
  configurableFields,
  EXPORT_FORMAT,
  initialTemplateValues,
  RECENT_LIMIT,
  sanitizeUserTemplate,
  TemplateCatalog,
  USER_TEMPLATE_LIMIT,
  type CatalogStorage,
  type PreferenceKey,
  type UserTemplate,
} from "../src/core/template-catalog";
import { testCore } from "./helpers/core";

const merchant = {
  schemaVersion: 1 as const,
  id: "user-merchant",
  name: "Merchant NPC",
  description: "Shopkeepers",
  base: "npc-dossier",
  preset: "minimal",
  values: { "show-rumours": false, "show-fears": false, portrait: "right" },
};

function createCatalog(
  initial: {
    userTemplates?: unknown;
    favorites?: unknown;
    recent?: unknown;
    systemId?: string;
    writeUserTemplates?: CatalogStorage["writeUserTemplates"];
    writePreference?: CatalogStorage["writePreference"];
    formatCopyName?: (name: string) => string;
  } = {},
) {
  const core = testCore();
  let n = 0;
  let savedUserTemplates: unknown = initial.userTemplates ?? [];
  const prefState: Record<PreferenceKey, unknown> = {
    favorites: initial.favorites ?? [],
    recent: initial.recent ?? [],
  };
  let activeSystem = initial.systemId ?? "dnd5e";

  const writeUserTemplates = vi.fn(
    initial.writeUserTemplates ??
      (async (list: unknown[]) => {
        savedUserTemplates = list;
      }),
  );
  const writePreference = vi.fn(
    initial.writePreference ??
      (async (key: PreferenceKey, value: string[]) => {
        prefState[key] = value;
      }),
  );

  const catalog = new TemplateCatalog({
    templates: core.templates,
    presets: core.presets,
    renderer: core.renderer,
    systemId: () => activeSystem,
    localize: (key) => (key === "LOREFRAME.Template.NpcDossier.Name" ? "NPC Dossier" : key),
    newId: () => `id${++n}`,
    formatCopyName: initial.formatCopyName ?? ((name) => `${name} (Copy)`),
    storage: {
      readUserTemplates: () => savedUserTemplates,
      writeUserTemplates,
      readPreference: (key) => prefState[key],
      writePreference,
    },
  });

  return {
    core,
    catalog,
    writeUserTemplates,
    writePreference,
    savedUserTemplates: () => savedUserTemplates as UserTemplate[],
    prefState,
    setSystemId: (next: string) => {
      activeSystem = next;
    },
  };
}

describe("configurableFields & initialTemplateValues", () => {
  it("offers only option and section fields", () => {
    const core = testCore();
    expect(configurableFields(core.templates.get("npc-card")!).map((f) => f.id)).toEqual([
      "show-notes",
      "portrait",
      "density",
    ]);
    expect(configurableFields(core.templates.get("gallery")!).map((f) => f.id)).toEqual(["mode"]);
  });

  it("starts from template defaults for configurable fields only, then applies overrides", () => {
    const core = testCore();
    const dossier = core.templates.get("npc-dossier")!;
    const values = initialTemplateValues(dossier, { "show-rumours": false, name: "Bob", portrait: "nope" });
    expect(values).toMatchObject({
      "show-rumours": false,
      "show-fears": true,
      portrait: "left",
      density: "comfortable",
    });
    expect(values).not.toHaveProperty("name");
    expect(Object.keys(values)).toHaveLength(13);
  });
});

describe("sanitizeUserTemplate", () => {
  const core = testCore();
  const deps = { templates: core.templates, presets: core.presets };

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

describe("TemplateCatalog user templates & cleanup", () => {
  it("lists only valid stored templates", () => {
    const { catalog } = createCatalog({
      userTemplates: [merchant, { ...merchant, id: "user-broken", base: "gone" }, 42],
    });
    expect(catalog.listUserTemplates().map((t) => t.id)).toEqual(["user-merchant"]);
    expect(catalog.getUserTemplate("user-merchant")?.name).toBe("Merchant NPC");
    expect(catalog.getUserTemplate("user-broken")).toBeUndefined();
    expect(createCatalog({ userTemplates: "garbage" }).catalog.listUserTemplates()).toEqual([]);
  });

  it("creates, updates, duplicates and removes templates while pruning preferences and notifying listeners", async () => {
    const { catalog, savedUserTemplates, prefState } = createCatalog({
      favorites: ["note"],
      recent: ["note"],
    });
    const listener = vi.fn();
    const unsubscribe = catalog.onChange(listener);

    const created = await catalog.createUserTemplate({
      base: "npc-card",
      name: "Guard",
      preset: "bestiary",
      values: { density: "compact", "show-notes": false },
    });
    expect(created).toMatchObject({ id: "user-id1", schemaVersion: 1, base: "npc-card", description: "" });
    expect(savedUserTemplates()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    await catalog.toggleFavorite(created.id);
    await catalog.recordUse(created.id);
    expect(catalog.favorites()).toContain(created.id);
    expect(catalog.recent()[0]).toBe(created.id);
    expect(listener).toHaveBeenCalledTimes(3);

    const renamed = await catalog.updateUserTemplate(created.id, {
      name: "City Guard",
      values: { density: "comfortable" },
    });
    expect(renamed).toMatchObject({
      name: "City Guard",
      values: { density: "comfortable" },
      preset: "bestiary",
    });

    const copy = await catalog.duplicateUserTemplate(created.id);
    expect(copy).toMatchObject({ id: "user-id2", name: "City Guard (Copy)", base: "npc-card" });
    expect(catalog.listUserTemplates().map((t) => t.id)).toEqual(["user-id1", "user-id2"]);

    expect(await catalog.removeUserTemplate("user-id1")).toBe(true);
    expect(await catalog.removeUserTemplate("user-id1")).toBe(false);
    expect(savedUserTemplates().map((t) => t.id)).toEqual(["user-id2"]);
    // Deleting automatically cleans favorites & recent and keeps other entries untouched.
    expect(prefState.favorites).toEqual(["note"]);
    expect(prefState.recent).toEqual(["note"]);

    unsubscribe();
    const callsBefore = listener.mock.calls.length;
    await catalog.toggleFavorite("heading");
    expect(listener).toHaveBeenCalledTimes(callsBefore);
  });

  it("keeps stored templates it cannot use now when it saves others (0.2.1)", async () => {
    // The base may only be missing for a while (a module disabled, an older Loreframe).
    const broken = { ...merchant, id: "user-broken", base: "gone" };
    const { catalog, savedUserTemplates } = createCatalog({ userTemplates: [broken, merchant] });
    await catalog.createUserTemplate({ base: "note", name: "Note", preset: null, values: {} });
    await catalog.updateUserTemplate("user-merchant", { name: "Trader" });
    expect(await catalog.removeUserTemplate("user-id1")).toBe(true);
    await catalog.importUserTemplates(
      JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 1, templates: [merchant] }),
    );
    expect((savedUserTemplates() as unknown[])[0]).toEqual(broken);
    expect((savedUserTemplates() as UserTemplate[]).map((t) => [t.id, t.name])).toEqual([
      ["user-broken", "Merchant NPC"],
      ["user-merchant", "Trader"],
      ["user-id2", "Merchant NPC"],
    ]);
  });

  it("truncates generated duplicate names to the 80-character limit", async () => {
    const { catalog } = createCatalog({ formatCopyName: (name) => `${name} (Copy)` });
    const created = await catalog.createUserTemplate({
      base: "note",
      name: "A".repeat(80),
      preset: null,
      values: {},
    });
    const copy = await catalog.duplicateUserTemplate(created.id);
    expect(copy.name).toHaveLength(80);
  });

  it("refuses invalid data and more than the limit", async () => {
    const { catalog, writeUserTemplates } = createCatalog();
    await expect(
      catalog.createUserTemplate({ base: "nope", name: "X", preset: null, values: {} }),
    ).rejects.toThrow(/invalid/i);
    await expect(catalog.updateUserTemplate("user-missing", { name: "X" })).rejects.toThrow(/not found/i);
    expect(writeUserTemplates).not.toHaveBeenCalled();

    const full = Array.from({ length: USER_TEMPLATE_LIMIT }, (_, i) => ({ ...merchant, id: `user-t${i}` }));
    await expect(
      createCatalog({ userTemplates: full }).catalog.createUserTemplate({
        base: "note",
        name: "One more",
        preset: null,
        values: {},
      }),
    ).rejects.toThrow(/limit/i);
  });

  it("exports templates as a bounded JSON package", () => {
    const { catalog } = createCatalog({ userTemplates: [merchant] });
    const json = JSON.parse(catalog.exportUserTemplates());
    expect(json).toEqual({ format: EXPORT_FORMAT, schemaVersion: 1, templates: [merchant] });
    expect(JSON.parse(catalog.exportUserTemplates(["user-none"])).templates).toEqual([]);
  });

  it("imports valid templates under new ids, notifies when added and reports what was skipped", async () => {
    const { catalog } = createCatalog({ userTemplates: [merchant] });
    const listener = vi.fn();
    catalog.onChange(listener);
    const text = JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: 1,
      templates: [
        merchant,
        { ...merchant, base: "gone" },
        { ...merchant, name: "Innkeeper", id: "user-inn" },
      ],
    });
    expect(await catalog.importUserTemplates(text)).toEqual({ added: 2, skipped: 1 });
    expect(catalog.listUserTemplates().map((t) => [t.id, t.name])).toEqual([
      ["user-merchant", "Merchant NPC"],
      ["user-id1", "Merchant NPC"],
      ["user-id2", "Innkeeper"],
    ]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it.each([
    ["not JSON", "{"],
    ["wrong format", JSON.stringify({ format: "other", schemaVersion: 1, templates: [] })],
    ["newer schema", JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 2, templates: [] })],
    ["too large", " ".repeat(300_000)],
    ["script payload", JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 1, templates: "alert(1)" })],
  ])("rejects an import that is %s", async (_label, text) => {
    const { catalog, writeUserTemplates } = createCatalog();
    await expect(catalog.importUserTemplates(text)).rejects.toThrow();
    expect(writeUserTemplates).not.toHaveBeenCalled();
  });
});

describe("TemplateCatalog preferences", () => {
  it("toggles favorites and keeps recent templates newest first, unique and capped", async () => {
    const { catalog, prefState, writePreference } = createCatalog({
      favorites: ["note"],
      recent: ["a", "b"],
    });
    expect(await catalog.toggleFavorite("heading")).toBe(true);
    expect(prefState.favorites).toEqual(["note", "heading"]);
    expect(catalog.isFavorite("heading")).toBe(true);
    expect(await catalog.toggleFavorite("note")).toBe(false);
    expect(catalog.favorites()).toEqual(["heading"]);

    await catalog.recordUse("b");
    expect(prefState.recent).toEqual(["b", "a"]);
    writePreference.mockClear();
    await catalog.recordUse("b");
    expect(writePreference).not.toHaveBeenCalled();

    for (let i = 0; i < RECENT_LIMIT + 5; i++) await catalog.recordUse(`t${i}`);
    expect(catalog.recent()).toHaveLength(RECENT_LIMIT);
    expect(catalog.recent()[0]).toBe(`t${RECENT_LIMIT + 4}`);
  });

  it("returns copies, tolerates malformed stored values and propagates storage errors", async () => {
    const { catalog } = createCatalog({
      favorites: ["ok", 5, null],
      recent: null,
      writePreference: async () => {
        throw new Error("disk full");
      },
    });
    const favorites = catalog.favorites();
    expect(favorites).toEqual(["ok"]);
    favorites.push("mutated");
    expect(catalog.favorites()).toEqual(["ok"]);
    expect(catalog.recent()).toEqual([]);
    await expect(catalog.toggleFavorite("x")).rejects.toThrow("disk full");
  });
});

describe("TemplateCatalog availability, resolution & editor flows", () => {
  it("filters registered and user templates by active systemId", () => {
    const { core, catalog, setSystemId } = createCatalog({ userTemplates: [merchant] });
    core.templates.register({
      id: "pf2e-stat",
      version: 1,
      name: "PF2e Stat",
      category: "npc",
      type: "block",
      renderer: "divider",
      system: "pf2e",
    });
    void catalog.createUserTemplate({ base: "pf2e-stat", name: "PF2e Variant", preset: null, values: {} });
    expect(catalog.availableTemplates().some((t) => t.id === "pf2e-stat")).toBe(false);
    expect(catalog.availableUserTemplates().map((t) => t.id)).toEqual(["user-merchant"]);

    setSystemId("pf2e");
    expect(catalog.availableTemplates().some((t) => t.id === "pf2e-stat")).toBe(true);
    expect(catalog.availableUserTemplates().map((t) => t.id)).toEqual(["user-merchant", "user-id1"]);
  });

  it("resolves entries and renders previews safely", () => {
    const { catalog } = createCatalog({ userTemplates: [merchant] });
    expect(catalog.resolveEntry("user-merchant")?.kind).toBe("user");
    expect(catalog.resolveEntry("npc-dossier")?.kind).toBe("template");
    expect(catalog.resolveEntry("missing")).toBeNull();

    const userPreview = catalog.renderPreview("user-merchant");
    expect(userPreview).toContain('data-loreframe-preset="minimal"');
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(catalog.renderPreview("missing")).toBeNull();
  });

  it("prepares create/edit editor state and validates/persists saves with change notifications", async () => {
    const { catalog, writeUserTemplates } = createCatalog({ userTemplates: [merchant] });
    const listener = vi.fn();
    catalog.onChange(listener);

    const creating = catalog.prepareEditor({
      mode: "create",
      base: "npc-dossier",
      values: { portrait: "right" },
    });
    expect(creating).toMatchObject({ id: null, name: "NPC Dossier", preset: "editorial" });
    expect(creating?.values.portrait).toBe("right");
    expect(catalog.prepareEditor({ mode: "edit", id: "user-missing" })).toBeNull();

    expect(
      await catalog.saveEditor(creating!, { name: "   ", description: "", preset: null, values: {} }),
    ).toEqual({ ok: false, reason: "name-required" });

    const created = await catalog.saveEditor(creating!, {
      name: "  Boss NPC ",
      description: "Important ",
      preset: "arcane",
      values: { "show-rumours": false, ignored: "x" as unknown as boolean },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.template).toMatchObject({
      name: "Boss NPC",
      description: "Important",
      preset: "arcane",
      values: { "show-rumours": false },
    });
    expect(listener).toHaveBeenCalledOnce();

    const editing = catalog.prepareEditor({ mode: "edit", id: created.template.id });
    expect(editing?.id).toBe(created.template.id);

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeUserTemplates.mockRejectedValueOnce(new Error("save boom"));
    expect(
      await catalog.saveEditor(editing!, { name: "Updated", description: "", preset: null, values: {} }),
    ).toEqual({ ok: false, reason: "save-failed" });
  });
});
