import type { Plugin as PMPlugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockAt } from "./block-document";

export interface BlockToolbarDeps {
  /** Foundry: `ProseMirror.state.Plugin`. */
  Plugin: typeof PMPlugin;
  localize(key: string): string;
  /** Localized template name, or null for unknown templates. */
  templateName(templateId: string): string | null;
  onEdit(view: EditorView, instanceId: string): void;
  onDuplicate(view: EditorView, instanceId: string): void;
  onDelete(view: EditorView, instanceId: string): void;
}

interface Box {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const GAP = 4;

/**
 * Where the toolbar goes, relative to its container: above the block's right edge, pinned to the top of the
 * visible editor area while the block's top is scrolled away. Null when the block is not visible.
 */
export function toolbarPosition(
  block: Box,
  container: Box,
  visible: Box,
  size: { width: number; height: number },
): { top: number; left: number } | null {
  if (block.bottom <= visible.top || block.top >= visible.bottom) return null;
  const top = Math.max(block.top - size.height - GAP, visible.top + GAP) - container.top;
  const left = Math.min(Math.max(block.right - size.width, container.left), container.right - size.width);
  return { top, left: left - container.left };
}

const ACTIONS = [
  { id: "edit", key: "LOREFRAME.Toolbar.Edit", icon: "fa-solid fa-sliders" },
  { id: "duplicate", key: "LOREFRAME.Toolbar.Duplicate", icon: "fa-solid fa-copy" },
  { id: "delete", key: "LOREFRAME.Toolbar.Delete", icon: "fa-solid fa-trash" },
] as const;

const toolbars = new WeakMap<EditorView, BlockToolbarView>();

/**
 * Compact contextual toolbar for the block holding the selection (spec §23). It is rendered next to the editor
 * (inside `<prose-mirror>`), never inside ProseMirror's own DOM, and exists only while a block is selected.
 */
class BlockToolbarView {
  readonly #view: EditorView;
  readonly #deps: BlockToolbarDeps;
  readonly #element: HTMLElement;
  readonly #label: HTMLElement;
  readonly #buttons: HTMLButtonElement[] = [];
  readonly #onScroll = () => this.#schedulePosition();
  #frame: number | null = null;
  #instanceId: string | null = null;
  /** Roving tab stop (WAI-ARIA toolbar pattern): the one button reachable with Tab. */
  #current = 0;

