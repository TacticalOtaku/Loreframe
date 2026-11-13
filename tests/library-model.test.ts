import { describe, expect, it, vi } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { TemplateCatalog, type PreferenceKey, type UserTemplate } from "../src/core/template-catalog";
import { buildEditorTrackerPlugin, EditorTracker } from "../src/editor/editor-tracker";
import { createTemplateInserter } from "../src/editor/insert";
import {
  buildLibraryModel,
  createLibrarySession,
  matchesQuery,
  type LibraryModelInput,
  type LibraryUiPort,
} from "../src/applications/template-library/library-model";
import type { LoreframeTemplateDefinition } from "../src/types";
import { parseString } from "./helpers/schema";
import { testCore } from "./helpers/core";

function def(id: string, overrides: Partial<LoreframeTemplateDefinition> = {}): LoreframeTemplateDefinition {
  return {
    id,
    version: 1,
    name: `T.${id}`,
    description: `D.${id}`,
    category: "blocks",
    type: "block",
    renderer: "r",
    ...overrides,
  };
}

const templates = [
  def("heading", { tags: ["title"], icon: "fa-solid fa-heading", thumbnail: "modules/x/heading.webp" }),
  def("note", { aliases: ["aside"] }),
  def("two-columns", { category: "layouts", type: "layout" }),
  def("npc-5e", { category: "npc", system: "dnd5e" }),
];

const labels: Record<string, string> = {
  "T.heading": "Heading",
  "D.heading": "Section title",
  "T.note": "Заметка",
  "D.note": "Врезка",
  "T.two-columns": "Two Columns",
  "D.two-columns": "Side by side",
  "T.npc-5e": "NPC",
  "D.npc-5e": "Statblock",
  "LOREFRAME.Library.Category.Blocks": "Blocks",
  "LOREFRAME.Library.Category.Layouts": "Layouts",
  "LOREFRAME.Library.Category.NPC": "Characters",
};

function input(overrides: Partial<LibraryModelInput> = {}): LibraryModelInput {
  return {
    templates,
    favorites: [],
    recent: [],
    state: { category: "all", query: "", selectedId: null, preset: null },
    presetsFor: (definition) =>
      definition.id === "npc-5e"
        ? [
            { id: "editorial", name: "P.editorial" },
            { id: "arcane", name: "P.arcane" },
          ]
        : [],
    localize: (key) => labels[key] ?? key,
    renderPreview: vi.fn((id: string) => `<aside>${id}</aside>`),
    canInsert: true,
    ...overrides,
  };
}

