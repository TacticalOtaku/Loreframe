import { describe, expect, it } from "vitest";
import { createDnd5eAdapter } from "../src/integrations/dnd5e/dnd5e-adapter";

const adapter = createDnd5eAdapter({
  formatCR: (cr) => (cr === 0.5 ? "½" : String(cr)),
  format: (key, data) => `${key.split(".").at(-1)}(${Object.values(data).join(",")})`,
});

function npc(overrides: Record<string, unknown> = {}, details: Record<string, unknown> = {}) {
  return {
    documentName: "Actor",
    type: "npc",
    uuid: "Actor.n1",
    name: "Mira Vell",
    img: "worlds/art/mira.webp",
    system: {
      details: {
        type: { value: "humanoid", subtype: "elf", label: "Humanoid (Elf)" },
        alignment: "Chaotic Good",
        cr: 0.5,
        ideal: "Freedom for the harbour",
        bond: "Owes the lantern guild",
        flaw: "Cannot resist a wager",
        race: null,
        biography: {
          value: "<p>Runs the <em>smuggling</em> ring.</p>",
          public: "<p>Keeper of the light.</p>",
        },
        ...details,
      },
    },
    itemTypes: { class: [] },
    ...overrides,
  };
}

describe("dnd5e adapter", () => {
  it("declares its system and document types", () => {
    expect(adapter).toMatchObject({ id: "dnd5e", systemId: "dnd5e", documentTypes: ["Actor"] });
    expect(adapter.canHandle(npc())).toBe(true);
    expect(adapter.canHandle(npc({ type: "character" }))).toBe(true);
    expect(adapter.canHandle(npc({ type: "vehicle" }))).toBe(false);
    expect(adapter.canHandle(npc({ documentName: "Item" }))).toBe(false);
    expect(adapter.canHandle(null)).toBe(false);
  });

  it("maps an NPC: public biography is the summary, the private one becomes the GM secret", () => {
    expect(adapter.getNpcData!(npc())).toEqual({
      uuid: "Actor.n1",
      name: "Mira Vell",
      image: "worlds/art/mira.webp",
      ancestry: "Humanoid (Elf)",
      occupation: "",
      role: "Challenge(½) · Chaotic Good",
      summary: "Keeper of the light.",
      appearance: "",
      personality: "",
      motivation: "Freedom for the harbour",
      relationships: "Owes the lantern guild",
      fears: "Cannot resist a wager",
      secrets: "Runs the smuggling ring.",
    });
  });

  it("maps a player character: species, classes, appearance and traits; its biography is not secret", () => {
    const pc = npc(
      {
        type: "character",
        itemTypes: {
          class: [
            { name: "Wizard", system: { levels: 5 } },
            { name: "Fighter", system: { levels: 2 } },
          ],
        },
      },
      {
        race: { name: "Half-Elf" },
        appearance: "Silver hair",
        trait: "Hums while reading",
        biography: { value: "<p>Grew up in the docks.</p>", public: "" },
        cr: undefined,
      },
    );
    expect(adapter.getNpcData!(pc)).toMatchObject({
      ancestry: "Half-Elf",
      occupation: "Wizard 5 / Fighter 2",
      role: "Chaotic Good",
      appearance: "Silver hair",
      personality: "Hums while reading",
      summary: "Grew up in the docks.",
      secrets: "",
    });
  });

  it("treats Foundry's default portrait as no portrait and tolerates missing data", () => {
    const bare = npc(
      { img: "icons/svg/mystery-man.svg" },
      {
        type: undefined,
        alignment: undefined,
        cr: null,
        ideal: undefined,
        biography: undefined,
        race: "abc123",
      },
    );
    expect(adapter.getNpcData!(bare)).toMatchObject({
      image: "",
      ancestry: "",
      role: "",
      summary: "",
      secrets: "",
      motivation: "",
    });
  });

  it("keeps Foundry secrets out of public summaries and routes them to the GM secret", () => {
    const secret = '<section class="secret" id="secret-s"><p>Plots against the duke.</p></section>';
    const npcData = adapter.getNpcData!(
      npc({}, { biography: { value: "<p>Smuggler.</p>", public: "<p>Harbour master.</p>" + secret } }),
    );
    expect(npcData).toMatchObject({
      summary: "Harbour master.",
      secrets: "Smuggler.\n\nPlots against the duke.",
    });
    const pc = adapter.getNpcData!(
      npc(
        { type: "character" },
        { biography: { value: "<p>Grew up in the docks.</p>" + secret, public: "" } },
      ),
    );
    expect(pc).toMatchObject({ summary: "Grew up in the docks.", secrets: "Plots against the duke." });
  });
});