  constructor(view: EditorView, deps: BlockToolbarDeps) {
    this.#view = view;
    this.#deps = deps;
    const doc = view.dom.ownerDocument;

    this.#element = doc.createElement("div");
    this.#element.className = "loreframe loreframe-block-toolbar";
    this.#element.setAttribute("role", "toolbar");
    this.#element.setAttribute("aria-label", deps.localize("LOREFRAME.Toolbar.Label"));
    this.#element.hidden = true;

    this.#label = doc.createElement("span");
    this.#label.className = "loreframe-block-toolbar__label";
    this.#element.append(this.#label);

    for (const action of ACTIONS) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = `loreframe-block-toolbar__button loreframe-block-toolbar__button--${action.id}`;
      const label = deps.localize(action.key);
      button.setAttribute("aria-label", label);
      button.dataset.tooltip = label;
      const icon = doc.createElement("i");
      icon.className = `${action.icon} fa-fw`;
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      // Keep the editor's selection: the toolbar acts on the block the selection is in.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => this.#run(action.id));
      button.addEventListener("focus", () => this.#setCurrent(this.#buttons.indexOf(button)));
      this.#buttons.push(button);
      this.#element.append(button);
    }
    this.#element.addEventListener("keydown", (event) => this.#onKeyDown(event));

    // Foundry mounts the EditorView on div.editor-content inside <prose-mirror>; the toolbar joins that element.
    (view.dom.parentElement ?? doc.body).append(this.#element);
    view.dom.addEventListener("scroll", this.#onScroll, { passive: true });
    this.update();
  }

  update(): void {
    const view = this.#view;
    const block = view.editable ? blockAt(view.state.selection.$from) : null;
    this.#instanceId = block?.instanceId ?? null;
    if (!block) {
      this.#element.hidden = true;
      return;
    }
    const name = this.#deps.templateName(block.templateId);
    this.#label.textContent = name ?? block.templateId;
    // Blocks of unknown templates keep duplicate/delete, but there is nothing to edit them with.
    const edit = this.#buttons[0];
    if (edit) edit.hidden = name === null;
    this.#element.hidden = false;
    this.#setCurrent(this.#current);
    this.#schedulePosition();
  }

  /** Measuring forces layout: do it at most once per frame, not on every keystroke's transaction. */
  #schedulePosition(): void {
    if (this.#frame !== null) return;
    const win = this.#view.dom.ownerDocument.defaultView;
    if (!win?.requestAnimationFrame) {
      this.#position();
      return;
    }
    this.#frame = win.requestAnimationFrame(() => {
      this.#frame = null;
      if (!this.#view.isDestroyed) this.#position();
    });
  }

  /** Alt+F10 from the editor: move focus into the toolbar. False when there is no toolbar to focus. */
  focus(): boolean {
    const button = this.#buttons[this.#current];
    if (this.#element.hidden || !button || button.hidden) return false;
    button.focus();
    return true;
  }

  destroy(): void {
    if (this.#frame !== null) this.#view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.#frame);
    this.#view.dom.removeEventListener("scroll", this.#onScroll);
    this.#element.remove();
  }

  #visibleButtons(): HTMLButtonElement[] {
    return this.#buttons.filter((button) => !button.hidden);
  }

  /** Make `index` the tab stop, falling back to the first visible button. */
  #setCurrent(index: number): void {
    const target = this.#buttons[index];
    const visible = this.#visibleButtons();
    const chosen = target && !target.hidden ? target : visible[0];
    this.#current = chosen ? this.#buttons.indexOf(chosen) : 0;
    this.#buttons.forEach((button, i) => (button.tabIndex = i === this.#current ? 0 : -1));
  }

  #onKeyDown(event: KeyboardEvent): void {
    const visible = this.#visibleButtons();
    const at = visible.indexOf(this.#buttons[this.#current] as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowRight") next = visible[(at + 1) % visible.length];
    else if (event.key === "ArrowLeft") next = visible[(at - 1 + visible.length) % visible.length];
    else if (event.key === "Home") next = visible[0];
    else if (event.key === "End") next = visible.at(-1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.#view.focus();
      return;
    } else return;
    event.preventDefault();
    if (!next) return;
    this.#setCurrent(this.#buttons.indexOf(next));
    next.focus();
  }

  #run(action: (typeof ACTIONS)[number]["id"]): void {
    const id = this.#instanceId;
    if (!id) return;
    if (action === "edit") this.#deps.onEdit(this.#view, id);
    else if (action === "duplicate") this.#deps.onDuplicate(this.#view, id);
    else this.#deps.onDelete(this.#view, id);
  }

  #position(): void {
    const view = this.#view;
    const container = this.#element.parentElement;
    const block = blockAt(view.state.selection.$from);
    if (!container || !block || this.#element.hidden) return;
    const dom = view.nodeDOM(block.hostPos);
    if (!(dom instanceof HTMLElement)) return;
    const position = toolbarPosition(
      dom.getBoundingClientRect(),
      container.getBoundingClientRect(),
      view.dom.getBoundingClientRect(),
      { width: this.#element.offsetWidth, height: this.#element.offsetHeight },
    );
    this.#element.style.visibility = position ? "" : "hidden";
    if (position) {
      this.#element.style.top = `${position.top}px`;
      this.#element.style.left = `${position.left}px`;
    }
  }
}

export function buildBlockToolbarPlugin(deps: BlockToolbarDeps): PMPlugin {
  return new deps.Plugin({
    view: (view) => {
      const toolbar = new BlockToolbarView(view, deps);
      toolbars.set(view, toolbar);
      return toolbar;
    },
    props: {
      handleKeyDown(view, event) {
        // Alt+F10 is the common "go to toolbar" shortcut in rich-text editors.
        if (!event.altKey || event.key !== "F10") return false;
        return toolbars.get(view)?.focus() ?? false;
      },
    },
  });
}