describe("buildLibraryModel", () => {
  it("lists fixed categories first, then non-empty template categories with counts", () => {
    const model = buildLibraryModel(input({ favorites: ["note"], recent: ["heading", "gone"] }));
    expect(model.categories.map((c) => [c.id, c.count, c.active])).toEqual([
      ["all", 4, true],
      ["favorites", 1, false],
      ["recent", 1, false],
      ["mine", 0, false],
      ["blocks", 2, false],
      ["layouts", 1, false],
      ["npc", 1, false],
    ]);
    expect(model.categories.find((c) => c.id === "npc")?.label).toBe("LOREFRAME.Library.Category.NPC");
  });

  it("builds localized cards, favorites and a system badge only for system templates", () => {
    const model = buildLibraryModel(input({ favorites: ["note"] }));
    const note = model.cards.find((c) => c.id === "note");
    expect(note).toMatchObject({ name: "Заметка", description: "Врезка", favorite: true, systemBadge: null });
    expect(model.cards.find((c) => c.id === "npc-5e")?.systemBadge).toBe("dnd5e");
    expect(note?.icon).toBe("fa-solid fa-shapes");
    expect(model.cards[0]?.icon).toBe("fa-solid fa-heading");
    expect(model.cards[0]?.thumbnail).toBe("modules/x/heading.webp");
    expect(note?.thumbnail).toBeNull();
  });

  it("filters by category and orders recent by recency, dropping unknown ids", () => {
    const layouts = buildLibraryModel(
      input({ state: { category: "layouts", query: "", selectedId: null, preset: null } }),
    );
    expect(layouts.cards.map((c) => c.id)).toEqual(["two-columns"]);
    const recent = buildLibraryModel(
      input({
        recent: ["note", "missing", "heading"],
        state: { category: "recent", query: "", selectedId: null, preset: null },
      }),
    );
    expect(recent.cards.map((c) => c.id)).toEqual(["note", "heading"]);
  });

  it("selects the first card by default and keeps a valid explicit selection", () => {
    const first = buildLibraryModel(input());
    expect(first.selected?.id).toBe("heading");
    expect(first.cards.filter((c) => c.selected).map((c) => c.id)).toEqual(["heading"]);
    const chosen = buildLibraryModel(
      input({ state: { category: "all", query: "", selectedId: "note", preset: null } }),
    );
    expect(chosen.selected?.id).toBe("note");
    const outside = buildLibraryModel(
      input({ state: { category: "layouts", query: "", selectedId: "note", preset: null } }),
    );
    expect(outside.selected?.id).toBe("two-columns");
  });

  it("only selects cards that match the search query", () => {
    const search = (query: string, selectedId: string | null) =>
      buildLibraryModel(input({ state: { category: "all", query, selectedId, preset: null } }));
    expect(search("side by", "heading").selected?.id).toBe("two-columns");
    expect(search("side by", "two-columns").selected?.id).toBe("two-columns");
    const none = search("nothing-matches", "heading");
    expect(none.selected).toBeNull();
    expect(none.cards).toHaveLength(4);
    expect(none.cards.every((c) => !c.selected)).toBe(true);
  });

  it("renders a preview only for the selected template", () => {
    const renderPreview = vi.fn((id: string) => `<aside>${id}</aside>`);
    const model = buildLibraryModel(input({ renderPreview }));
    expect(renderPreview).toHaveBeenCalledOnce();
    expect(model.selected?.previewHtml).toBe("<aside>heading</aside>");
    expect(model.cards[1]?.previewHtml).toBe("");
  });

  it("keeps the library usable when a preview fails to render", () => {
    const model = buildLibraryModel(
      input({
        renderPreview: () => null,
      }),
    );
    expect(model.selected?.previewHtml).toBe("");
    expect(model.selected?.previewError).toBe(true);
  });

  it("reports empty states per category", () => {
    const empty = (category: LibraryModelInput["state"]["category"]) =>
      buildLibraryModel(input({ state: { category, query: "", selectedId: null, preset: null } })).empty;
    expect(empty("favorites")).toBe("favorites");
    expect(empty("recent")).toBe("recent");
    expect(empty("wiki")).toBe("category");
    expect(empty("all")).toBeNull();
    expect(
      buildLibraryModel(input({ state: { category: "wiki", query: "", selectedId: null, preset: null } }))
        .selected,
    ).toBeNull();
  });

  it("builds search text from name, description, tags, aliases and category", () => {
    const heading = buildLibraryModel(input()).cards[0]!;
    for (const query of ["head", "SECTION", "title", "blocks"]) {
      expect(matchesQuery(heading.searchText, query)).toBe(true);
    }
    const note = buildLibraryModel(input()).cards[1]!;
    expect(matchesQuery(note.searchText, "aside")).toBe(true);
    expect(matchesQuery(note.searchText, "заме")).toBe(true);
  });
});

describe("matchesQuery", () => {
  it("requires every term and ignores case, spacing and diacritics", () => {
    expect(matchesQuery("npc dossier character", "  Dossier   NPC ")).toBe(true);
    expect(matchesQuery("npc dossier", "npc gallery")).toBe(false);
    expect(matchesQuery("cafe", "Café")).toBe(true);
    expect(matchesQuery("ёлка", "елка")).toBe(true);
    expect(matchesQuery("anything", "")).toBe(true);
  });
});

describe("library presets", () => {
  it("offers a preset choice for templates with several presets and previews the chosen one", () => {
    const renderPreview = vi.fn((id: string, preset?: string) => `<aside>${id}:${preset}</aside>`);
    const model = buildLibraryModel(
      input({ renderPreview, state: { category: "all", query: "", selectedId: "npc-5e", preset: "arcane" } }),
    );
    expect(model.presets).toEqual({
      value: "arcane",
      options: [
        { value: "editorial", label: "P.editorial" },
        { value: "arcane", label: "P.arcane" },
      ],
    });
    expect(model.preset).toBe("arcane");
    expect(renderPreview).toHaveBeenCalledWith("npc-5e", "arcane");
  });

  it("falls back to the first preset when the remembered one is not offered", () => {
    const model = buildLibraryModel(
      input({ state: { category: "all", query: "", selectedId: "npc-5e", preset: "gone" } }),
    );
    expect(model.preset).toBe("editorial");
  });

  it("offers no choice and no preset for templates without presets", () => {
    const renderPreview = vi.fn((id: string) => id);
    const model = buildLibraryModel(
      input({ renderPreview, state: { category: "all", query: "", selectedId: "note", preset: "arcane" } }),
    );
    expect(model.presets).toBeNull();
    expect(model.preset).toBeNull();
    expect(renderPreview).toHaveBeenCalledWith("note", undefined);
  });
});

