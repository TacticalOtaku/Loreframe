import { describe, expect, it, vi } from "vitest";
import type { EditorView } from "prosemirror-view";
import { createApi, type ApiDeps } from "../src/api";
import { IntegrationManager } from "../src/integrations/integration-manager";
import { testCore } from "./helpers/core";

describe("public API", () => {
  function setup(overrides: Partial<ApiDeps> = {}) {
    const core = testCore();
    const deps: ApiDeps = {
      core,
      version: "1.2.3",
      openLibrary: vi.fn(),
      activeEditor: () => null,
      insert: vi.fn(() => true),
      integrations: new IntegrationManager({ systemId: () => "dnd5e", enabled: () => true }),
      ...overrides,
    };
    return { core, deps, api: createApi(deps) };
  }

  it("exposes a small, frozen surface", () => {
    const { api } = setup();
    expect(Object.keys(api).sort()).toEqual([
      "insertTemplate",
      "openTemplateLibrary",
      "registerPreset",
      "registerSystemAdapter",
      "registerTemplate",
      "unregisterTemplate",
      "version",
    ]);
    expect(Object.isFrozen(api)).toBe(true);
    expect(api.version).toBe("1.2.3");
  });

  it("registers data-only templates that reuse built-in renderers", () => {
    const { api, core } = setup();
    api.registerPreset({ id: "grim", name: "MYMOD.Grim" });
    api.registerTemplate({
      id: "mymod-rumour",
      version: 1,
      name: "MYMOD.Rumour",
      category: "campaign",
      type: "block",
      renderer: "callout",
      rendererOptions: { tone: "lore" },
      presets: ["grim"],
      fields: [{ id: "title", type: "text", label: "MYMOD.Title", default: "Rumour" }],
    });
    expect(core.renderNew("mymod-rumour")).toContain('data-loreframe-preset="grim"');
    expect(api.unregisterTemplate("mymod-rumour")).toBe(true);
    expect(core.templates.has("mymod-rumour")).toBe(false);
  });

  it("rejects templates with unknown renderers or executable content", () => {
    const { api } = setup();
    const base = { id: "x", version: 1, name: "n", category: "blocks", type: "block" } as const;
    expect(() => api.registerTemplate({ ...base, renderer: "custom-js" })).toThrow(/renderer/);
    const withFunction = { ...base, renderer: "callout", rendererOptions: { tone: "note", run: () => 1 } };
    expect(() => api.registerTemplate(withFunction as never)).toThrow();
  });

  it("inserts into the active editor, or reports that none is available", () => {
    const view = {} as EditorView;
    const withEditor = setup({ activeEditor: () => view });
    expect(withEditor.api.insertTemplate("note")).toBe(true);
    expect(withEditor.deps.insert).toHaveBeenCalledWith(view, "note", {});

    const without = setup();
    expect(without.api.insertTemplate("note")).toBe(false);
    expect(without.deps.insert).not.toHaveBeenCalled();
    expect(() => without.api.insertTemplate("missing")).toThrow(/Unknown template/);
  });

  it("opens the Template Library", () => {
    const { api, deps } = setup();
    api.openTemplateLibrary();
    expect(deps.openLibrary).toHaveBeenCalledOnce();
  });

  it("registers system adapters and passes presets to insertion", () => {
    const integrations = new IntegrationManager({ systemId: () => "dnd5e", enabled: () => true });
    const view = {} as EditorView;
    const insert = vi.fn(() => true);
    const { api } = setup({ integrations, insert, activeEditor: () => view });
    api.registerSystemAdapter({
      id: "mymod",
      systemId: "dnd5e",
      documentTypes: ["Actor"],
      canHandle: () => true,
      getNpcData: () => null,
    });
    expect(integrations.handles("Actor")).toBe(true);
    expect(api.insertTemplate("npc-card", { preset: "arcane" })).toBe(true);
    expect(insert).toHaveBeenCalledWith(view, "npc-card", { preset: "arcane" });
    expect(api.insertTemplate("note")).toBe(true);
    expect(insert).toHaveBeenLastCalledWith(view, "note", {});
  });
});
