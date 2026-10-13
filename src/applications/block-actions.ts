import type { EditorView } from "prosemirror-view";
import type { LoreframeRuntime } from "../runtime";
import { locateBlock } from "../editor/block-document";
import { isLoreframeRoot } from "../editor/node-attrs";
import { escapeHtml } from "../utils/html";

/**
 * Delete from the block toolbar. Layouts and page structures, blocks with the author's writing and blocks of unknown
 * templates are only deleted after confirmation: undo does not survive saving the page.
 */
export async function deleteBlockWithConfirmation(
  runtime: LoreframeRuntime,
  view: EditorView,
  instanceId: string,
): Promise<boolean> {
  const block = runtime.readBlock(view, instanceId);
  const worthAsking =
    !block ||
    block.definition.type !== "block" ||
    runtime.writtenFields(view, instanceId).length > 0 ||
    containsBlocks(view, instanceId);
  if (worthAsking) {
    const name = block ? game.i18n.localize(block.definition.name) : instanceId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("LOREFRAME.Toolbar.DeleteTitle"), icon: "fa-solid fa-trash" },
      content: `<p>${game.i18n.format("LOREFRAME.Toolbar.DeleteContent", { name: escapeHtml(name) })}</p>`,
      modal: true,
      yes: { label: game.i18n.localize("LOREFRAME.Toolbar.Delete"), icon: "fa-solid fa-trash" },
    });
    if (confirmed !== true) return false;
  }
  return runtime.deleteBlock(view, instanceId);
}

function containsBlocks(view: EditorView, instanceId: string): boolean {
  const root = locateBlock(view.state.doc, instanceId)?.root;
  let found = false;
  root?.descendants((node) => {
    if (isLoreframeRoot(node)) found = true;
    return !found;
  });
  return found;
}
