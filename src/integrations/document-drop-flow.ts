import type { EditorView } from "prosemirror-view";
import type { DocumentDrop } from "../editor/document-drop";
import type { LoreframeRuntime } from "../runtime";
import { escapeHtml } from "../utils/html";
import { logger } from "../utils/logger";
import { npcTemplateValues } from "./npc-values";

type Choice = "link" | "npc-card" | "npc-dossier";

interface DroppedDocument {
  name?: string;
  testUserPermission?(user: unknown, permission: "OBSERVER"): boolean;
}

const CHOICES: { value: Choice; label: string }[] = [
  { value: "link", label: "LOREFRAME.Integration.InsertAs.Link" },
  { value: "npc-card", label: "LOREFRAME.Template.NpcCard.Name" },
  { value: "npc-dossier", label: "LOREFRAME.Template.NpcDossier.Name" },
];

/** The last choice made in this session; the standard Foundry link until the author picks something else. */
let lastChoice: Choice = "link";

/**
 * Actor → NPC snapshot (spec §35): ask how to insert a dropped document, then insert a Foundry link or a block
 * filled from the system adapter. The block is an independent copy; later Actor changes do not rewrite it.
 */
export async function handleDocumentDrop(
  runtime: LoreframeRuntime,
  view: EditorView,
  drop: DocumentDrop,
): Promise<void> {
  try {
    await dropDocument(runtime, view, drop);
  } finally {
    drop.at.release();
    drop.selection?.release();
  }
}

async function dropDocument(runtime: LoreframeRuntime, view: EditorView, drop: DocumentDrop): Promise<void> {
  let document: DroppedDocument | null = null;
  try {
    document = await foundry.utils.fromUuid(drop.uuid);
  } catch (error) {
    logger.warn(`Could not resolve dropped document "${drop.uuid}"`, error);
  }
  // A snapshot copies the document's data into the page: require the access needed to read that data (spec §44).
  const readable = document?.testUserPermission?.(game.user, "OBSERVER") === true;
  const npc = document && readable ? runtime.integrations.npcData(document) : null;
  const choice = npc ? await chooseInsertion(npc.name) : "link";
  if (choice === null || view.isDestroyed || !view.editable) return;

  if (choice === "link" || !npc) {
    await insertLink(view, drop);
    return;
  }
  lastChoice = choice;
  const values = npcTemplateValues(npc, choice, {
    localize: (key) => game.i18n.localize(key),
    format: (key, data) => game.i18n.format(key, data),
  });
  runtime.insert(view, choice, { values, at: drop.at.from });
}

/**
 * The same link Foundry's own content-link plugin would insert (common/prosemirror/content-link-plugin.mjs): relative
 * to the page in editors marked `relative`, labelled by and replacing a non-empty selection.
 */
async function insertLink(view: EditorView, drop: DocumentDrop): Promise<void> {
  const { TextEditor } = foundry.applications.ux;
  const host = view.dom.closest<HTMLElement>("prose-mirror");
  const pageUuid = host?.hasAttribute("relative")
    ? (host.dataset.documentUuid ?? host.dataset.documentUUID)
    : undefined;
  const relativeTo = pageUuid ? await foundry.utils.fromUuid(pageUuid) : null;
  const useSelection = drop.selection !== null && !drop.selection.deleted;
  const link = await TextEditor.implementation.getContentLink(
    { type: drop.type, uuid: drop.uuid },
    { ...(relativeTo ? { relativeTo } : {}), ...(useSelection && drop.label ? { label: drop.label } : {}) },
  );
  if (!link || view.isDestroyed || !view.editable) return;
  const { tr, schema } = view.state;
  const size = tr.doc.content.size;
  if (useSelection && drop.selection) {
    tr.replaceWith(Math.min(drop.selection.from, size), Math.min(drop.selection.to, size), schema.text(link));
  } else {
    tr.insertText(link, Math.min(drop.at.from, size));
  }
  view.dispatch(tr);
  view.focus();
}

async function chooseInsertion(name: string): Promise<Choice | null> {
  const options = CHOICES.map(
    ({ value, label }) => `
      <label class="loreframe-insert-as__option">
        <input type="radio" name="loreframeInsertAs" value="${value}" ${value === lastChoice ? "checked" : ""}>
        <span>${escapeHtml(game.i18n.localize(label))}</span>
      </label>`,
  ).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("LOREFRAME.Integration.InsertAs.Title"),
      icon: "fa-solid fa-user-plus",
    },
    classes: ["loreframe", "loreframe-insert-as"],
    content: `
      <p class="loreframe-insert-as__hint">${escapeHtml(game.i18n.format("LOREFRAME.Integration.InsertAs.Hint", { name }))}</p>
      <fieldset class="loreframe-insert-as__choices">
        <legend>${escapeHtml(game.i18n.localize("LOREFRAME.Integration.InsertAs.Label"))}</legend>
        ${options}
      </fieldset>`,
    buttons: [
      {
        action: "insert",
        label: game.i18n.localize("LOREFRAME.Integration.InsertAs.Insert"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => {
          const checked = button.form?.querySelector<HTMLInputElement>(
            "input[name=loreframeInsertAs]:checked",
          );
          return checked?.value ?? "link";
        },
      },
      { action: "cancel", label: game.i18n.localize("COMMON.Cancel"), icon: "fa-solid fa-xmark" },
    ],
  });
  if (result === "link" || result === "npc-card" || result === "npc-dossier") return result;
  return null;
}