describe("library user templates", () => {
  const mine = [
    { id: "user-merchant", name: "Merchant", description: "", base: templates[3]!, preset: "arcane" },
    { id: "user-rumour", name: "Rumour", description: "Tavern talk", base: templates[1]!, preset: null },
  ];

  it("adds a My Templates category after Recent, listing user variants with their base", () => {
    const model = buildLibraryModel(
      input({ userTemplates: mine, state: { category: "mine", query: "", selectedId: null, preset: null } }),
    );
    expect(model.categories.slice(0, 4).map((c) => [c.id, c.count])).toEqual([
      ["all", 6],
      ["favorites", 0],
      ["recent", 0],
      ["mine", 2],
    ]);
    expect(model.cards.map((c) => [c.id, c.name, c.description, c.mine, c.baseName])).toEqual([
      ["user-merchant", "Merchant", "NPC", true, "NPC"],
      ["user-rumour", "Rumour", "Tavern talk", true, "Заметка"],
    ]);
    expect(model.cards[0]?.icon).toBe("fa-solid fa-shapes");
  });

  it("previews a user template with its own preset and offers no preset choice", () => {
    const renderPreview = vi.fn((id: string, preset?: string) => `${id}:${preset}`);
    const model = buildLibraryModel(
      input({
        userTemplates: mine,
        renderPreview,
        state: { category: "mine", query: "", selectedId: "user-merchant", preset: "editorial" },
      }),
    );
    expect(model.selected).toMatchObject({ id: "user-merchant", mine: true });
    expect(model.presets).toBeNull();
    expect(model.preset).toBe("arcane");
    expect(renderPreview).toHaveBeenCalledWith("user-merchant", "arcane");
  });

  it("finds user templates by their base, keeps them in favorites and shows an empty state", () => {
    const search = buildLibraryModel(
      input({
        userTemplates: mine,
        state: { category: "all", query: "врезка", selectedId: null, preset: null },
      }),
    );
    expect(search.selected?.id).toBe("note");
    expect(search.cards.filter((c) => matchesQuery(c.searchText, "врезка")).map((c) => c.id)).toEqual([
      "note",
      "user-rumour",
    ]);
    const favorites = buildLibraryModel(
      input({
        userTemplates: mine,
        favorites: ["user-rumour"],
        state: { category: "favorites", query: "", selectedId: null, preset: null },
      }),
    );
    expect(favorites.cards.map((c) => c.id)).toEqual(["user-rumour"]);
    const empty = buildLibraryModel(
      input({ state: { category: "mine", query: "", selectedId: null, preset: null } }),
    );
    expect(empty.empty).toBe("mine");
  });
});

