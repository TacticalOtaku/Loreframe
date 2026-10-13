import { describe, expect, it, vi } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  insertTemplateIntoView,
  type InsertTemplateDeps,
  type InsertTarget,
} from "../src/editor/insert-template";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

function target(editable = true) {
  const doc = parseString("<p>Hello</p>");
  const view = {
    editable,
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 6) }),
    dispatch: vi.fn((tr: pmState.Transaction) => {
      view.state = view.state.apply(tr);
    }),
    focus: vi.fn(),
  } satisfies InsertTarget;
  return view;
}

function deps(overrides: Partial<InsertTemplateDeps> = {}): InsertTemplateDeps {
  const core = testCore();
  return {
    templates: core.templates,
    renderNew: (id) => core.renderNew(id, { values: { title: "Title", subtitle: "Sub" } }),
    parseHtml: parseString,
    stateModule: pmState,
    recordUse: vi.fn(async () => undefined),
    notifyError: vi.fn(),
    ...overrides,
  };
}

describe("insertTemplateIntoView", () => {
  it("inserts, focuses the editor, selects the focus field and records the use", () => {
    const view = target();
    const d = deps();
    expect(insertTemplateIntoView(view, "heading", d)).toBe(true);
    expect(serializeString(view.state.doc)).toContain('data-loreframe-template="heading"');
    expect(view.state.selection.$from.parent.textContent).toBe("Title");
    expect(view.focus).toHaveBeenCalled();
    expect(d.recordUse).toHaveBeenCalledWith("heading");
  });

  it("refuses read-only editors without recording use", () => {
    const view = target(false);
    const d = deps();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(insertTemplateIntoView(view, "note", d)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(d.recordUse).not.toHaveBeenCalled();
    expect(d.notifyError).toHaveBeenCalledWith("LOREFRAME.Error.NoEditor");
  });

  it("notifies and logs when rendering fails", () => {
    const view = target();
    const d = deps({
      renderNew: () => {
        throw new Error("boom");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(insertTemplateIntoView(view, "note", d)).toBe(false);
    expect(d.notifyError).toHaveBeenCalledWith("LOREFRAME.Error.InsertFailed");
    expect(d.recordUse).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("logs a failure to store recent use without failing the insert", async () => {
    const view = target();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = deps({ recordUse: () => Promise.reject(new Error("storage")) });
    expect(insertTemplateIntoView(view, "note", d)).toBe(true);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
});

describe("insertTemplateIntoView at a position", () => {
  it("inserts at the given document position with explicit values and preset", () => {
    const core = testCore();
    const doc = parseString("<p>First</p><p>Second</p>");
    const view = {
      editable: true,
      state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
      dispatch: vi.fn((tr: pmState.Transaction) => {
        view.state = view.state.apply(tr);
      }),
      focus: vi.fn(),
    } satisfies InsertTarget;
    const renderNew = vi.fn((id: string, options?: object) => core.renderNew(id, options));
    const ok = insertTemplateIntoView(view, "npc-card", deps({ renderNew }), {
      at: 14,
      values: { name: "Mira" },
      preset: "arcane",
    });
    expect(ok).toBe(true);
    expect(renderNew).toHaveBeenCalledWith("npc-card", { values: { name: "Mira" }, preset: "arcane" });
    const html = serializeString(view.state.doc);
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("npc-card"));
    expect(html).toContain('data-loreframe-preset="arcane"');
    expect(html).toContain(">Mira</h3>");
  });

  it("clamps positions outside the document", () => {
    const view = target();
    expect(insertTemplateIntoView(view, "divider", deps(), { at: 999 })).toBe(true);
    expect(serializeString(view.state.doc)).toMatch(/^<p>Hello<\/p><div/);
  });
});
