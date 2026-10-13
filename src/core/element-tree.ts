import { DATA_ATTR } from "../constants";
import type { TreeChild, TreeElement } from "../types";
import { escapeHtml } from "../utils/html";

export class LoreframeMarkupError extends Error {
  override name = "LoreframeMarkupError";
}

/** Tags that only hold block children — Foundry's schema gives them `block*` content (spec §12). */
const CONTAINER_TAGS = new Set([
  "aside",
  "div",
  "section",
  "header",
  "footer",
  "article",
  "nav",
  "blockquote",
  "ul",
  "ol",
  "li",
  // Tables: section/row structure, and cells hold blocks (schema/tables.mjs cellContent "block+").
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
/** Tags whose children are inline text. */
const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "figcaption"]);
const VOID_TAGS = new Set(["hr", "img"]);
/** `figure` is special in the schema: `image? figcaption? block*`. */
const OTHER_TAGS = new Set(["figure"]);

const EXACT_ATTRS = new Set(["data-no-toc", "alt", "src", "role"]);
const URL_ATTRS = new Set(["src"]);
/** The only classes renderers may emit; rebuilds also use it to tell template markup from the author's writing. */
export const CLASS_PATTERN = /^loreframe[a-z0-9_-]*$/;
const FIELD_PATTERN = /^[a-z][a-z0-9-]*$/;
const ATTR_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Serialize an element tree into HTML. This is the only path from renderer output to markup, so it enforces
 * the Loreframe allow-list and escapes every value.
 */
export function serializeTree(tree: TreeElement): string {
  return serializeElement(tree);
}

function serializeElement(node: TreeElement): string {
  if (node.secret) return serializeSecret(node);
  const tag = node.tag;
  const isVoid = VOID_TAGS.has(tag);
  if (!isVoid && !CONTAINER_TAGS.has(tag) && !TEXT_TAGS.has(tag) && !OTHER_TAGS.has(tag)) {
    throw new LoreframeMarkupError(`Disallowed tag <${tag}>`);
  }

  const attrs: string[] = [];
  if (node.classes?.length) {
    for (const cls of node.classes) {
      if (!CLASS_PATTERN.test(cls)) throw new LoreframeMarkupError(`Disallowed class "${cls}"`);
    }
    attrs.push(`class="${node.classes.join(" ")}"`);
  }
  if (node.field !== undefined) {
    if (!FIELD_PATTERN.test(node.field)) throw new LoreframeMarkupError(`Invalid field name "${node.field}"`);
    attrs.push(`${DATA_ATTR.field}="${node.field}"`);
  }
  if (node.slot !== undefined) {
    if (!FIELD_PATTERN.test(node.slot)) throw new LoreframeMarkupError(`Invalid slot name "${node.slot}"`);
    if (!CONTAINER_TAGS.has(node.tag))
      throw new LoreframeMarkupError(`Slot <${node.tag}> must be a block container`);
    attrs.push(`${DATA_ATTR.slot}="${node.slot}"`);
  }
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    assertAllowedAttribute(name, value);
    attrs.push(`${name}="${escapeHtml(value)}"`);
  }

  const open = attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`;
  const children = node.children ?? [];
  if (isVoid) {
    if (children.length) throw new LoreframeMarkupError(`Void element <${tag}> cannot have children`);
    return open;
  }
  return `${open}${children.map((child) => serializeChild(tag, child)).join("")}</${tag}>`;
}

/**
 * Foundry's reveal toggle (client/applications/elements/secret-block.mjs) rewrites the secret's opening tag with a
 * regex, so the tag carries nothing but its class. ProseMirror assigns the id while parsing.
 */
function serializeSecret(node: TreeElement): string {
  if (node.tag !== "section")
    throw new LoreframeMarkupError(`A secret must be a <section>, not <${node.tag}>`);
  if (
    node.classes?.length ||
    node.field !== undefined ||
    node.slot !== undefined ||
    Object.keys(node.attrs ?? {}).length
  ) {
    throw new LoreframeMarkupError("A secret section must be bare");
  }
  return `<section class="secret">${(node.children ?? []).map((child) => serializeChild("section", child)).join("")}</section>`;
}

function serializeChild(parentTag: string, child: TreeChild): string {
  if (typeof child !== "string") return serializeElement(child);
  if (!TEXT_TAGS.has(parentTag)) {
    throw new LoreframeMarkupError(`Bare text is not allowed directly inside <${parentTag}>`);
  }
  return escapeHtml(child);
}

function assertAllowedAttribute(name: string, value: string): void {
  const allowed =
    ATTR_NAME_PATTERN.test(name) &&
    (EXACT_ATTRS.has(name) || name.startsWith("data-loreframe-") || name.startsWith("aria-"));
  if (!allowed) throw new LoreframeMarkupError(`Disallowed attribute "${name}"`);
  if (URL_ATTRS.has(name) && !isSafeUrl(value)) {
    throw new LoreframeMarkupError(`Disallowed URL in ${name}: "${value}"`);
  }
}

/** http(s) or a relative path inside the Foundry data tree. No scheme-relative or other schemes. */
function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("//")) return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) return ![...trimmed].some((char) => char.charCodeAt(0) < 0x20);
  return scheme === "http" || scheme === "https";
}
