import type { Plugin as PMPlugin, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/** A document range kept current through later edits (local or collaborative) until it is released. */
export interface TrackedRange {
  from: number;
  to: number;
  /** The whole range was deleted by an edit. */
  deleted: boolean;
  release(): void;
}

export interface DocumentDrop {
  type: string;
  uuid: string;
  /** Where the document was dropped. */
  at: TrackedRange;
  /** The selection at drop time when it was not empty: Foundry replaces it with a link labelled by its text. */
  selection: TrackedRange | null;
  label: string;
}

export interface DocumentDropDeps {
  Plugin: typeof PMPlugin;
  /** Foundry's `TextEditor.implementation.getDragEventData`. */
  getDragData(event: DragEvent): { type?: unknown; uuid?: unknown };
  /** Whether Loreframe offers its own insertion for this document type (an active system adapter handles it). */
  claims(documentType: string): boolean;
  /** Release the drop's ranges when done. */
  onDrop(view: EditorView, drop: DocumentDrop): void;
}

/**
 * Targeted drop handling (spec §35): claims only document drops a system adapter can turn into a block; everything
 * else stays with Foundry's content-link plugin. The work after the claim is asynchronous (dialog, document lookup)
 * and Journal text pages are edited collaboratively, so the drop's positions are mapped through every later change.
 */
export function buildDocumentDropPlugin(deps: DocumentDropDeps): PMPlugin {
  const tracked = new Set<TrackedRange>();
  const track = (from: number, to: number): TrackedRange => {
    const range: TrackedRange = { from, to, deleted: false, release: () => tracked.delete(range) };
    tracked.add(range);
    return range;
  };
  const map = (tr: Transaction) => {
    for (const range of tracked) {
      const start = tr.mapping.mapResult(range.from, 1);
      const end = tr.mapping.mapResult(range.to, -1);
      range.deleted ||= start.deleted && end.deleted && range.from !== range.to;
      range.from = start.pos;
      range.to = Math.max(start.pos, end.pos);
    }
  };

  return new deps.Plugin({
    state: {
      init: () => null,
      apply(tr, value) {
        if (tr.docChanged && tracked.size) map(tr);
        return value;
      },
    },
    props: {
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const data = deps.getDragData(event);
        if (typeof data.type !== "string" || typeof data.uuid !== "string" || !data.uuid) return false;
        if (!deps.claims(data.type)) return false;
        const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!target) return false;
        event.preventDefault();
        event.stopPropagation();
        const { selection, doc } = view.state;
        deps.onDrop(view, {
          type: data.type,
          uuid: data.uuid,
          at: track(target.pos, target.pos),
          selection: selection.empty ? null : track(selection.from, selection.to),
          label: selection.empty ? "" : doc.textBetween(selection.from, selection.to, " "),
        });
        return true;
      },
    },
  });
}

/**
 * Add a plugin in front of the others. Foundry adds its content-link drop plugin before `createProseMirrorEditor`
 * runs and builds the editor from `Object.values(plugins)`, so order decides which `handleDrop` wins.
 */
export function prependPlugin<T>(plugins: Record<string, T>, key: string, plugin: T): void {
  const existing = Object.entries(plugins);
  for (const [name] of existing) Reflect.deleteProperty(plugins, name);
  plugins[key] = plugin;
  for (const [name, value] of existing) plugins[name] = value;
}
