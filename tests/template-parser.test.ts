import { describe, expect, it } from "vitest";
import { parseBlocks } from "../src/core/template-parser";
import { testCore } from "./helpers/core";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("parseBlocks", () => {
  const core = testCore();

  it("identifies rendered blocks in document order", () => {
    const html = `<p>x</p>${core.renderer.render("heading", { instanceId: "h1" })}<p>y</p>${core.renderer.render("note", { instanceId: "n1" })}`;
    const blocks = parseBlocks(root(html), core.templates);
    expect(blocks.map((b) => [b.templateId, b.instanceId, b.version, b.status])).toEqual([
      ["heading", "h1", 1, "current"],
      ["note", "n1", 1, "current"],
    ]);
    expect([...blocks[1]!.fields.keys()]).toEqual(["title", "body"]);
    expect(blocks[0]!.preset).toBeNull();
  });

  it("classifies version and registration status", () => {
    const html = [
      '<div data-loreframe-template="note" data-loreframe-version="0" data-loreframe-instance="a"></div>',
      '<div data-loreframe-template="note" data-loreframe-version="7" data-loreframe-instance="b"></div>',
      '<div data-loreframe-template="note" data-loreframe-version="1" data-loreframe-instance="f"></div>',
      '<div data-loreframe-template="callout" data-loreframe-version="1" data-loreframe-instance="c"></div>',
      '<div data-loreframe-template="note" data-loreframe-version="x" data-loreframe-instance="d"></div>',
      '<div data-loreframe-template="note" data-loreframe-instance="e"></div>',
    ].join("");
    const registry = { get: (id: string) => (id === "note" ? { version: 2 } : undefined) };
    expect(parseBlocks(root(html), registry).map((b) => [b.instanceId, b.version, b.status])).toEqual([
      ["a", null, "invalid"],
      ["b", 7, "newer"],
      ["f", 1, "outdated"],
      ["c", 1, "unknown"],
      ["d", null, "invalid"],
      ["e", null, "invalid"],
    ]);
  });

  it("assigns fields to their nearest block only", () => {
    const inner = core.renderer.render("note", { instanceId: "inner" });
    const html = `<section data-loreframe-template="note" data-loreframe-version="1" data-loreframe-instance="outer"><h4 data-loreframe-field="title">T</h4><div data-loreframe-field="body">${inner}</div></section>`;
    const [outer, nested] = parseBlocks(root(html), core.templates);
    expect([...outer!.fields.keys()]).toEqual(["title", "body"]);
    expect(outer!.fields.get("title")?.textContent).toBe("T");
    expect(nested!.instanceId).toBe("inner");
    expect(nested!.fields.get("title")?.textContent).toBe("Note");
  });

  it("ignores look-alikes that only share Loreframe classes", () => {
    const html = '<aside class="loreframe-block loreframe-note"><p>fake</p></aside>';
    expect(parseBlocks(root(html), core.templates)).toEqual([]);
  });

  it("includes the root element itself when it is a block", () => {
    const el = root(core.renderer.render("divider", { instanceId: "d1" })).firstElementChild!;
    expect(parseBlocks(el, core.templates).map((b) => b.instanceId)).toEqual(["d1"]);
  });
});
