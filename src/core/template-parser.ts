import { DATA_ATTR } from "../constants";
import type { BlockStatus, LoreframeTemplateDefinition, ParsedBlock } from "../types";

const BLOCK_SELECTOR = `[${DATA_ATTR.template}]`;
const FIELD_SELECTOR = `[${DATA_ATTR.field}]`;
/** Template versions are positive integers (TemplateRegistry). */
export const VERSION_PATTERN = /^[1-9]\d*$/;

export type TemplateLookup = { get(id: string): Pick<LoreframeTemplateDefinition, "version"> | undefined };

/**
 * Find Loreframe blocks under `root` (inclusive) in document order. Identification relies only on
 * `data-loreframe-*` attributes, never on styling classes (spec §10). Nothing is modified.
 */
export function parseBlocks(root: Element | DocumentFragment, templates: TemplateLookup): ParsedBlock[] {
  const elements = [...root.querySelectorAll(BLOCK_SELECTOR)];
  if (root instanceof Element && root.matches(BLOCK_SELECTOR)) elements.unshift(root);
  return elements.map((element) => parseBlock(element, templates));
}

function parseBlock(element: Element, templates: TemplateLookup): ParsedBlock {
  const templateId = element.getAttribute(DATA_ATTR.template) ?? "";
  const rawVersion = element.getAttribute(DATA_ATTR.version);
  const version = rawVersion !== null && VERSION_PATTERN.test(rawVersion) ? Number(rawVersion) : null;
  return {
    element,
    templateId,
    version,
    instanceId: element.getAttribute(DATA_ATTR.instance),
    preset: element.getAttribute(DATA_ATTR.preset),
    status: statusOf(templateId, version, templates),
    fields: ownFields(element),
  };
}

function statusOf(templateId: string, version: number | null, templates: TemplateLookup): BlockStatus {
  const definition = templates.get(templateId);
  if (!definition) return "unknown";
  if (version === null) return "invalid";
  if (version < definition.version) return "outdated";
  if (version > definition.version) return "newer";
  return "current";
}

/** Field elements whose nearest enclosing block is `block`. First occurrence of a field name wins. */
function ownFields(block: Element): Map<string, Element> {
  const fields = new Map<string, Element>();
  for (const field of block.querySelectorAll(FIELD_SELECTOR)) {
    if (field.parentElement?.closest(BLOCK_SELECTOR) !== block) continue;
    const name = field.getAttribute(DATA_ATTR.field) ?? "";
    if (!fields.has(name)) fields.set(name, field);
  }
  return fields;
}
