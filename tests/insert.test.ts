import { describe, expect, it, vi } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { TemplateCatalog, type UserTemplate } from "../src/core/template-catalog";
import {
  createTemplateInserter,
  insertBlockTransaction,
  type InsertTarget,
  type TemplateInserterDeps,
} from "../src/editor/insert";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const core = testCore();
const renderNote = (instanceId: string, title: string, body: string) =>
  core.renderer.render("note", { instanceId, values: { title, body } });
const blockHtml = renderNote("inst1", "Note", "Body");

function blockNode(): PMNode {
  const node = parseString(blockHtml).firstChild;
  if (!node) throw new Error("callout did not parse");
  return node;
}

/** Document position right after the first occurrence of `text`. */
function positionAfter(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const index = (node.text ?? "").indexOf(text);
    if (index >= 0) found = pos + index + text.length;
  });
  if (found < 0) throw new Error(`text "${text}" not found`);
  return found;
}

/** State with a collapsed cursor after `cursorAfter`, or a selection covering `select`. */
function stateFrom(html: string, target: { cursorAfter: string } | { select: string }): EditorState {
  const doc = parseString(html);
  const selection =
    "select" in target
      ? TextSelection.create(
          doc,
          positionAfter(doc, target.select) - target.select.length,
          positionAfter(doc, target.select),
        )
      : TextSelection.create(doc, positionAfter(doc, target.cursorAfter));
  return EditorState.create({ doc, selection });
}

