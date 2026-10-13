/**
 * System adapter boundary (spec §34). Core code only sees these system-neutral shapes; everything that knows a
 * game system's data model lives in `src/integrations/<system>/` or in another module's adapter.
 */

/** A snapshot of a character, already reduced to plain text. Empty strings mean "no data". */
export interface LoreframeNpcData {
  /** Source document uuid, linked from the snapshot. */
  uuid: string;
  name: string;
  image: string;
  ancestry: string;
  occupation: string;
  /** Short role line, e.g. challenge and alignment. */
  role: string;
  /** Public description; paragraphs separated by blank lines. */
  summary: string;
  appearance: string;
  personality: string;
  motivation: string;
  relationships: string;
  fears: string;
  /** GM-only text. Only ever rendered inside a Foundry secret. */
  secrets: string;
}

export interface LoreframeSystemAdapter {
  id: string;
  /** Game system this adapter is for; the integration manager ignores it in other systems. */
  systemId: string;
  /** Document types (e.g. "Actor") whose drops the adapter wants to offer Loreframe insertion for. */
  documentTypes: readonly string[];
  canHandle(document: unknown): boolean;
  getNpcData?(document: unknown): LoreframeNpcData | null;
}
