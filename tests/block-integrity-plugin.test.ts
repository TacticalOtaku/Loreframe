import { describe, expect, it } from "vitest";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { Node as PMNode, Slice } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { buildBlockIntegrityPlugin, closeClipboardSlice } from "../src/editor/block-integrity-plugin";
import { parseString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const core = testCore();
const block = (id: string, title = "Note", body = "Body") =>
  core.renderer.render("note", { instanceId: id, values: { title, body } });

function plugin() {
  let n = 0;
  return buildBlockIntegrityPlugin({ Plugin, newInstanceId: () => `new${++n}` });
}

function setup(html: string) {
  return EditorState.create({ doc: parseString(html), plugins: [plugin()] });
}

function ids(doc: PMNode): string[] {
  const out: string[] = [];
  doc.descendants((node) => {
    const id = (node.attrs._preserve as Record<string, string> | undefined)?.["data-loreframe-instance"];
    if (id) out.push(id);
  });
  return out;
}

function topLevel(doc: PMNode): string[] {
  const out: string[] = [];
  doc.forEach((node) => out.push(`${node.type.name}:${node.textContent}`));
  return out;
}

/** Position of the top-level child at `index`. */
function childPos(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

function copyChild(state: EditorState, index: number): Slice {
  const from = childPos(state.doc, index);
  return state.doc.slice(from, from + state.doc.child(index).nodeSize);
}

function pasteAt(state: EditorState, index: number, slice: Slice, uiEvent = "paste"): EditorState {
  const pos = childPos(state.doc, index);
  return state.apply(state.tr.replaceRange(pos, pos, slice).setMeta("uiEvent", uiEvent));
}

describe("block integrity plugin: instance ids", () => {
  it("gives a pasted copy a new id and keeps the original's id", () => {
    const state = setup(`<p>a</p>${block("orig")}<p>b</p>`);
    expect(ids(pasteAt(state, 3, copyChild(state, 1)).doc)).toEqual(["orig", "new1"]);
  });

  it("keeps the original's id when the copy is pasted before it", () => {
    const state = setup(`<p>a</p>${block("orig")}`);
    expect(ids(pasteAt(state, 0, copyChild(state, 1)).doc)).toEqual(["new1", "orig"]);
  });

  it("renames dropped copies too", () => {
    const state = setup(`${block("orig")}<p>b</p>`);
    expect(ids(pasteAt(state, 2, copyChild(state, 0), "drop").doc)).toEqual(["orig", "new1"]);
  });

  it("makes blocks pasted with the same foreign id unique", () => {
    const state = setup("<p>a</p>");
    const foreign = parseString(`${block("ext")}${block("ext")}`);
    const tr = state.tr
      .replaceRange(0, 0, foreign.slice(0, foreign.content.size))
      .setMeta("uiEvent", "paste");
    expect(ids(state.apply(tr).doc)).toEqual(["ext", "new1"]);
  });

  it("does nothing for ordinary edits, even with duplicate ids present", () => {
    const state = setup(`${block("dup")}${block("dup")}<p>b</p>`);
    const pos = childPos(state.doc, 2) + 1;
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)).insertText("x"));
    expect(ids(next.doc)).toEqual(["dup", "dup"]);
  });

  it("keeps an id when a block is moved by drag and drop", () => {
    const state = setup(`${block("moved")}<p>b</p>`);
    const slice = copyChild(state, 0);
    const size = state.doc.child(0).nodeSize;
    const end = state.doc.content.size;
    const tr = state.tr.replaceRange(end, end, slice).delete(0, size).setMeta("uiEvent", "drop");
    expect(ids(state.apply(tr).doc)).toEqual(["moved"]);
  });
});

describe("closeClipboardSlice", () => {
  it("marks foreign HTML with a top-level block as a closed slice and drops formatting whitespace", () => {
    const out = closeClipboardSlice(
      `<meta charset="utf-8">\n<!--StartFragment-->${block("x")}\n  <p>tail</p>`,
    );
    const template = document.createElement("template");
    template.innerHTML = out;
    expect(template.content.querySelector("aside")?.getAttribute("data-pm-slice")).toBe("0 0 []");
    expect(out).not.toMatch(/>\s+</);
    expect(out).not.toContain("StartFragment");
  });

  it("leaves ProseMirror clipboard HTML and content without blocks untouched", () => {
    const own = `<p data-pm-slice="1 1 []">x</p>${block("x")}`;
    expect(closeClipboardSlice(own)).toBe(own);
    const plain = "<p>one</p>\n<p>two</p>";
    expect(closeClipboardSlice(plain)).toBe(plain);
  });
});

describe("block integrity plugin: pasting into a real editor", () => {
  function mount(html: string): EditorView {
    const place = document.createElement("div");
    document.body.append(place);
    return new EditorView(place, { state: setup(html) });
  }

  function paste(view: EditorView, html: string): void {
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "fallback");
    view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }

  it("keeps a block copied outside the editor whole when pasted mid-paragraph, with a new id", () => {
    const view = mount(`<p>Intro</p>${block("orig")}`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
    paste(view, `<meta charset="utf-8">\n${block("orig", "Copied", "Text")}\n`);
    expect(topLevel(view.state.doc)).toEqual(["paragraph:Intro", "aside:CopiedText", "aside:NoteBody"]);
    expect(ids(view.state.doc)).toEqual(["new1", "orig"]);
    view.destroy();
  });

  it("still merges ordinary pasted text into the paragraph", () => {
    const view = mount("<p>Intro</p>");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
    paste(view, "<p>More</p>");
    expect(topLevel(view.state.doc)).toEqual(["paragraph:IntroMore"]);
    view.destroy();
  });
});

describe("block integrity plugin: Foundry secret ids", () => {
  function secretIds(doc: PMNode): string[] {
    const out: string[] = [];
    doc.descendants((node) => {
      if (node.type.name === "secret") out.push(node.attrs.id as string);
    });
    return out;
  }

  it("gives pasted copies of a secret a new id and keeps the original", () => {
    const state = setup(
      `<p>a</p><section class="secret" id="secret-orig">${block("inside")}</section><p>b</p>`,
    );
    const next = pasteAt(state, 3, copyChild(state, 1));
    const secrets = secretIds(next.doc);
    expect(secrets[0]).toBe("secret-orig");
    expect(secrets[1]).toMatch(/^secret-new\d+$/);
    expect(ids(next.doc)).toEqual(["inside", expect.stringMatching(/^new\d+$/)]);
  });
});

describe("closeClipboardSlice with GM-only blocks", () => {
  it("closes the slice for a secret-wrapped block copied outside the editor", () => {
    const out = closeClipboardSlice(`<section class="secret" id="secret-a">\n${block("x")}\n</section>`);
    expect(out).toContain('data-pm-slice="0 0 []"');
    expect(out).not.toMatch(/>\s+</);
  });
});
