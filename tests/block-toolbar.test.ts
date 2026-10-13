import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { buildBlockToolbarPlugin, toolbarPosition, type BlockToolbarDeps } from "../src/editor/block-toolbar";
import { parseString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const core = testCore();
const views: EditorView[] = [];

function mount(html: string, overrides: Partial<BlockToolbarDeps> = {}, editable = true) {
  const host = document.createElement("prose-mirror");
  document.body.append(host);
  const place = document.createElement("div");
  host.append(place);
  const deps: BlockToolbarDeps = {
    Plugin,
    localize: (key) => `‹${key.split(".").at(-1)}›`,
    templateName: (id) => (id === "note" ? "Note" : null),
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = new EditorView(place, {
    state: EditorState.create({ doc: parseString(html), plugins: [buildBlockToolbarPlugin(deps)] }),
    editable: () => editable,
  });
  views.push(view);
  return { view, deps, host };
}

function caretAt(view: EditorView, text: string) {
  let pos = -1;
  view.state.doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text!.includes(text)) pos = p + node.text!.indexOf(text) + 1;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

afterEach(() => {
  for (const view of views.splice(0)) if (!view.isDestroyed) view.destroy();
  document.body.innerHTML = "";
});

const noteHtml = `<p>Intro</p>${core.renderer.render("note", { instanceId: "n1", values: { title: "Title", body: "Body" } })}`;

function key(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("block toolbar keyboard access (ARIA toolbar pattern)", () => {
  it("moves focus to the toolbar with Alt+F10 and back to the editor with Escape", () => {
    const { view, host } = mount(noteHtml);
    caretAt(view, "Body");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".loreframe-block-toolbar__button")];
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    const event = key(view.dom, { key: "F10", code: "F10", altKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    const focus = vi.spyOn(view, "focus");
    key(buttons[0]!, { key: "Escape", code: "Escape" });
    expect(focus).toHaveBeenCalled();
  });

  it("roves between buttons with the arrow keys, Home and End", () => {
    const { view, host } = mount(noteHtml);
    caretAt(view, "Body");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".loreframe-block-toolbar__button")];
    buttons[0]!.focus();
    key(buttons[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    key(buttons[1]!, { key: "End" });
    expect(document.activeElement).toBe(buttons[2]);
    key(buttons[2]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[0]);
    key(buttons[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons[2]);
    key(buttons[2]!, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("skips hidden buttons and ignores Alt+F10 outside blocks", () => {
    const { view, host } = mount(noteHtml, { templateName: () => null });
    caretAt(view, "Body");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".loreframe-block-toolbar__button")];
    key(view.dom, { key: "F10", altKey: true });
    expect(document.activeElement).toBe(buttons[1]);
    caretAt(view, "Intro");
    (document.activeElement as HTMLElement).blur();
    expect(key(view.dom, { key: "F10", altKey: true }).defaultPrevented).toBe(false);
  });
});

describe("block toolbar", () => {
  it("lives next to the editor, never inside the editable DOM", () => {
    const { view, host } = mount(noteHtml);
    const toolbar = host.querySelector(".loreframe-block-toolbar");
    expect(toolbar).not.toBeNull();
    expect(view.dom.contains(toolbar)).toBe(false);
    expect(toolbar?.getAttribute("role")).toBe("toolbar");
  });

  it("is hidden until the selection enters a block, and names the block", () => {
    const { view, host } = mount(noteHtml);
    const toolbar = host.querySelector<HTMLElement>(".loreframe-block-toolbar")!;
    caretAt(view, "Intro");
    expect(toolbar.hidden).toBe(true);
    caretAt(view, "Body");
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.querySelector(".loreframe-block-toolbar__label")?.textContent).toBe("Note");
    caretAt(view, "Intro");
    expect(toolbar.hidden).toBe(true);
  });

  it("offers labelled Edit, Duplicate and Delete buttons that act on the selected block", () => {
    const { view, deps, host } = mount(noteHtml);
    caretAt(view, "Body");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".loreframe-block-toolbar button")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["‹Edit›", "‹Duplicate›", "‹Delete›"]);
    buttons.forEach((button) => button.click());
    expect(deps.onEdit).toHaveBeenCalledWith(view, "n1");
    expect(deps.onDuplicate).toHaveBeenCalledWith(view, "n1");
    expect(deps.onDelete).toHaveBeenCalledWith(view, "n1");
  });

  it("keeps the editor selection when a button is pressed", () => {
    const { view, host } = mount(noteHtml);
    caretAt(view, "Body");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    host.querySelector("button")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("stays hidden in read-only editors", () => {
    const { view, host } = mount(noteHtml, {}, false);
    caretAt(view, "Body");
    expect(host.querySelector<HTMLElement>(".loreframe-block-toolbar")!.hidden).toBe(true);
  });

  it("uses the template id when the template is not registered", () => {
    const { view, host } = mount(noteHtml, { templateName: () => null });
    caretAt(view, "Body");
    expect(host.querySelector(".loreframe-block-toolbar__label")?.textContent).toBe("note");
    // Unknown (or disabled) templates cannot be edited; duplicate and delete still work on the markup.
    expect(host.querySelector<HTMLElement>(".loreframe-block-toolbar__button--edit")!.hidden).toBe(true);
    caretAt(view, "Intro");
    const known = mount(noteHtml);
    caretAt(known.view, "Body");
    expect(known.host.querySelector<HTMLElement>(".loreframe-block-toolbar__button--edit")!.hidden).toBe(
      false,
    );
  });

  it("is removed with the editor", () => {
    const { view, host } = mount(noteHtml);
    view.destroy();
    expect(host.querySelector(".loreframe-block-toolbar")).toBeNull();
  });
});

describe("toolbarPosition", () => {
  const rect = (top: number, left: number, width: number, height: number) => ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const container = rect(100, 50, 600, 500);
  const viewport = rect(140, 50, 600, 460);
  const size = { width: 180, height: 28 };

  it("sits above the block's right edge", () => {
    expect(toolbarPosition(rect(300, 80, 500, 120), container, viewport, size)).toEqual({
      top: 168,
      left: 350,
    });
  });

  it("sticks to the top of the visible area while the block top is scrolled away", () => {
    expect(toolbarPosition(rect(60, 80, 500, 400), container, viewport, size)).toEqual({
      top: 44,
      left: 350,
    });
  });

  it("stays inside the container horizontally", () => {
    expect(toolbarPosition(rect(300, 40, 100, 50), container, viewport, size)?.left).toBe(0);
  });

  it("returns null when the block is out of view", () => {
    expect(toolbarPosition(rect(700, 80, 500, 100), container, viewport, size)).toBeNull();
    expect(toolbarPosition(rect(0, 80, 500, 100), container, viewport, size)).toBeNull();
  });
});
