import type { Transaction } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { formatLink } from "../core/links";
import type { DocumentDrop } from "../editor/document-drop";
import type { TemplateValues } from "../types";
import { logger } from "../utils/logger";
import type { IntegrationManager } from "./integration-manager";
import type { LoreframeNpcData } from "./types";

export type DropChoice = "link" | "npc-card" | "npc-dossier";

export interface DropView {
  readonly editable: boolean;
  readonly isDestroyed?: boolean;
  readonly state: EditorState;
  readonly dom: Pick<HTMLElement, "closest">;
  dispatch(tr: Transaction): void;
  focus(): void;
}

export interface DropDocument {
  name?: string;
}

export interface DropUiPort {
  resolveDocument(uuid: string): Promise<DropDocument | null>;
  hasObserverPermission(document: DropDocument): boolean;
  chooseInsertion(name: string, defaultChoice: DropChoice): Promise<DropChoice | null>;
  buildContentLink(options: {
    type: string;
    uuid: string;
    relativeTo: DropDocument | null;
    label?: string;
  }): Promise<string | null>;
  localize(key: string): string;
  format(key: string, data: Record<string, string>): string;
  notifyError(key: string): void;
}

export interface DocumentDropHandlerDeps {
  integrations: Pick<IntegrationManager, "npcData">;
  insertBlock(view: DropView, templateId: string, options: { values: TemplateValues; at: number }): boolean;
  ui: DropUiPort;
}

export interface DocumentDropHandler {
  handle(view: DropView, drop: DocumentDrop): Promise<void>;
}

export interface NpcValueDeps {
  localize(key: string): string;
  format(key: string, data: Record<string, string>): string;
}

const DOSSIER_SECTIONS = ["appearance", "personality", "motivation", "relationships", "fears"] as const;
const DOSSIER_EMPTY = ["voice", "goals", "knowledge", "rumours"];

/**
 * Template values for a snapshot of `npc` (spec §35). Missing data is an empty value, never placeholder text; GM-only
 * text is only used where the template renders it inside a Foundry secret.
 */
export function npcTemplateValues(
  npc: LoreframeNpcData,
  templateId: string,
  deps: NpcValueDeps,
): TemplateValues {
  const link = formatLink({ uuid: npc.uuid, label: npc.name });
  const common: TemplateValues = {
    name: npc.name,
    image: npc.image,
    alt: deps.format("LOREFRAME.Integration.PortraitAlt", { name: npc.name }),
    ancestry: npc.ancestry,
    occupation: npc.occupation,
  };
  switch (templateId) {
    case "npc-card":
      return {
        ...common,
        summary: npc.summary,
        personality: firstSentence(npc.personality),
        goal: firstSentence(npc.motivation),
        location: "",
        notes: link,
      };
    case "npc-dossier": {
      const values: TemplateValues = {
        ...common,
        role: npc.role,
        summary: [npc.summary, link].filter(Boolean).join("\n\n"),
        secrets: npc.secrets,
        "show-summary": true,
        "show-secrets": npc.secrets !== "",
      };
      for (const field of DOSSIER_SECTIONS) {
        values[field] = npc[field];
        values[`show-${field}`] = npc[field] !== "";
      }
      for (const field of DOSSIER_EMPTY) {
        values[field] = "";
        values[`show-${field}`] = false;
      }
      return values;
    }
    default:
      throw new Error(`Template "${templateId}" cannot be filled from NPC data`);
  }
}

/** Card facts are one line: keep the first sentence of longer text. */
function firstSentence(text: string): string {
  const line = text.split("\n")[0] ?? "";
  const match = /^(.+?[.!?])(\s|$)/.exec(line);
  return (match?.[1] ?? line).trim();
}

/**
 * Actor -> NPC snapshot (spec §35): ask how to insert a dropped document, then insert a Foundry link or a block
 * filled from the system adapter. Keeps session memory of the last chosen block template (`lastChoice`) inside
 * the handler instance instead of module global state, and aborts cleanly if the drop location was deleted.
 */
export function createDocumentDropHandler(deps: DocumentDropHandlerDeps): DocumentDropHandler {
  const { integrations, insertBlock, ui } = deps;
  let lastChoice: DropChoice = "link";

  async function resolveSafe(uuid: string): Promise<DropDocument | null> {
    try {
      return await ui.resolveDocument(uuid);
    } catch (error) {
      logger.warn(`Could not resolve dropped document "${uuid}"`, error);
      return null;
    }
  }

  /**
   * The same link Foundry's own content-link plugin would insert (common/prosemirror/content-link-plugin.mjs):
   * relative to the page in editors marked `relative`, labelled by and replacing a non-empty selection.
   */
  async function insertLink(view: DropView, drop: DocumentDrop): Promise<void> {
    const useSelection = drop.selection !== null && !drop.selection.deleted;
    if (!useSelection && drop.at.deleted) return;

    const host = view.dom.closest<HTMLElement>("prose-mirror");
    const pageUuid = host?.hasAttribute("relative")
      ? (host.dataset.documentUuid ?? host.dataset.documentUUID)
      : undefined;
    const relativeTo = pageUuid ? await resolveSafe(pageUuid) : null;
    const link = await ui.buildContentLink({
      type: drop.type,
      uuid: drop.uuid,
      relativeTo,
      ...(useSelection && drop.label ? { label: drop.label } : {}),
    });
    if (!link || view.isDestroyed || !view.editable) return;
    if (useSelection && drop.selection?.deleted) return;
    if (!useSelection && drop.at.deleted) return;

    const { tr, schema } = view.state;
    const size = tr.doc.content.size;
    if (useSelection && drop.selection) {
      tr.replaceWith(
        Math.min(drop.selection.from, size),
        Math.min(drop.selection.to, size),
        schema.text(link),
      );
    } else {
      tr.insertText(link, Math.min(drop.at.from, size));
    }
    view.dispatch(tr);
    view.focus();
  }

  return {
    async handle(view, drop) {
      try {
        const document = await resolveSafe(drop.uuid);
        // A snapshot copies the document's data into the page: require Observer permission (spec §44).
        const readable = document !== null && ui.hasObserverPermission(document);
        const npc = readable ? integrations.npcData(document) : null;
        const choice = npc ? await ui.chooseInsertion(npc.name, lastChoice) : "link";
        if (choice === null || view.isDestroyed || !view.editable) return;

        if (choice === "link" || !npc) {
          await insertLink(view, drop);
          return;
        }
        if (drop.at.deleted) return;
        lastChoice = choice;
        const values = npcTemplateValues(npc, choice, {
          localize: ui.localize,
          format: ui.format,
        });
        insertBlock(view, choice, { values, at: drop.at.from });
      } catch (error) {
        logger.error("Document drop failed", error);
        ui.notifyError("LOREFRAME.Error.InsertFailed");
      }
    },
  };
}
