import { describe, expect, it } from "vitest";
import { LoreframeMarkupError, serializeTree } from "../src/core/element-tree";

describe("serializeTree", () => {
  it("serializes nested elements with classes, fields and attributes", () => {
    const html = serializeTree({
      tag: "aside",
      classes: ["loreframe-block", "loreframe-note"],
      attrs: { "data-loreframe-template": "note" },
      children: [
        { tag: "h4", field: "title", attrs: { "data-no-toc": "" }, children: ["Title"] },
        { tag: "div", field: "body", children: [{ tag: "p", children: ["Body"] }] },
      ],
    });
    expect(html).toBe(
      '<aside class="loreframe-block loreframe-note" data-loreframe-template="note">' +
        '<h4 data-loreframe-field="title" data-no-toc="">Title</h4>' +
        '<div data-loreframe-field="body"><p>Body</p></div>' +
        "</aside>",
    );
  });

  it("marks slot regions", () => {
    expect(serializeTree({ tag: "div", slot: "left", children: [{ tag: "p", children: ["x"] }] })).toBe(
      '<div data-loreframe-slot="left"><p>x</p></div>',
    );
  });

  it("escapes text and attribute values", () => {
    const html = serializeTree({
      tag: "p",
      attrs: { "data-loreframe-x": '"><script>' },
      children: ["<b>&</b>"],
    });
    expect(html).toBe('<p data-loreframe-x="&quot;&gt;&lt;script&gt;">&lt;b&gt;&amp;&lt;/b&gt;</p>');
  });

  it("renders void elements without children", () => {
    expect(serializeTree({ tag: "hr", classes: ["loreframe-divider__rule"] })).toBe(
      '<hr class="loreframe-divider__rule">',
    );
    expect(serializeTree({ tag: "img", attrs: { src: "worlds/a b.webp", alt: "Map" } })).toBe(
      '<img src="worlds/a b.webp" alt="Map">',
    );
  });

  it.each([
    [{ tag: "script", children: ["x"] }, /tag/],
    [{ tag: "p", attrs: { onclick: "x" } }, /attribute/],
    [{ tag: "p", attrs: { style: "color:red" } }, /attribute/],
    [{ tag: "p", attrs: { href: "https://x" } }, /attribute/],
    [{ tag: "img", attrs: { src: "javascript:alert(1)" } }, /URL/],
    [{ tag: "img", attrs: { src: " JavaScript:alert(1)" } }, /URL/],
    [{ tag: "img", attrs: { src: "data:image/svg+xml,<svg/>" } }, /URL/],
    [{ tag: "img", attrs: { src: "//evil.example/x.png" } }, /URL/],
    [{ tag: "p", classes: ["red-box"] }, /class/],
    [{ tag: "p", classes: ['loreframe" onclick="x'] }, /class/],
    [{ tag: "div", children: ["bare text"] }, /text/],
    [{ tag: "hr", children: [{ tag: "p" }] }, /void/i],
    [{ tag: "p", field: "Bad Field" }, /field/],
    [{ tag: "div", slot: "Bad Slot" }, /slot/],
    [{ tag: "p", slot: "left" }, /container/],
  ])("rejects unsafe or invalid markup %#", (tree, message) => {
    expect(() => serializeTree(tree)).toThrow(LoreframeMarkupError);
    expect(() => serializeTree(tree)).toThrow(message);
  });

  it("allows https and relative image sources", () => {
    expect(() => serializeTree({ tag: "img", attrs: { src: "https://cdn.example/x.png" } })).not.toThrow();
    expect(() =>
      serializeTree({ tag: "img", attrs: { src: "modules/loreframe/assets/x.svg" } }),
    ).not.toThrow();
  });
});

describe("serializeTree tables", () => {
  const cell = (tag: "th" | "td", text: string) => ({ tag, children: [{ tag: "p", children: [text] }] });

  it("serializes table sections with paragraph cells", () => {
    const html = serializeTree({
      tag: "table",
      classes: ["loreframe-stats__table"],
      field: "stats",
      children: [
        { tag: "thead", children: [{ tag: "tr", children: [cell("th", "HP")] }] },
        { tag: "tbody", children: [{ tag: "tr", children: [cell("td", "12")] }] },
      ],
    });
    expect(html).toBe(
      '<table class="loreframe-stats__table" data-loreframe-field="stats"><thead><tr><th><p>HP</p></th></tr></thead>' +
        "<tbody><tr><td><p>12</p></td></tr></tbody></table>",
    );
  });

  it.each(["table", "thead", "tbody", "tr", "th", "td"])("rejects bare text inside <%s>", (tag) => {
    expect(() => serializeTree({ tag, children: ["x"] })).toThrow(/text/);
  });
});

describe("serializeTree secrets", () => {
  it("emits a bare Foundry secret section around block children", () => {
    const html = serializeTree({
      tag: "div",
      classes: ["loreframe-npc__secrets"],
      field: "secrets",
      children: [{ tag: "section", secret: true, children: [{ tag: "p", children: ["Hidden"] }] }],
    });
    expect(html).toBe(
      '<div class="loreframe-npc__secrets" data-loreframe-field="secrets"><section class="secret"><p>Hidden</p></section></div>',
    );
  });

  it("keeps the secret tag bare: Foundry's reveal toggle rewrites it with a regex", () => {
    expect(() => serializeTree({ tag: "div", secret: true })).toThrow(/section/);
    expect(() => serializeTree({ tag: "section", secret: true, classes: ["loreframe-x"] })).toThrow(/bare/);
    expect(() => serializeTree({ tag: "section", secret: true, field: "x" })).toThrow(/bare/);
    expect(() => serializeTree({ tag: "section", secret: true, attrs: { role: "note" } })).toThrow(/bare/);
    expect(() => serializeTree({ tag: "section", secret: true, children: ["x"] })).toThrow(/text/);
  });
});
