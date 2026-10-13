/**
 * A reduced copy of Foundry 14.367's ProseMirror schema (common/prosemirror/schema.mjs):
 * structural tags are `block*` containers and every node captures `class` + `data-*` attributes
 * the way AttributeCapture does.
 */
import { DOMParser, DOMSerializer, Schema, type DOMOutputSpec, type NodeSpec } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";

function capture(spec: NodeSpec): NodeSpec {
  const parseDOM = spec.parseDOM?.map((rule) => ({
    ...rule,
    getAttrs: (el: HTMLElement) => {
      const base = rule.attrs ?? {};
      const preserve: Record<string, string> = {};
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith("data-") || attr.name.startsWith("aria-")) preserve[attr.name] = attr.value;
      }
      return { ...base, classes: el.className ?? "", _preserve: preserve };
    },
  }));
  const toDOM = spec.toDOM;
  if (!toDOM) throw new Error("test node spec needs toDOM");
  return {
    ...spec,
    attrs: { ...spec.attrs, classes: { default: "" }, _preserve: { default: {} } },
    parseDOM,
    toDOM: (node: PMNode): DOMOutputSpec => {
      const out = toDOM(node) as [string, ...unknown[]];
      const attrs: Record<string, string> = { ...(node.attrs._preserve as Record<string, string>) };
      if (node.attrs.classes) attrs.class = node.attrs.classes as string;
      return (spec.content ? [out[0], attrs, 0] : [out[0], attrs]) as DOMOutputSpec;
    },
  };
}

const container = (tag: string): NodeSpec =>
  capture({ content: "block*", group: "block", defining: true, parseDOM: [{ tag }], toDOM: () => [tag, 0] });

export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    // Foundry's inline group has generatable nodes (hard_break, icon), which content like inline+ requires.
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
    paragraph: capture({
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    }),
    heading: capture({
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    }),
    bullet_list: capture({
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    }),
    list_item: capture({
      content: "paragraph block*",
      defining: true,
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0],
    }),
    // Foundry: SecretNode is declared before the generic section node, so it wins for section.secret.
    secret: {
      content: "block+",
      group: "block",
      defining: true,
      attrs: { id: { default: "" }, revealed: { default: false } },
      parseDOM: [
        {
          tag: "section",
          getAttrs: (el: HTMLElement) =>
            el.classList.contains("secret")
              ? {
                  id: el.id || `secret-${Math.random().toString(36).slice(2, 10)}`,
                  revealed: el.classList.contains("revealed"),
                }
              : false,
        },
      ],
      toDOM: (node) => [
        "section",
        { id: node.attrs.id, class: `secret${node.attrs.revealed ? " revealed" : ""}` },
        0,
      ],
    },
    ordered_list: capture({
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ol" }],
      toDOM: () => ["ol", 0],
    }),
    image: {
      group: "block",
      attrs: { src: {}, alt: { default: null } },
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (el: HTMLElement) => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") }),
        },
      ],
      toDOM: (node) => [
        "img",
        node.attrs.alt ? { src: node.attrs.src, alt: node.attrs.alt } : { src: node.attrs.src },
      ],
    },
    table: capture({
      content: "table_head? table_body",
      group: "block",
      isolating: true,
      parseDOM: [{ tag: "table" }],
      toDOM: () => ["table", 0],
    }),
    table_head: { content: "table_row+", parseDOM: [{ tag: "thead" }], toDOM: () => ["thead", 0] },
    table_body: { content: "table_row+", parseDOM: [{ tag: "tbody" }], toDOM: () => ["tbody", 0] },
    table_row: { content: "(table_cell | table_header)+", parseDOM: [{ tag: "tr" }], toDOM: () => ["tr", 0] },
    table_cell: { content: "block+", isolating: true, parseDOM: [{ tag: "td" }], toDOM: () => ["td", 0] },
    table_header: { content: "block+", isolating: true, parseDOM: [{ tag: "th" }], toDOM: () => ["th", 0] },
    figure: capture({
      content: "image? figcaption? block*",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "figure" }],
      toDOM: () => ["figure", 0],
    }),
    figcaption: capture({
      content: "inline+",
      defining: true,
      parseDOM: [{ tag: "figcaption" }],
      toDOM: () => ["figcaption", 0],
    }),
    blockquote: capture({
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    }),
    aside: container("aside"),
    div: container("div"),
    section: container("section"),
    header: container("header"),
    article: container("article"),
    nav: container("nav"),
    horizontal_rule: capture({ group: "block", parseDOM: [{ tag: "hr" }], toDOM: () => ["hr"] }),
  },
  // Inline formatting authors apply with Foundry's menu; enough to test that rebuilds keep it.
  marks: {
    strong: { parseDOM: [{ tag: "strong" }, { tag: "b" }], toDOM: () => ["strong", 0] },
    em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
  },
});

const parser = DOMParser.fromSchema(schema);
const serializer = DOMSerializer.fromSchema(schema);

/** Equivalent of Foundry's `ProseMirror.dom.parseString`. */
export function parseString(html: string): PMNode {
  const template = document.createElement("template");
  template.innerHTML = html;
  return parser.parse(template.content);
}

/** Equivalent of Foundry's `ProseMirror.dom.serializeString`. */
export function serializeString(doc: PMNode): string {
  const wrapper = document.createElement("div");
  wrapper.append(serializer.serializeFragment(doc.content));
  return wrapper.innerHTML;
}
