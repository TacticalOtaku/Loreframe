import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type * as PMStateModule from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { DATA_ATTR } from "../constants";
import { getHtmlAttribute, isLoreframeRoot, isLoreframeSlot, isSecretWrapper } from "./node-attrs";

/** The parts of `prosemirror-state` this module needs; Foundry supplies them as `ProseMirror.state`. */
export type StateModule = Pick<typeof PMStateModule, "Selection" | "TextSelection">;

export interface InsertOptions {
  /** `data-loreframe-field` whose first textblock receives the selection. */
  focusField?: string;
}

/**
 * Build a transaction that places a block-level node at the user's cursor.
 *
 * - Inside a Loreframe block, blocks nest only in slot regions (`data-loreframe-slot`). From any other part of a
 *   block (label, content fields) the new block goes after that Loreframe block and the selection is kept, so
 *   consecutive inserts never replace the previous block's selected placeholder.
 * - Otherwise a non-empty selection is deleted first, then handled like a cursor.
 * - A cursor in an empty textblock replaces that textblock (when the parent allows it).
 * - Otherwise the block goes directly after the textblock holding the cursor.
 * - If the block ends up last in its parent, an empty paragraph follows so writing can continue.
 * - The focus field's text (or the block's last textblock) is selected, so typing replaces the placeholder.
 */
export function insertBlockTransaction(
  state: EditorState,
  block: PMNode,
  pm: StateModule,
  options: InsertOptions = {},
): Transaction {
  const tr = state.tr;
  const hostDepth = enclosingBlockDepth(state.selection.$from);
  let from: number;
  let to: number;
  if (hostDepth !== null) {
    from = to = state.selection.$from.after(hostDepth);
  } else {
    if (!state.selection.empty) tr.deleteSelection();
    ({ from, to } = cursorRange(tr, block));
  }

  const stepIndex = tr.steps.length;
  tr.replaceRangeWith(from, to, block);
  const blockPos = findInsertedBlock(tr, stepIndex, block);
  if (blockPos === null) throw new Error("Inserted block could not be located in the document");

  const blockEnd = blockPos + block.nodeSize;
  appendParagraphIfLast(tr, blockEnd);
  const target =
    (options.focusField ? fieldTextRange(tr.doc, blockPos, blockEnd, options.focusField) : null) ??
    lastTextblockRange(tr.doc, blockPos, blockEnd);
  tr.setSelection(
    target
      ? pm.TextSelection.create(tr.doc, target.from, target.to)
      : pm.Selection.near(tr.doc.resolve(blockEnd), -1),
  );
  return tr.scrollIntoView();
}

/** Depth of the nearest Loreframe block root around `$pos` that is not separated from it by a slot. */
function enclosingBlockDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isLoreframeSlot(node)) return null;
    if (isLoreframeRoot(node)) return depth > 1 && isSecretWrapper($pos.node(depth - 1)) ? depth - 1 : depth;
  }
  return null;
}

/** Where a block goes for a cursor outside Loreframe blocks (or inside a slot). */
function cursorRange(tr: Transaction, block: PMNode): { from: number; to: number } {
  const { $from } = tr.selection;
  if ($from.depth === 0) return { from: $from.pos, to: $from.pos };
  const parent = $from.parent;
  const container = $from.node(-1);
  const index = $from.index(-1);
  const replaceParent =
    parent.isTextblock && parent.content.size === 0 && container.canReplaceWith(index, index + 1, block.type);
  return { from: replaceParent ? $from.before() : $from.after(), to: $from.after() };
}

function findInsertedBlock(tr: Transaction, stepIndex: number, block: PMNode): number | null {
  let start = 0;
  let end = tr.doc.content.size;
  tr.steps[stepIndex]?.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
    start = newStart;
    end = newEnd;
  });
  let found: number | null = null;
  tr.doc.nodesBetween(start, end, (node, pos) => {
    if (found !== null) return false;
    if (pos >= start && node.eq(block)) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function appendParagraphIfLast(tr: Transaction, blockEnd: number): void {
  const paragraph = tr.doc.type.schema.nodes.paragraph;
  if (!paragraph) return;
  const $end = tr.doc.resolve(blockEnd);
  const index = $end.index();
  if (index < $end.parent.childCount) return;
  if (!$end.parent.canReplaceWith(index, index, paragraph)) return;
  tr.insert(blockEnd, paragraph.create());
}

/** Content range of the last textblock between `from` and `to`. */
function lastTextblockRange(doc: PMNode, from: number, to: number): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    range = { from: pos + 1, to: pos + 1 + node.content.size };
    return false;
  });
  return range;
}

/** Content range of the first textblock inside (or being) the field or slot named `field`. */
function fieldTextRange(
  doc: PMNode,
  from: number,
  to: number,
  field: string,
): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null;
  let inField = -1;
  doc.nodesBetween(from, to, (node, pos) => {
    if (range) return false;
    const name = getHtmlAttribute(node, DATA_ATTR.field) ?? getHtmlAttribute(node, DATA_ATTR.slot);
    if (inField < 0 && name === field) inField = pos + node.nodeSize;
    if (inField >= 0 && pos < inField && node.isTextblock) {
      range = { from: pos + 1, to: pos + 1 + node.content.size };
      return false;
    }
    return true;
  });
  return range;
}
