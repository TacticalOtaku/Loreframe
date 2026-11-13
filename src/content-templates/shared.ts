import { MODULE_ID } from "../constants";
import type { TemplateValues, TreeElement } from "../types";

/** Neutral image shipped with the module, used until the author picks a real image. */
export const PLACEHOLDER_IMAGE = `modules/${MODULE_ID}/assets/placeholders/image.svg`;

/** Read a string value; resolveValues guarantees declared text fields are strings. */
export function text(values: TemplateValues, field: string): string {
  const value = values[field];
  return typeof value === "string" ? value : "";
}

/** Read an option value from `allowed`, falling back to its first entry when absent or invalid. */
export function selectOption(values: TemplateValues, field: string, allowed: readonly string[]): string {
  const value = values[field];
  return typeof value === "string" && allowed.includes(value) ? value : (allowed[0] ?? "");
}

/** Plain text → paragraphs, splitting on blank lines. Always yields at least one (possibly empty) paragraph. */
export function paragraphs(value: string): TreeElement[] {
  const parts = value
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts.length ? parts : [""]).map((part) => ({ tag: "p", children: part ? [part] : [] }));
}

/** A small label heading that Foundry's page table of contents skips (`data-no-toc`). */
export function labelHeading(className: string, label: string, field?: string): TreeElement {
  return { tag: "h4", classes: [className], field, attrs: { "data-no-toc": "" }, children: [label] };
}

/**
 * An image field. The field lives on a wrapper because Foundry's image prompt replaces the `<img>` node
 * (common/prosemirror/menu.mjs `_insertImagePrompt`), which would drop attributes set on the image itself.
 */
export function imageField(className: string, src: string, alt: string, field = "image"): TreeElement {
  return {
    tag: "div",
    classes: [className],
    field,
    children: [{ tag: "img", attrs: { src: src || PLACEHOLDER_IMAGE, alt } }],
  };
}

/** A slot region pre-filled with placeholder paragraphs. */
export function slotRegion(classes: string[], slot: string, placeholder: string): TreeElement {
  return { tag: "div", classes, slot, children: paragraphs(placeholder) };
}

/** A table cell holding one paragraph (Foundry table cells require block content). */
export function cell(tag: "th" | "td", value: string): TreeElement {
  return { tag, children: [{ tag: "p", children: value ? [value] : [] }] };
}

/**
 * A rich-text region hidden from players: a bare Foundry secret inside the field element, so `enrichHTML` strips it
 * and the reveal toggle works (spec §22). Blocks must not use other `<section>` tags: the reveal regex starts at one.
 */
export function secretRegion(
  classes: string[],
  field: string,
  label: TreeElement,
  body: string,
): TreeElement {
  return {
    tag: "div",
    classes: ["loreframe-secret-region", ...classes],
    field,
    children: [{ tag: "section", secret: true, children: [label, ...paragraphs(body)] }],
  };
}
