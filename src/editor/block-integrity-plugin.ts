import type { Plugin as PMPlugin, Transaction } from "prosemirror-state";
import { DATA_ATTR } from "../constants";
import { identityOf } from "./node-attrs";

type PluginConstructor = typeof PMPlugin;

export interface BlockIntegrityPluginDeps {
  /** Foundry: `ProseMirror.state.Plugin`. */
  Plugin: PluginConstructor;
  newInstanceId(): string;
}

const COPY_EVENTS = new Set(["paste", "drop"]);
/** Marker prosemirror-view reads to treat clipboard HTML as a closed slice ("openStart openEnd context"). */
const CLOSED_SLICE = "0 0 []";
const BLOCK_CONTAINERS = new Set([
  "ASIDE",
  "DIV",
  "SECTION",
  "HEADER",
  "FOOTER",
  "ARTICLE",
  "NAV",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "FIGURE",
]);
const IGNORED_TOP_LEVEL = new Set(["META", "STYLE", "LINK", "TITLE"]);

/**
 * Keeps Loreframe blocks whole and uniquely identified through copy and paste:
 * - clipboard HTML holding a block at top level is parsed as a closed slice, so ProseMirror does not
 *   dissolve the block into the surrounding paragraph (HTML copied outside the editor has no slice marker);
 * - pasted or dropped copies get new instance ids (and Foundry secret ids); the pre-existing node keeps its id,
 *   a moved node keeps its id.
 * Ordinary edits are ignored, so the document is never scanned on keystrokes.
 */
export function buildBlockIntegrityPlugin({ Plugin, newInstanceId }: BlockIntegrityPluginDeps): PMPlugin {
  return new Plugin({
    props: {
      transformPastedHTML: (html: string) => closeClipboardSlice(html),
    },
    appendTransaction(transactions: readonly Transaction[], oldState, newState) {
      const copied = transactions.some(
        (tr) => tr.docChanged && COPY_EVENTS.has(String(tr.getMeta("uiEvent"))),
      );
      if (!copied) return null;

      // Where each pre-existing identity ended up; null when its original node was deleted (a move).
      const anchors = new Map<string, number | null>();
      oldState.doc.descendants((node, pos) => {
        const key = identityOf(node)?.key;
        if (!key || anchors.has(key)) return;
        let mapped: number | null = pos;
        for (const tr of transactions) {
          if (mapped === null) break;
          const result = tr.mapping.mapResult(mapped, 1);
          mapped = result.deleted ? null : result.pos;
        }
        anchors.set(key, mapped);
      });

      const seen = new Set<string>();
      const tr = newState.tr;
      newState.doc.descendants((node, pos) => {
        const identity = identityOf(node);
        if (!identity) return;
        const anchor = anchors.get(identity.key);
        const keep = anchor === undefined || anchor === null ? !seen.has(identity.key) : anchor === pos;
        seen.add(identity.key);
        if (!keep) tr.setNodeMarkup(pos, undefined, identity.renamed(newInstanceId()));
      });
      return tr.docChanged ? tr : null;
    },
  });
}

/**
 * Mark foreign clipboard HTML that carries a Loreframe block at top level as a closed slice.
 * HTML produced by ProseMirror itself (already marked) and HTML without top-level blocks pass through unchanged.
 */
export function closeClipboardSlice(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = template.content;
  if (root.querySelector("[data-pm-slice]")) return html;

  const topLevel = [...root.children].filter((el) => !IGNORED_TOP_LEVEL.has(el.tagName));
  if (!topLevel.some(isBlockOrWrappedBlock)) return html;

  // A closed slice makes the parser preserve whitespace, so drop formatting whitespace between blocks.
  removeBlockWhitespace(root);
  topLevel[0]?.setAttribute("data-pm-slice", CLOSED_SLICE);
  return template.innerHTML;
}

/** A block root, or a bare secret section wrapping one (GM-only templates). */
function isBlockOrWrappedBlock(el: Element): boolean {
  if (el.hasAttribute(DATA_ATTR.template)) return true;
  const only = el.childElementCount === 1 ? el.firstElementChild : null;
  return el.matches("section.secret") && only !== null && only.hasAttribute(DATA_ATTR.template);
}

function removeBlockWhitespace(parent: ParentNode): void {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) child.remove();
    else if (child.nodeType === Node.COMMENT_NODE) child.remove();
    else if (child instanceof Element && BLOCK_CONTAINERS.has(child.tagName)) removeBlockWhitespace(child);
  }
}
