import { htmlToText, secretText } from "../html-text";
import type { LoreframeNpcData, LoreframeSystemAdapter } from "../types";

/**
 * dnd5e 5.3.3 adapter (spec §34, §35). The only code that knows dnd5e's Actor data model:
 * `system.details.{type, race, alignment, cr, ideal, bond, flaw, biography}` (NPCData / CharacterData) and, for
 * player characters, `details.{appearance, trait}` and class items. Everything is read defensively.
 */
export interface Dnd5eAdapterDeps {
  /** `dnd5e.utils.formatCR`. */
  formatCR(cr: number): string;
  format(key: string, data: Record<string, string>): string;
}

const DEFAULT_PORTRAIT = /(^|\/)icons\/svg\/mystery-man\.svg$/;

type Bag = Record<string, unknown>;

const bag = (value: unknown): Bag => (typeof value === "object" && value !== null ? (value as Bag) : {});
const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function createDnd5eAdapter(deps: Dnd5eAdapterDeps): LoreframeSystemAdapter {
  return {
    id: "dnd5e",
    systemId: "dnd5e",
    documentTypes: ["Actor"],
    canHandle: (document) => {
      const doc = bag(document);
      return doc.documentName === "Actor" && (doc.type === "npc" || doc.type === "character");
    },
    getNpcData: (document) => toNpcData(bag(document), deps),
  };
}

function toNpcData(actor: Bag, deps: Dnd5eAdapterDeps): LoreframeNpcData {
  const details = bag(bag(actor.system).details);
  const biography = bag(details.biography);
  const isCharacter = actor.type === "character";
  // details.race is the species Item, or an unresolved id string when the item is missing.
  const species = str(bag(details.race).name);
  const cr = typeof details.cr === "number" ? details.cr : null;
  const challenge =
    !isCharacter && cr !== null
      ? deps.format("LOREFRAME.Integration.Dnd5e.Challenge", { cr: deps.formatCR(cr) })
      : "";
  const image = str(actor.img);

  const publicBio = str(biography.public);
  const privateBio = str(biography.value);
  // Public text never includes Foundry secrets; they only ever go into the GM secret of the snapshot.
  const publicText = htmlToText(publicBio);
  const privateText = htmlToText(privateBio);
  const gmText = [
    isCharacter ? secretText(privateBio) : htmlToText(privateBio, { keepSecrets: true }),
    secretText(publicBio),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    uuid: str(actor.uuid),
    name: str(actor.name),
    image: DEFAULT_PORTRAIT.test(image) ? "" : image,
    ancestry: species || str(bag(details.type).label),
    occupation: isCharacter ? classSummary(actor) : "",
    role: [challenge, str(details.alignment)].filter(Boolean).join(" · "),
    // NPC sheets are GM material: only the public biography is shown openly. A player character's biography is
    // already visible to its players.
    summary: isCharacter ? publicText || privateText : publicText,
    appearance: isCharacter ? str(details.appearance) : "",
    personality: isCharacter ? str(details.trait) : "",
    motivation: str(details.ideal),
    relationships: str(details.bond),
    fears: str(details.flaw),
    secrets: gmText,
  };
}

function classSummary(actor: Bag): string {
  const classes = bag(actor.itemTypes).class;
  if (!Array.isArray(classes)) return "";
  return classes
    .map((item) => {
      const name = str(bag(item).name);
      const levels = bag(bag(item).system).levels;
      return name && typeof levels === "number" ? `${name} ${levels}` : name;
    })
    .filter(Boolean)
    .join(" / ");
}
