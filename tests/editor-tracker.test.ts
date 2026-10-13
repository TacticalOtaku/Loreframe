import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { buildEditorTrackerPlugin, EditorTracker } from "../src/editor/editor-tracker";
import { parseString } from "./helpers/schema";

const views: EditorView[] = [];

function mount(tracker: EditorTracker, editable = true): EditorView {
  const place = document.createElement("div");
  document.body.append(place);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: parseString("<p>x</p>"),
      plugins: [buildEditorTrackerPlugin({ Plugin, tracker })],
    }),
    editable: () => editable,
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) if (!view.isDestroyed) view.destroy();
  document.body.innerHTML = "";
});

describe("EditorTracker", () => {
  it("has no active editor until one is focused", () => {
    const tracker = new EditorTracker();
    mount(tracker);
    expect(tracker.active()).toBeNull();
  });

  it("returns the most recently focused editor", () => {
    const tracker = new EditorTracker();
    const a = mount(tracker);
    const b = mount(tracker);
    a.dom.dispatchEvent(new FocusEvent("focus"));
    b.dom.dispatchEvent(new FocusEvent("focus"));
    expect(tracker.active()).toBe(b);
    a.dom.dispatchEvent(new FocusEvent("focus"));
    expect(tracker.active()).toBe(a);
  });

  it("falls back to the previous editor when the latest is destroyed or detached", () => {
    const tracker = new EditorTracker();
    const a = mount(tracker);
    const b = mount(tracker);
    const c = mount(tracker);
    tracker.markActive(a);
    tracker.markActive(b);
    tracker.markActive(c);
    c.destroy();
    expect(tracker.active()).toBe(b);
    b.dom.parentElement?.remove();
    expect(tracker.active()).toBe(a);
  });

  it("skips read-only editors", () => {
    const tracker = new EditorTracker();
    const writable = mount(tracker);
    const readOnly = mount(tracker, false);
    tracker.markActive(writable);
    tracker.markActive(readOnly);
    expect(tracker.active()).toBe(writable);
  });

  it("ignores views it does not track", () => {
    const tracker = new EditorTracker();
    const foreign = new EditorView(document.createElement("div"), {
      state: EditorState.create({ doc: parseString("<p>x</p>") }),
    });
    tracker.markActive(foreign);
    expect(tracker.active()).toBeNull();
    foreign.destroy();
  });
});

describe("EditorTracker change listeners", () => {
  it("notifies when the insertion target may have changed, until unsubscribed", () => {
    const tracker = new EditorTracker();
    const listener = vi.fn();
    const stop = tracker.onChange(listener);
    const view = mount(tracker);
    tracker.markActive(view);
    tracker.markActive(view);
    expect(listener).toHaveBeenCalledTimes(1);
    view.destroy();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    tracker.markActive(mount(tracker));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
