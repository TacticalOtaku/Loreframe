import { describe, expect, it, vi } from "vitest";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { buildLoreframeDropdown, DROPDOWN_KEY, MENU_SHORTCUT_LIMIT, type MenuDeps } from "../src/editor/menu";
import { BUILT_IN_TEMPLATES } from "../src/content-templates";
import { testCore } from "./helpers/core";

function makeDeps(overrides: Partial<MenuDeps> = {}): MenuDeps {
  return {
    templates: testCore().templates,
    systemId: "dnd5e",
    favorites: () => [],
    recent: () => [],
    insert: vi.fn(() => true),
    openLibrary: vi.fn(),
    ...overrides,
  };
}

function flatten(
  entries: ProseMirrorDropDownEntry[],
  depth = 1,
): { entry: ProseMirrorDropDownEntry; depth: number }[] {
  return entries.flatMap((entry) => [{ entry, depth }, ...flatten(entry.children ?? [], depth + 1)]);
}

function find(config: ProseMirrorDropDownConfig, action: string): ProseMirrorDropDownEntry {
  const entry = flatten(config.entries).find((e) => e.entry.action === action)?.entry;
  if (!entry) throw new Error(`no entry ${action}`);
  return entry;
}

const view = { editable: true } as EditorView;
const state = {} as EditorState;

describe("buildLoreframeDropdown", () => {
  it("is a single icon dropdown with a localized title", () => {
    const config = buildLoreframeDropdown(makeDeps());
    expect(DROPDOWN_KEY).toBe("loreframe");
    expect(config.cssClass).toBe("loreframe");
    expect(config.title).toBe("LOREFRAME.Editor.Menu");
    expect(config.icon).toMatch(/^<i class="fa-solid [a-z-]+ fa-fw"><\/i>$/);
  });

  it("lists blocks, layouts and page structures in their groups and the library last", () => {
    const config = buildLoreframeDropdown(makeDeps());
    expect(config.entries.map((e) => e.action)).toEqual([
      "loreframe-group-block",
      "loreframe-group-layout",
      "loreframe-group-page",
      "loreframe-open-library",
    ]);
    expect(find(config, "loreframe-group-page").children?.map((c) => c.action)).toEqual([
      "loreframe-insert-npc-dossier",
      "loreframe-insert-location",
      "loreframe-insert-wiki-article",
    ]);
    const quick = find(config, "loreframe-group-block");
    expect(quick.title).toBe("LOREFRAME.Editor.QuickBlocks");
    expect(quick.children?.map((c) => c.action)).toEqual(
      BUILT_IN_TEMPLATES.filter((t) => t.type === "block").map((t) => `loreframe-insert-${t.id}`),
    );
    expect(find(config, "loreframe-insert-note").title).toBe("LOREFRAME.Template.Note.Name");
    expect(find(config, "loreframe-group-layout").children?.[0]?.action).toBe("loreframe-insert-two-columns");
  });

  it("shows Favorites and Recent first, in stored order, skipping unknown ids", () => {
    const config = buildLoreframeDropdown(
      makeDeps({ favorites: () => ["divider", "gone", "note"], recent: () => ["lore"] }),
    );
    expect(config.entries.map((e) => [e.action, e.group])).toEqual([
      ["loreframe-group-favorites", 0],
      ["loreframe-group-recent", 0],
      ["loreframe-group-block", 1],
      ["loreframe-group-layout", 1],
      ["loreframe-group-page", 1],
      ["loreframe-open-library", 2],
    ]);
    expect(find(config, "loreframe-group-favorites").children?.map((c) => c.action)).toEqual([
      "loreframe-favorite-divider",
      "loreframe-favorite-note",
    ]);
    expect(find(config, "loreframe-group-recent").children?.map((c) => c.action)).toEqual([
      "loreframe-recent-lore",
    ]);
  });

  it("caps shortcut groups", () => {
    const core = testCore();
    const ids = Array.from({ length: MENU_SHORTCUT_LIMIT + 3 }, (_, i) => `extra-${i}`);
    for (const id of ids) {
      core.templates.register({
        id,
        version: 1,
        name: "N",
        category: "blocks",
        type: "block",
        renderer: "divider",
      });
    }
    const config = buildLoreframeDropdown(makeDeps({ templates: core.templates, recent: () => ids }));
    expect(find(config, "loreframe-group-recent").children).toHaveLength(MENU_SHORTCUT_LIMIT);
  });

  it("lists page templates only for the active system", () => {
    const core = testCore();
    core.templates.register({
      id: "npc-pf2e",
      version: 1,
      name: "LOREFRAME.T",
      category: "npc",
      type: "page",
      renderer: "divider",
      system: "pf2e",
    });
    const built = buildLoreframeDropdown(makeDeps({ templates: core.templates }));
    expect(find(built, "loreframe-group-page").children?.map((c) => c.action)).toEqual([
      "loreframe-insert-npc-dossier",
      "loreframe-insert-location",
      "loreframe-insert-wiki-article",
    ]);
  });

  it("uses unique, namespaced actions and localization keys, nested at most two levels", () => {
    const all = flatten(
      buildLoreframeDropdown(makeDeps({ favorites: () => ["note"], recent: () => ["note"] })).entries,
    );
    const actions = all.map(({ entry }) => entry.action);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions.every((a) => a.startsWith("loreframe-"))).toBe(true);
    expect(all.every(({ entry }) => entry.title.startsWith("LOREFRAME."))).toBe(true);
    expect(Math.max(...all.map(({ depth }) => depth))).toBeLessThanOrEqual(2);
  });

  it("inserts through the shared insert function with the menu's editor", () => {
    const deps = makeDeps({ favorites: () => ["note"] });
    const config = buildLoreframeDropdown(deps);
    expect(find(config, "loreframe-insert-heading").cmd?.(state, undefined, view)).toBe(true);
    find(config, "loreframe-favorite-note").cmd?.(state, undefined, view);
    expect(deps.insert).toHaveBeenNthCalledWith(1, view, "heading");
    expect(deps.insert).toHaveBeenNthCalledWith(2, view, "note");
  });

  it("opens the Template Library for the menu's editor", () => {
    const deps = makeDeps();
    find(buildLoreframeDropdown(deps), "loreframe-open-library").cmd?.(state, undefined, view);
    expect(deps.openLibrary).toHaveBeenCalledWith(view);
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("buildLoreframeDropdown user templates (0.1.1)", () => {
  it("offers My Templates in Favorites and Recent, with their names escaped (Foundry renders titles as HTML)", () => {
    const insert = vi.fn(() => true);
    const config = buildLoreframeDropdown(
      makeDeps({
        insert,
        favorites: () => ["user-merchant", "note"],
        recent: () => ["user-merchant", "user-gone"],
        userTemplates: () => [{ id: "user-merchant", name: "Merchant <b>NPC</b>" }],
      }),
    );
    const favorite = find(config, "loreframe-favorite-user-merchant");
    expect(favorite.title).toBe("Merchant &lt;b&gt;NPC&lt;/b&gt;");
    expect(find(config, "loreframe-group-recent").children?.map((c) => c.action)).toEqual([
      "loreframe-recent-user-merchant",
    ]);
    favorite.cmd!(state, undefined, view);
    expect(insert).toHaveBeenCalledWith(view, "user-merchant");
  });
});
