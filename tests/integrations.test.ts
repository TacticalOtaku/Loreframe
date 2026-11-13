import { describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { IntegrationManager } from "../src/integrations/integration-manager";
import { htmlToText, secretText } from "../src/integrations/html-text";
import {
  createDocumentDropHandler,
  npcTemplateValues,
  type DropUiPort,
  type DropView,
} from "../src/integrations/document-drop-flow";
import type { DocumentDrop } from "../src/editor/document-drop";
import type { LoreframeNpcData, LoreframeSystemAdapter } from "../src/integrations/types";
import { locateBlock, readBlockValues } from "../src/editor/block-document";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const npc: LoreframeNpcData = {
  uuid: "Actor.a1",
  name: "Mira Vell",
  image: "worlds/art/mira.webp",
  ancestry: "Humanoid (Elf)",
  occupation: "",
  role: "CR 3 · Neutral",
  summary: "Keeper of the lighthouse.\n\nShe trades in secrets.",
  appearance: "",
  personality: "Curt but fair",
  motivation: "Keep the light burning",
  relationships: "Owes the guild",
  fears: "",
  secrets: "She is the smuggler queen.",
};

function adapter(overrides: Partial<LoreframeSystemAdapter> = {}): LoreframeSystemAdapter {
  return {
    id: "fake",
    systemId: "dnd5e",
    documentTypes: ["Actor"],
    canHandle: (doc) => (doc as { type?: string }).type === "npc",
    getNpcData: () => npc,
    ...overrides,
  };
}

describe("IntegrationManager", () => {
  const manager = (systemId = "dnd5e", enabled = true) =>
    new IntegrationManager({ systemId: () => systemId, enabled: () => enabled });

  it("uses adapters of the active system only, and only when integrations are enabled", () => {
    const m = manager();
    m.register(adapter());
    m.register(adapter({ id: "other", systemId: "pf2e", documentTypes: ["Item"] }));
    expect(m.handles("Actor")).toBe(true);
    expect(m.handles("Item")).toBe(false);
    expect(m.npcData({ type: "npc" })).toBe(npc);
    expect(m.npcData({ type: "vehicle" })).toBeNull();

    const off = manager("dnd5e", false);
    off.register(adapter());
    expect(off.handles("Actor")).toBe(false);
    expect(off.npcData({ type: "npc" })).toBeNull();

    const pf2e = manager("pf2e");
    pf2e.register(adapter());
    expect(pf2e.handles("Actor")).toBe(false);
  });

  it("validates adapters and rejects duplicates", () => {
    const m = manager();
    m.register(adapter());
    expect(() => m.register(adapter())).toThrow(/already/);
    expect(() => m.register(adapter({ id: "Bad Id" }))).toThrow(/id/);
    expect(() => m.register({ ...adapter({ id: "x" }), canHandle: undefined } as never)).toThrow(/canHandle/);
  });

  it("isolates adapter failures", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const m = manager();
    m.register(
      adapter({
        getNpcData: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(m.npcData({ type: "npc" })).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("htmlToText", () => {
  it("keeps block text as paragraphs and drops markup", () => {
    expect(
      htmlToText("<p>One <strong>bold</strong></p><ul><li>a</li><li>b</li></ul><div><p>Two</p></div>"),
    ).toBe("One bold\n\na\n\nb\n\nTwo");
    expect(htmlToText("Plain <em>text</em>")).toBe("Plain text");
    expect(htmlToText("<p> </p><img src=x onerror=alert(1)>")).toBe("");
    expect(htmlToText(undefined)).toBe("");
  });
});

describe("npcTemplateValues", () => {
  const core = testCore();
  const localize = (key: string) => key;
  const format = (key: string, data: Record<string, string>) => `${key}:${data.name}`;

  it("fills a card with public data and a link to the source actor, never with placeholders", () => {
    const values = npcTemplateValues(npc, "npc-card", { localize, format });
    expect(values).toMatchObject({
      name: "Mira Vell",
      image: "worlds/art/mira.webp",
      alt: "LOREFRAME.Integration.PortraitAlt:Mira Vell",
      ancestry: "Humanoid (Elf)",
      occupation: "",
      summary: "Keeper of the lighthouse.\n\nShe trades in secrets.",
      personality: "Curt but fair",
      goal: "Keep the light burning",
      location: "",
      notes: "@UUID[Actor.a1]{Mira Vell}",
    });
    const html = core.renderer.render("npc-card", { instanceId: "c", values });
    expect(html).not.toContain("smuggler");
    expect(html).not.toContain('data-loreframe-field="location"');
    expect(html).not.toContain("occupation");
  });

  it("fills a dossier, keeps GM text in the secret and switches off empty sections", () => {
    const values = npcTemplateValues(npc, "npc-dossier", { localize, format });
    expect(values).toMatchObject({
      role: "CR 3 · Neutral",
      summary: "Keeper of the lighthouse.\n\nShe trades in secrets.\n\n@UUID[Actor.a1]{Mira Vell}",
      personality: "Curt but fair",
      motivation: "Keep the light burning",
      relationships: "Owes the guild",
      secrets: "She is the smuggler queen.",
      "show-appearance": false,
      "show-fears": false,
      "show-voice": false,
      "show-goals": false,
      "show-knowledge": false,
      "show-rumours": false,
      "show-personality": true,
      "show-secrets": true,
    });
    const html = core.renderer.render("npc-dossier", { instanceId: "d", values });
    const doc = parseString(html);
    const secret = html.indexOf('<section class="secret">');
    expect(secret).toBeGreaterThan(0);
    expect(html.indexOf("smuggler")).toBeGreaterThan(secret);
    expect(readBlockValues(locateBlock(doc, "d")!.root, core.templates.get("npc-dossier")!)).toMatchObject({
      name: "Mira Vell",
      "show-fears": false,
    });
  });

  it("switches the secret off when there is no GM text and omits a missing portrait", () => {
    const values = npcTemplateValues({ ...npc, secrets: "", image: "" }, "npc-dossier", { localize, format });
    expect(values["show-secrets"]).toBe(false);
    expect(values.image).toBe("");
  });

  it("rejects templates it cannot fill", () => {
    expect(() => npcTemplateValues(npc, "gallery", { localize, format })).toThrow(/gallery/);
  });
});

describe("GM secrets in system HTML (0.1.1)", () => {
  const html =
    '<p>Public face.</p><section class="secret" id="secret-a"><p>He is the killer.</p></section><p>Likes tea.</p>';

  it("never puts the content of Foundry secrets into public text", () => {
    expect(htmlToText(html)).toBe("Public face.\n\nLikes tea.");
    expect(htmlToText('<div><section class="secret revealed"><p>Also hidden</p></section></div>')).toBe("");
  });

  it("can read the secrets on their own, or everything for GM-only destinations", () => {
    expect(secretText(html)).toBe("He is the killer.");
    expect(htmlToText(html, { keepSecrets: true })).toBe("Public face.\n\nHe is the killer.\n\nLikes tea.");
  });
});

describe("createDocumentDropHandler", () => {
  function setupHandler(
    options: {
      hasPermission?: boolean;
      npcData?: LoreframeNpcData | null;
      choice?: "link" | "npc-card" | "npc-dossier" | null;
      relativePage?: string;
      editable?: boolean;
    } = {},
  ) {
    const integrations = new IntegrationManager({ systemId: () => "dnd5e", enabled: () => true });
    integrations.register(
      adapter({
        canHandle: () => true,
        getNpcData: () => (options.npcData === undefined ? npc : options.npcData),
      }),
    );
    const ui: DropUiPort = {
      resolveDocument: vi.fn(async (uuid) => ({ name: uuid })),
      hasObserverPermission: vi.fn(() => options.hasPermission ?? true),
      chooseInsertion: vi.fn(async () => (options.choice === undefined ? "npc-card" : options.choice)),
      buildContentLink: vi.fn(async ({ uuid, label }) => `@UUID[${uuid}]{${label ?? "Mira Vell"}}`),
      localize: (key) => key,
      format: (key, data) => `${key}:${data.name}`,
      notifyError: vi.fn(),
    };
    const hostEl = {
      hasAttribute: (name: string) => name === "relative" && Boolean(options.relativePage),
      dataset: { documentUuid: options.relativePage },
    };
    const view = {
      editable: options.editable ?? true,
      isDestroyed: false,
      state: EditorState.create({ doc: parseString("<p>Hello world</p>") }),
      dom: { closest: () => hostEl as unknown as HTMLElement } as unknown as Pick<HTMLElement, "closest">,
      dispatch: vi.fn((tr) => {
        view.state = view.state.apply(tr);
      }),
      focus: vi.fn(),
    } satisfies DropView & { state: EditorState };
    const insertBlock = vi.fn(() => true);
    const handler = createDocumentDropHandler({ integrations, insertBlock, ui });
    return { handler, view, ui, insertBlock };
  }

  it("remembers the last block choice per handler and passes values & position to insertBlock", async () => {
    const { handler, view, ui, insertBlock } = setupHandler({ choice: "npc-dossier" });
    const drop: DocumentDrop = {
      type: "Actor",
      uuid: "Actor.a1",
      at: { from: 6, to: 6, deleted: false },
      selection: null,
      label: "",
    };
    await handler.handle(view, drop);
    expect(ui.chooseInsertion).toHaveBeenCalledWith("Mira Vell", "link");
    expect(insertBlock).toHaveBeenCalledWith(view, "npc-dossier", {
      at: 6,
      values: expect.objectContaining({ name: "Mira Vell", "show-secrets": true }),
    });

    await handler.handle(view, drop);
    expect(ui.chooseInsertion).toHaveBeenLastCalledWith("Mira Vell", "npc-dossier");
  });

  it("falls back to inserting a content link when Observer permission is missing", async () => {
    const { handler, view, ui, insertBlock } = setupHandler({
      hasPermission: false,
      relativePage: "JournalEntryPage.p1",
    });
    const drop: DocumentDrop = {
      type: "Actor",
      uuid: "Actor.a1",
      at: { from: 6, to: 6, deleted: false },
      selection: { from: 1, to: 6, deleted: false },
      label: "Hero",
    };
    await handler.handle(view, drop);
    expect(ui.chooseInsertion).not.toHaveBeenCalled();
    expect(insertBlock).not.toHaveBeenCalled();
    expect(ui.buildContentLink).toHaveBeenCalledWith({
      type: "Actor",
      uuid: "Actor.a1",
      relativeTo: { name: "JournalEntryPage.p1" },
      label: "Hero",
    });
    expect(serializeString(view.state.doc)).toContain("@UUID[Actor.a1]{Hero}");
  });

  it("aborts cleanly when the drop position or selection was deleted or user cancels", async () => {
    const cancelled = setupHandler({ choice: null });
    await cancelled.handler.handle(cancelled.view, {
      type: "Actor",
      uuid: "Actor.a1",
      at: { from: 6, to: 6, deleted: false },
      selection: null,
      label: "",
    });
    expect(cancelled.insertBlock).not.toHaveBeenCalled();
    expect(cancelled.view.dispatch).not.toHaveBeenCalled();

    const deletedAt = setupHandler({ choice: "npc-card" });
    await deletedAt.handler.handle(deletedAt.view, {
      type: "Actor",
      uuid: "Actor.a1",
      at: { from: 6, to: 6, deleted: true },
      selection: null,
      label: "",
    });
    expect(deletedAt.insertBlock).not.toHaveBeenCalled();

    const deletedSelection = setupHandler({ hasPermission: false });
    await deletedSelection.handler.handle(deletedSelection.view, {
      type: "Actor",
      uuid: "Actor.a1",
      at: { from: 6, to: 6, deleted: true },
      selection: { from: 1, to: 6, deleted: true },
      label: "Hero",
    });
    expect(deletedSelection.ui.buildContentLink).not.toHaveBeenCalled();
    expect(deletedSelection.view.dispatch).not.toHaveBeenCalled();
  });

  it("logs and notifies InsertFailed on unexpected drop errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, view, ui } = setupHandler();
    vi.mocked(ui.chooseInsertion).mockRejectedValueOnce(new Error("dialog crash"));
    await handler.handle(view, {
      type: "Actor",
      uuid: "Actor.a1",
      at: { from: 6, to: 6, deleted: false },
      selection: null,
      label: "",
    });
    expect(ui.notifyError).toHaveBeenCalledWith("LOREFRAME.Error.InsertFailed");
  });
});
