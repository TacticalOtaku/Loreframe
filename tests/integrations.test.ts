import { describe, expect, it, vi } from "vitest";
import { IntegrationManager } from "../src/integrations/integration-manager";
import { htmlToText, npcTemplateValues, secretText } from "../src/integrations/npc-values";
import type { LoreframeNpcData, LoreframeSystemAdapter } from "../src/integrations/types";
import { locateBlock, readBlockValues } from "../src/editor/block-document";
import { parseString } from "./helpers/schema";
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
