const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "LI",
  "UL",
  "OL",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "SECTION",
  "PRE",
]);

/** Foundry secret blocks (GM-only content, spec §22). */
const SECRET_SELECTOR = "section.secret";

function parseInert(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

/**
 * Plain text from system HTML (e.g. a biography): one paragraph per leaf block, markup dropped. Parsed in an inert
 * `<template>`, so nothing in the source runs or loads. Foundry secrets are left out unless `keepSecrets` is set,
 * which only callers writing into a GM-only destination may do.
 */
export function htmlToText(html: string | null | undefined, { keepSecrets = false } = {}): string {
  if (!html) return "";
  const root = parseInert(html);
  if (!keepSecrets) root.querySelectorAll(SECRET_SELECTOR).forEach((secret) => secret.remove());
  return fragmentText(root);
}

/** The text of the Foundry secrets in system HTML, for GM-only destinations. */
export function secretText(html: string | null | undefined): string {
  if (!html) return "";
  const secrets = [...parseInert(html).querySelectorAll(SECRET_SELECTOR)].filter(
    (secret) => !secret.parentElement?.closest(SECRET_SELECTOR),
  );
  return secrets
    .map((secret) => fragmentText(secret))
    .filter(Boolean)
    .join("\n\n");
}

function fragmentText(root: ParentNode): string {
  const paragraphs: string[] = [];
  let inline = "";
  const flush = () => {
    const text = normalize(inline);
    if (text) paragraphs.push(text);
    inline = "";
  };
  const walk = (node: Node): void => {
    const isBlock = node instanceof Element && BLOCK_TAGS.has(node.tagName);
    const hasBlocks =
      isBlock && [...(node as Element).children].some((child) => BLOCK_TAGS.has(child.tagName));
    if (isBlock) flush();
    if (isBlock && !hasBlocks) {
      inline = node.textContent ?? "";
      flush();
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      inline += node.textContent ?? "";
      return;
    }
    node.childNodes.forEach(walk);
    if (isBlock) flush();
  };
  root.childNodes.forEach(walk);
  flush();
  return paragraphs.join("\n\n");
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
