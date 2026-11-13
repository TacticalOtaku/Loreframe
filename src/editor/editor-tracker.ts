import type { Plugin as PMPlugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Remembers which ProseMirror editors are open and which one the user worked in last, so windows such as
 * the Template Library know where to insert. Fed by a per-editor plugin — no DOM polling or global observers.
 */
export class EditorTracker {
  readonly #open = new Set<EditorView>();
  /** Open views that have had focus, least recently focused first. Never-focused editors are no target. */
  #focused: EditorView[] = [];
  readonly #listeners = new Set<() => void>();

  /** Called whenever the active editor may have changed (focus moved, an editor closed). */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  track(view: EditorView): void {
    this.#open.add(view);
  }

  untrack(view: EditorView): void {
    this.#open.delete(view);
    const wasFocused = this.#focused.includes(view);
    this.#focused = this.#focused.filter((v) => v !== view);
    if (wasFocused) this.#notify();
  }

  markActive(view: EditorView): void {
    if (!this.#open.has(view) || this.#focused.at(-1) === view) return;
    this.#focused = [...this.#focused.filter((v) => v !== view), view];
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  /** The most recently focused editor that is still open, attached and editable. */
  active(): EditorView | null {
    for (let i = this.#focused.length - 1; i >= 0; i--) {
      const view = this.#focused[i];
      if (view && isUsable(view)) return view;
    }
    return null;
  }

  /** Return `preferred` while it is still open, attached and editable; otherwise fall back to `active()`. */
  resolve(preferred?: EditorView | null): EditorView | null {
    return preferred && isUsable(preferred) ? preferred : this.active();
  }
}

function isUsable(view: EditorView): boolean {
  return !view.isDestroyed && view.dom.isConnected && view.editable;
}

export interface EditorTrackerPluginDeps {
  /** Foundry: `ProseMirror.state.Plugin`. */
  Plugin: typeof PMPlugin;
  tracker: EditorTracker;
}

export function buildEditorTrackerPlugin({ Plugin, tracker }: EditorTrackerPluginDeps): PMPlugin {
  return new Plugin({
    view(view) {
      tracker.track(view);
      return { destroy: () => tracker.untrack(view) };
    },
    props: {
      handleDOMEvents: {
        focus(view) {
          tracker.markActive(view);
          return false;
        },
      },
    },
  });
}