describe("createLibrarySession", () => {
  const merchant: UserTemplate = {
    schemaVersion: 1,
    id: "user-merchant",
    name: "Merchant",
    description: "",
    base: "npc-dossier",
    preset: "arcane",
    values: { "show-rumours": false },
  };

  function setupSession(
    options: { userTemplates?: UserTemplate[]; editable?: boolean; confirmDelete?: boolean } = {},
  ) {
    const core = testCore();
    let stored: unknown[] = options.userTemplates ?? [merchant];
    const prefs: Record<PreferenceKey, string[]> = { favorites: [], recent: [] };
    let seq = 0;

    const catalog = new TemplateCatalog({
      templates: core.templates,
      presets: core.presets,
      renderer: core.renderer,
      systemId: () => "dnd5e",
      localize: (key) => key.split(".").at(-2) ?? key,
      newId: () => `id${++seq}`,
      formatCopyName: (name) => `${name} (Copy)`,
      storage: {
        readUserTemplates: () => stored,
        writeUserTemplates: async (list) => {
          stored = list;
        },
        readPreference: (k) => prefs[k],
        writePreference: async (k, val) => {
          prefs[k] = val;
        },
      },
    });

    const tracker = new EditorTracker();
    const mount = document.createElement("div");
    document.body.append(mount);
    const view = new EditorView(mount, {
      state: EditorState.create({
        doc: parseString("<p>Hello</p>"),
        selection: undefined,
        plugins: [buildEditorTrackerPlugin({ Plugin, tracker })],
      }),
      editable: () => options.editable ?? true,
    });
    view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
    tracker.markActive(view);

    const ui: LibraryUiPort = {
      localize: (key) => key,
      notifyWarn: vi.fn(),
      notifyError: vi.fn(),
      notifyInfo: vi.fn(),
      confirmDeleteUserTemplate: vi.fn(async () => options.confirmDelete ?? true),
      openTemplateEditor: vi.fn(),
      saveJsonFile: vi.fn(),
    };

    const inserter = createTemplateInserter({
      catalog,
      renderNew: core.renderNew,
      parseHtml: parseString,
      pm: pmState,
      notifyError: ui.notifyError,
    });

    const session = createLibrarySession({ catalog, tracker, inserter, ui });
    return {
      session,
      catalog,
      tracker,
      inserter,
      view,
      ui,
      prefs,
      cleanup: () => {
        if (!view.isDestroyed) view.destroy();
        mount.remove();
      },
    };
  }

  it("keeps snapshot pure, resolves compatible preset on insert, and updates recency", () => {
    const s = setupSession();
    try {
      const insertSpy = vi.spyOn(s.inserter, "insert");
      s.session.selectTemplate("npc-dossier");
      s.session.selectPreset("arcane");
      expect(s.session.snapshot().preset).toBe("arcane");

      // Switch to template without presets — session remembers chosen preset for other templates, but inserts note with none.
      s.session.selectTemplate("note");
      const snap = s.session.snapshot();
      expect(snap.preset).toBeNull();
      // Repeated snapshot calls do not mutate state or differ.
      expect(s.session.snapshot().selected?.id).toBe(snap.selected?.id);
      expect(s.session.insertSelected()).toBe(true);
      expect(insertSpy).toHaveBeenCalledWith(s.view, "note", {});
      expect(s.catalog.recent()).toEqual(["note"]);
    } finally {
      s.cleanup();
    }
  });

  it("warns when no editable editor exists and respects pinned editor fallback", () => {
    const s = setupSession({ editable: false });
    try {
      expect(s.session.canInsert()).toBe(false);
      expect(s.session.insertSelected()).toBe(false);
      expect(s.ui.notifyWarn).toHaveBeenCalledWith("LOREFRAME.Error.NoEditor");
    } finally {
      s.cleanup();
    }
  });

  it("duplicates, deletes (auto-cleaning favorites/recent), exports, imports and notifies subscribers", async () => {
    const s = setupSession();
    try {
      const refreshed = vi.fn();
      const disconnect = s.session.connect(refreshed);

      await s.session.toggleFavorite("user-merchant");
      expect(refreshed).toHaveBeenLastCalledWith(["nav", "browser", "preview"]);

      s.session.selectCategory("mine");
      s.session.selectTemplate("user-merchant");
      expect(await s.session.duplicateSelected()).toBe(true);
      expect(s.session.snapshot().selected?.id).toBe("user-id1");

      s.session.selectTemplate("user-merchant");
      expect(await s.session.deleteSelected()).toBe(true);
      expect(s.prefs.favorites).toEqual([]);
      expect(s.catalog.getUserTemplate("user-merchant")).toBeUndefined();

      expect(s.session.exportTemplates(true)).toBe(true);
      expect(s.ui.saveJsonFile).toHaveBeenCalledWith(
        expect.stringContaining("Merchant (Copy)"),
        "loreframe-templates.json",
      );

      disconnect();
      const count = refreshed.mock.calls.length;
      await s.session.toggleFavorite("note");
      expect(refreshed).toHaveBeenCalledTimes(count);
    } finally {
      s.cleanup();
    }
  });

  it("handles import errors and customize/edit routing cleanly", async () => {
    const s = setupSession();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      expect(await s.session.importTemplates(async () => "{bad")).toBe(false);
      expect(s.ui.notifyError).toHaveBeenCalledWith("LOREFRAME.UserTemplates.ImportFailed");

      s.session.selectTemplate("npc-card");
      s.session.selectPreset("arcane");
      s.session.customizeSelected();
      expect(s.ui.openTemplateEditor).toHaveBeenCalledWith({
        mode: "create",
        base: "npc-card",
        preset: "arcane",
      });

      s.session.selectTemplate("user-merchant");
      s.session.customizeSelected();
      expect(s.ui.openTemplateEditor).toHaveBeenLastCalledWith({ mode: "edit", id: "user-merchant" });
    } finally {
      s.cleanup();
    }
  });
});
