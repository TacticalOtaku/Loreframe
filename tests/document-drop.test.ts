import { describe, expect, it, vi } from "vitest";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { buildDocumentDropPlugin, prependPlugin, type DocumentDrop } from "../src/editor/document-drop";
import { parseString } from "./helpers/schema";

type DropHandler = (view: EditorView, event: DragEvent, slice: unknown, moved: boolean) => boolean;

function setup(
  claims: (type: string) => boolean = (type) => type === "Actor",
  data: object = { type: "Actor", uuid: "Actor.a1" },
  selection?: [number, number],
  onDrop: (view: EditorView, drop: DocumentDrop) => Promise<void> | void = vi.fn(),
) {
  const plugin = buildDocumentDropPlugin({ Plugin, getDragData: () => data, claims, onDrop });
  const handleDrop = plugin.props.handleDrop as unknown as DropHandler;
  let state = EditorState.create({ doc: parseString("<p>Hello world</p><p>Second</p>"), plugins: [plugin] });
  if (selection) state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, ...selection)));
  const view = {
    get state() {
      return state;
    },
    dispatch: (tr: ReturnType<EditorState["tr"]["insertText"]>) => {
      state = state.apply(tr);
    },
    posAtCoords: vi.fn(() => ({ pos: 14, inside: -1 })),
  } as unknown as EditorView;
  const event = {
    clientX: 10,
    clientY: 20,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent;
  return { onDrop, handleDrop, view, event };
}

describe("document drop plugin", () => {
  it("claims drops of handled document types at the drop position", () => {
    const { onDrop, handleDrop, view, event } = setup();
    expect(handleDrop(view, event, null, false)).toBe(true);
    const drop = (onDrop as ReturnType<typeof vi.fn>).mock.calls[0]![1] as DocumentDrop;
    expect(drop).toMatchObject({ type: "Actor", uuid: "Actor.a1", label: "", selection: null });
    expect(drop.at).toMatchObject({ from: 14, to: 14, deleted: false });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("tracks both point drops and selections across edits and auto-releases when onDrop settles", async () => {
    let finishDrop!: () => void;
    let captured!: DocumentDrop;
    const onDrop = vi.fn((_view: EditorView, drop: DocumentDrop) => {
      captured = drop;
      return new Promise<void>((resolve) => {
        finishDrop = resolve;
      });
    });
    const { handleDrop, view, event } = setup(undefined, undefined, [1, 6], onDrop);
    handleDrop(view, event, null, false);
    expect(captured.label).toBe("Hello");

    view.dispatch(view.state.tr.insertText("Oh, ", 1));
    expect(captured.at.from).toBe(18);
    expect(captured.selection).toMatchObject({ from: 5, to: 10, deleted: false });

    finishDrop();
    await Promise.resolve();
    view.dispatch(view.state.tr.insertText("x", 1));
    // Auto-released once onDrop settled: no longer updated.
    expect(captured.at.from).toBe(18);
    expect(captured.selection!.from).toBe(5);
  });

  it("marks point drops as deleted when surrounding content is removed", () => {
    const onDrop = vi.fn();
    const { handleDrop, view, event } = setup(undefined, undefined, [1, 6], onDrop);
    handleDrop(view, event, null, false);
    const drop = onDrop.mock.calls[0]![1] as DocumentDrop;

    // Delete the entire second paragraph spanning pos 14 (drop.at) while selection in first paragraph survives.
    view.dispatch(view.state.tr.delete(13, view.state.doc.content.size));
    expect(drop.at.deleted).toBe(true);
    expect(drop.selection!.deleted).toBe(false);
  });

  it("leaves other drops to Foundry", () => {
    for (const [claims, data, moved] of [
      [() => false, { type: "Actor", uuid: "Actor.a1" }, false],
      [() => true, { type: "Actor" }, false],
      [() => true, { type: "Actor", uuid: 5 }, false],
      [() => true, {}, false],
      [() => true, { type: "Actor", uuid: "Actor.a1" }, true],
    ] as const) {
      const { onDrop, handleDrop, view, event } = setup(claims, data);
      expect(handleDrop(view, event, null, moved)).toBe(false);
      expect(onDrop).not.toHaveBeenCalled();
    }
  });

  it("does not claim drops outside the document", () => {
    const { onDrop, handleDrop, view, event } = setup();
    (view.posAtCoords as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(handleDrop(view, event, null, false)).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe("prependPlugin", () => {
  it("puts the plugin first so it runs before Foundry's content-link drop handler", () => {
    const plugins: Record<string, unknown> = { menu: 1, contentLinks: 2 };
    prependPlugin(plugins, "loreframeDrop", 3);
    expect(Object.keys(plugins)).toEqual(["loreframeDrop", "menu", "contentLinks"]);
    expect(Object.values(plugins)).toEqual([3, 1, 2]);
  });
});