function stateWithEmptyParagraphCursor(html: string, paragraphIndex: number): EditorState {
  const doc = parseString(html);
  let pos = 0;
  let index = 0;
  doc.forEach((node, offset) => {
    if (node.type.name === "paragraph" && index++ === paragraphIndex) pos = offset + 1;
  });
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

function topLevel(state: EditorState): string[] {
  const names: string[] = [];
  state.doc.forEach((node) => names.push(node.type.name + (node.textContent ? `:${node.textContent}` : "")));
  return names;
}

function insert(state: EditorState): EditorState {
  return state.apply(insertBlockTransaction(state, blockNode(), pmState));
}

describe("insertBlockTransaction", () => {
  it("replaces an empty paragraph under the cursor", () => {
    const next = insert(stateWithEmptyParagraphCursor("<p>Before</p><p></p><p>After</p>", 1));
    expect(topLevel(next)).toEqual(["paragraph:Before", "aside:NoteBody", "paragraph:After"]);
  });

  it("inserts after the paragraph containing the cursor", () => {
    const next = insert(stateFrom("<p>Before</p><p>After</p>", { cursorAfter: "Bef" }));
    expect(topLevel(next)).toEqual(["paragraph:Before", "aside:NoteBody", "paragraph:After"]);
  });

  it("adds a trailing paragraph when the block would end the document", () => {
    const next = insert(stateFrom("<p>Only</p>", { cursorAfter: "Only" }));
    expect(topLevel(next)).toEqual(["paragraph:Only", "aside:NoteBody", "paragraph"]);
  });

  it("selects the placeholder text in the block body so typing replaces it", () => {
    const next = insert(stateFrom("<p>Text</p><p>After</p>", { cursorAfter: "Text" }));
    const { $from, $to } = next.selection;
    expect($from.parent.type.name).toBe("paragraph");
    expect($from.parent).toBe($to.parent);
    expect($from.parentOffset).toBe(0);
    expect($to.parentOffset).toBe("Body".length);
    expect($from.node($from.depth - 1).attrs._preserve["data-loreframe-field"]).toBe("body");

    const typed = next.apply(next.tr.insertText("Hello"));
    expect(topLevel(typed)).toEqual(["paragraph:Text", "aside:NoteHello", "paragraph:After"]);
  });

  it("selects the requested focus field instead of the last textblock", () => {
    const heading = parseString(
      core.renderer.render("heading", { instanceId: "h", values: { title: "Title", subtitle: "Sub" } }),
    ).firstChild!;
    const state = stateFrom("<p>Text</p>", { cursorAfter: "Text" });
    const next = state.apply(insertBlockTransaction(state, heading, pmState, { focusField: "title" }));
    const { $from, $to } = next.selection;
    expect($from.parent.textContent).toBe("Title");
    expect($from.parentOffset).toBe(0);
    expect($to.parentOffset).toBe("Title".length);
  });

  it("falls back to the last textblock when the focus field is missing", () => {
    const state = stateFrom("<p>Text</p>", { cursorAfter: "Text" });
    const next = state.apply(insertBlockTransaction(state, blockNode(), pmState, { focusField: "nope" }));
    expect(next.selection.$from.parent.textContent).toBe("Body");
  });

  it("places a collapsed cursor when the last textblock is empty", () => {
    const empty = parseString(
      '<aside class="loreframe-block"><h4>Title</h4><div data-loreframe-field="body"><p></p></div></aside>',
    ).firstChild;
    if (!empty) throw new Error("block did not parse");
    const state = stateFrom("<p>Text</p>", { cursorAfter: "Text" });
    const next = state.apply(insertBlockTransaction(state, empty, pmState));
    expect(next.selection.empty).toBe(true);
    expect(next.selection.$from.parent.content.size).toBe(0);
  });

  it("replaces a non-empty selection", () => {
    const next = insert(stateFrom("<p>Keep</p><p>Replace me</p><p>After</p>", { select: "Replace me" }));
    const names = topLevel(next);
    expect(names).not.toContain("paragraph:Replace me");
    expect(names).toContain("aside:NoteBody");
    expect(names[0]).toBe("paragraph:Keep");
    expect(names.at(-1)).toBe("paragraph:After");
  });

  it("inserts after a Loreframe block when the cursor is in the block's own heading", () => {
    const host = renderNote("host", "Host title", "Host body");
    const next = insert(stateFrom(`<p>Before</p>${host}<p>After</p>`, { cursorAfter: "Host ti" }));
    expect(topLevel(next)).toEqual([
      "paragraph:Before",
      "aside:Host titleHost body",
      "aside:NoteBody",
      "paragraph:After",
    ]);
  });

  it("inserts after the block from a content field, keeping selected text", () => {
    const host = renderNote("host", "Host title", "Host body");
    const cursor = insert(stateFrom(`${host}<p>After</p>`, { cursorAfter: "Host bo" }));
    expect(topLevel(cursor)).toEqual(["aside:Host titleHost body", "aside:NoteBody", "paragraph:After"]);
    const selected = insert(stateFrom(`${host}<p>After</p>`, { select: "Host body" }));
    expect(topLevel(selected)).toEqual(["aside:Host titleHost body", "aside:NoteBody", "paragraph:After"]);
  });

  it("does not nest consecutive inserts into the previous block's selected placeholder", () => {
    const first = insert(stateFrom("<p>Text</p>", { cursorAfter: "Text" }));
    expect(first.selection.empty).toBe(false);
    const second = first.apply(insertBlockTransaction(first, blockNode(), pmState));
    expect(topLevel(second)).toEqual(["paragraph:Text", "aside:NoteBody", "aside:NoteBody", "paragraph"]);
  });

  it("nests blocks inside a slot region of another block", () => {
    const layout =
      '<section data-loreframe-template="columns" data-loreframe-version="1" data-loreframe-instance="lay">' +
      '<div data-loreframe-slot="left"><p>Left</p></div><div data-loreframe-slot="right"><p>Right</p></div>' +
      "</section>";
    const next = insert(stateFrom(`${layout}<p>After</p>`, { cursorAfter: "Left" }));
    expect(topLevel(next)).toEqual(["section:LeftNoteBodyRight", "paragraph:After"]);
    const slot = next.doc.firstChild!.firstChild!;
    expect(slot.childCount).toBe(3);
    expect(slot.child(1).attrs._preserve["data-loreframe-template"]).toBe("note");
  });

  it("inserts inside a list item without producing an invalid document", () => {
    const next = insert(stateFrom("<ul><li><p>Item</p></li></ul><p>After</p>", { cursorAfter: "It" }));
    expect(() => next.doc.check()).not.toThrow();
    expect(serializeString(next.doc)).toContain('data-loreframe-instance="inst1"');
    expect(next.doc.textContent).toBe("ItemNoteBodyAfter");
  });

  it("round-trips all Loreframe attributes through serialize → parse", () => {
    const next = insert(stateFrom("<p>Text</p>", { cursorAfter: "Text" }));
    const html = serializeString(next.doc);
    const reparsed = serializeString(parseString(html));
    expect(reparsed).toBe(html);
    for (const attr of [
      'data-loreframe-template="note"',
      'data-loreframe-version="1"',
      'data-loreframe-instance="inst1"',
      'data-loreframe-field="title"',
      'data-loreframe-field="body"',
      'class="loreframe-block loreframe-note loreframe-callout loreframe-callout--note"',
    ]) {
      expect(reparsed).toContain(attr);
    }
  });
});

describe("insertBlockTransaction with GM-only blocks", () => {
  const secretHtml = (id: string) =>
    `<section class="secret" id="secret-${id}">${renderNote(id, "GM", "Hidden body")}</section>`;

  it("treats the secret wrapper as part of the block", () => {
    const next = insert(stateFrom(`${secretHtml("s1")}<p>After</p>`, { cursorAfter: "Hidden bo" }));
    expect(topLevel(next)).toEqual(["secret:GMHidden body", "aside:NoteBody", "paragraph:After"]);
  });

  it("still nests inside a plain Foundry secret that holds ordinary content", () => {
    const next = insert(
      stateFrom('<section class="secret" id="secret-x"><p>Plot</p></section><p>After</p>', {
        cursorAfter: "Plot",
      }),
    );
    expect(topLevel(next)).toEqual(["secret:PlotNoteBody", "paragraph:After"]);
  });

  it("focuses inside an inserted secret-wrapped block", () => {
    const wrapped = parseString(secretHtml("s2")).firstChild!;
    const state = stateFrom("<p>Text</p>", { cursorAfter: "Text" });
    const next = state.apply(insertBlockTransaction(state, wrapped, pmState, { focusField: "body" }));
    expect(next.selection.$from.parent.textContent).toBe("Hidden body");
    expect(topLevel(next)).toEqual(["paragraph:Text", "secret:GMHidden body", "paragraph"]);
  });
});

describe("createTemplateInserter", () => {
  const userMerchant: UserTemplate = {
    schemaVersion: 1,
    id: "user-merchant",
    name: "Merchant",
    description: "Shop",
    base: "npc-card",
    preset: "arcane",
    values: { "show-notes": true, portrait: "right" },
  };

  function makeView(html = "<p>Hello</p>", editable = true, destroyed = false) {
    const doc = parseString(html);
    const view = {
      editable,
      isDestroyed: destroyed,
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, html === "<p>Hello</p>" ? 6 : 1),
      }),
      dispatch: vi.fn((tr: pmState.Transaction) => {
        view.state = view.state.apply(tr);
      }),
      focus: vi.fn(),
    } satisfies InsertTarget;
    return view;
  }

  function makeSetup(
    overrides: Partial<TemplateInserterDeps> & {
      userTemplates?: UserTemplate[];
      recordUse?: TemplateCatalog["recordUse"];
    } = {},
  ) {
    const instanceCore = testCore();
    const prefState: Record<string, string[]> = { favorites: [], recent: [] };
    const catalog = new TemplateCatalog({
      templates: instanceCore.templates,
      presets: instanceCore.presets,
      renderer: instanceCore.renderer,
      systemId: () => "dnd5e",
      localize: (key) => key.split(".").at(-2) ?? key,
      newId: () => "n1",
      storage: {
        readUserTemplates: () => overrides.userTemplates ?? [userMerchant],
        writeUserTemplates: async () => undefined,
        readPreference: (k) => prefState[k] ?? [],
        writePreference: async (k, v) => {
          prefState[k] = v;
        },
      },
    });
    if (overrides.recordUse) {
      vi.spyOn(catalog, "recordUse").mockImplementation(overrides.recordUse);
    } else {
      vi.spyOn(catalog, "recordUse");
    }
    const renderNew = vi.fn(
      overrides.renderNew ??
        ((id, opts) =>
          instanceCore.renderNew(id, {
            ...opts,
            values: { title: "Title", subtitle: "Sub", ...opts?.values },
          })),
    );
    const notifyError = vi.fn();
    const inserter = createTemplateInserter({
      catalog,
      renderNew,
      parseHtml: parseString,
      pm: pmState,
      notifyError,
      ...overrides,
    });
    return { inserter, catalog, renderNew, notifyError, prefState };
  }

  it("inserts, focuses the editor, selects the focus field and records recent use in one dispatch", () => {
    const view = makeView();
    const { inserter, catalog } = makeSetup();
    expect(inserter.insert(view, "heading")).toBe(true);
    expect(view.dispatch).toHaveBeenCalledTimes(1);
    expect(serializeString(view.state.doc)).toContain('data-loreframe-template="heading"');
    expect(view.state.selection.$from.parent.textContent).toBe("Title");
    expect(view.focus).toHaveBeenCalled();
    expect(catalog.recordUse).toHaveBeenCalledWith("heading");
  });

  it("expands user templates to their base definition and records recent use under the user template id", () => {
    const view = makeView();
    const { inserter, catalog } = makeSetup();
    expect(inserter.insert(view, "user-merchant")).toBe(true);
    const html = serializeString(view.state.doc);
    expect(html).toContain('data-loreframe-template="npc-card"');
    expect(html).toContain('data-loreframe-preset="arcane"');
    expect(html).toContain('data-loreframe-opt-portrait="right"');
    expect(catalog.recordUse).toHaveBeenCalledWith("user-merchant");
  });

  it("refuses read-only or destroyed editors without recording use", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const view of [makeView("<p>Hello</p>", false, false), makeView("<p>Hello</p>", true, true)]) {
      const { inserter, catalog, notifyError } = makeSetup();
      expect(inserter.insert(view, "note")).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
      expect(catalog.recordUse).not.toHaveBeenCalled();
      expect(notifyError).toHaveBeenCalledWith("LOREFRAME.Error.NoEditor");
    }
  });

  it("strictly validates explicit presets and unknown templates, notifying InsertFailed", () => {
    const view = makeView();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { inserter, catalog, notifyError } = makeSetup();

    expect(inserter.insert(view, "heading", { preset: "arcane" })).toBe(false);
    expect(notifyError).toHaveBeenLastCalledWith("LOREFRAME.Error.InsertFailed");
    expect(catalog.recordUse).not.toHaveBeenCalled();

    expect(inserter.insert(view, "non-existent")).toBe(false);
    expect(notifyError).toHaveBeenLastCalledWith("LOREFRAME.Error.InsertFailed");
    expect(catalog.recordUse).not.toHaveBeenCalled();
  });

  it("logs a failure to store recent use without failing the insert", async () => {
    const view = makeView();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { inserter } = makeSetup({ recordUse: () => Promise.reject(new Error("storage")) });
    expect(inserter.insert(view, "note")).toBe(true);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });

  it("inserts at the given position with values and preset in a single dispatch and clamps out-of-bounds", () => {
    const view = makeView("<p>First</p><p>Second</p>");
    const { inserter, renderNew } = makeSetup();
    const ok = inserter.insert(view, "npc-card", {
      at: 14,
      values: { name: "Mira" },
      preset: "arcane",
    });
    expect(ok).toBe(true);
    expect(view.dispatch).toHaveBeenCalledTimes(1);
    expect(renderNew).toHaveBeenCalledWith("npc-card", { values: { name: "Mira" }, preset: "arcane" });
    const html = serializeString(view.state.doc);
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("npc-card"));
    expect(html).toContain('data-loreframe-preset="arcane"');
    expect(html).toContain(">Mira</h3>");

    const clampView = makeView("<p>Hello</p>");
    const clampSetup = makeSetup();
    expect(clampSetup.inserter.insert(clampView, "divider", { at: 999 })).toBe(true);
    expect(clampView.dispatch).toHaveBeenCalledTimes(1);
    expect(serializeString(clampView.state.doc)).toMatch(/^<p>Hello<\/p><div/);
  });
});
