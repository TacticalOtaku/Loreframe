import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { StateModule } from "./insert";
import { DATA_ATTR } from "../constants";
import { PLACEHOLDER_IMAGE } from "../content-templates/shared";
import { CLASS_PATTERN } from "../core/element-tree";
import { parseLink } from "../core/links";
import { VERSION_PATTERN } from "../core/template-parser";
import type { GalleryItem, LinkItem, LoreframeTemplateDefinition, TemplateValues } from "../types";
import {
  getHtmlAttribute,
  getHtmlClasses,
  identityOf,
  isFoundrySecret,
  isLoreframeRoot,
  isSecretWrapper,
} from "./node-attrs";

/**
 * Block-level document operations used by the block toolbar and the inspector. Pure ProseMirror: no Foundry.
 */
export interface BlockLocation {
  templateId: string;
  instanceId: string;
  /** The Loreframe root node (`data-loreframe-template`). */
  root: PMNode;
  rootPos: number;
  /** The node that represents the whole block in the document: the secret wrapper, or the root itself. */
  host: PMNode;
  hostPos: number;
}

function locationFor(root: PMNode, rootPos: number, $root: ResolvedPos): BlockLocation {
  const wrapped = $root.depth > 0 && isSecretWrapper($root.parent);
  return {
    templateId: getHtmlAttribute(root, DATA_ATTR.template) ?? "",
    instanceId: getHtmlAttribute(root, DATA_ATTR.instance) ?? "",
    root,
    rootPos,
    host: wrapped ? $root.parent : root,
    hostPos: wrapped ? $root.before() : rootPos,
  };
}

/** The block with the given instance id, or null when it no longer exists. */
export function locateBlock(doc: PMNode, instanceId: string): BlockLocation | null {
  let found: BlockLocation | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (isLoreframeRoot(node) && getHtmlAttribute(node, DATA_ATTR.instance) === instanceId) {
      found = locationFor(node, pos, doc.resolve(pos));
      return false;
    }
    return true;
  });
  return found;
}

/** The innermost block that contains `$pos` (slots do not stop the search: the toolbar targets the nearest block). */
export function blockAt($pos: ResolvedPos): BlockLocation | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isLoreframeRoot(node)) {
      const rootPos = $pos.before(depth);
      return locationFor(node, rootPos, $pos.doc.resolve(rootPos));
    }
  }
  return null;
}

/* -------------------------------------------- */
/*  Versions                                    */
/* -------------------------------------------- */

export type BlockVersionState = "current" | "outdated" | "newer" | "invalid";

/**
 * How a block's stored version relates to its registered template (same rules as the template parser). Only
 * current blocks may be rebuilt: rendering a newer or invalid block with this template would destroy its markup.
 */
export function blockVersionState(root: PMNode, definition: LoreframeTemplateDefinition): BlockVersionState {
  const raw = getHtmlAttribute(root, DATA_ATTR.version);
  if (raw === undefined || !VERSION_PATTERN.test(raw)) return "invalid";
  const version = Number(raw);
  if (version === definition.version) return "current";
  return version < definition.version ? "outdated" : "newer";
}

/* -------------------------------------------- */
/*  Reading values                              */
/* -------------------------------------------- */

/** Every node inside `root` named `name` (field or slot), not looking into nested blocks or into the matches. */
function findRegions(root: PMNode, name: string, attr: string): PMNode[] {
  const found: PMNode[] = [];
  root.descendants((node) => {
    if (isLoreframeRoot(node)) return false;
    if (getHtmlAttribute(node, attr) !== name) return true;
    found.push(node);
    return false;
  });
  return found;
}

/** The first node inside `root` named `name` (field or slot), not looking into nested blocks. */
function findRegion(root: PMNode, name: string, attr: string): PMNode | null {
  return findRegions(root, name, attr)[0] ?? null;
}

function firstImage(node: PMNode): PMNode | null {
  let found: PMNode | null = null;
  node.descendants((child) => {
    if (found) return false;
    if (child.type.name === "image") found = child;
    return !found;
  });
  return found;
}

function imageSource(image: PMNode | null): string {
  const src: unknown = image?.attrs.src;
  return typeof src === "string" && src !== PLACEHOLDER_IMAGE ? src : "";
}

function textAttr(node: PMNode | null, name: string): string {
  const value: unknown = node?.attrs[name];
  return typeof value === "string" ? value : "";
}

function readItems(region: PMNode): GalleryItem[] {
  const items: GalleryItem[] = [];
  region.forEach((figure) => {
    if (figure.type.name !== "figure") return;
    const image = firstImage(figure);
    let caption = "";
    figure.forEach((child) => {
      if (child.type.name === "figcaption") caption = child.textContent;
    });
    items.push({ src: imageSource(image), alt: textAttr(image, "alt"), caption });
  });
  return items;
}

function readLinks(region: PMNode): LinkItem[] {
  const items: LinkItem[] = [];
  region.forEach((item) => {
    if (item.type.name !== "list_item") return;
    // Every textblock counts, including nested lists the author added, so nothing is dropped from the note.
    const paragraphs: string[] = [];
    item.descendants((child) => {
      if (!child.isTextblock) return true;
      paragraphs.push(child.textContent);
      return false;
    });
    const [link = "", ...notes] = paragraphs;
    const parsed = parseLink(link);
    if (!parsed.uuid && !parsed.label) return;
    items.push({ ...parsed, note: notes.join(" ").trim() });
  });
  return items;
}

/**
 * Property values of a block as stored in the document. Rich-text fields are not read: they are edited in the
 * Journal editor and preserved by `rebuildBlockTransaction`.
 */
export function readBlockValues(root: PMNode, definition: LoreframeTemplateDefinition): TemplateValues {
  const values: TemplateValues = {};
  for (const field of definition.fields ?? []) {
    switch (field.type) {
      case "select":
      case "boolean": {
        const raw = getHtmlAttribute(root, `${DATA_ATTR.optionPrefix}${field.id}`);
        if (raw === undefined) break;
        values[field.id] = field.type === "boolean" ? raw === "true" : raw;
        break;
      }
      case "image": {
        const region = findRegion(root, field.id, DATA_ATTR.field);
        if (region) values[field.id] = imageSource(firstImage(region));
        break;
      }
      case "text": {
        if (field.imageAltFor) {
          const region = findRegion(root, field.imageAltFor, DATA_ATTR.field);
          if (region) values[field.id] = textAttr(firstImage(region), "alt");
          break;
        }
        // Renderers omit empty optional text, so a missing element means the value was cleared. Splitting a field
        // with Enter copies its attributes to the new half: all halves together are the value.
        const regions = findRegions(root, field.id, DATA_ATTR.field);
        values[field.id] =
          regions.length > 1
            ? regions
                .map((region) => region.textContent.trim())
                .filter(Boolean)
                .join(" ")
            : (regions[0]?.textContent ?? "");
        break;
      }
      case "items": {
        const region = findRegion(root, field.id, DATA_ATTR.field);
        if (region) values[field.id] = readItems(region);
        break;
      }
      case "links": {
        // Renderers omit empty lists, so a missing list is an empty one.
        const region = findRegion(root, field.id, DATA_ATTR.field);
        values[field.id] = region ? readLinks(region) : [];
        break;
      }
      case "richText":
        break;
    }
  }
  return values;
}

/** Structural equality that ignores identifiers generated while parsing (Foundry secret ids). */
function sameContent(a: PMNode, b: PMNode): boolean {
  if (a.type !== b.type || a.childCount !== b.childCount || !sameMarks(a, b)) return false;
  if (a.isText) return a.text === b.text;
  const comparable = (node: PMNode) =>
    JSON.stringify(isFoundrySecret(node) ? { ...node.attrs, id: null } : node.attrs);
  if (comparable(a) !== comparable(b)) return false;
  for (let i = 0; i < a.childCount; i++) {
    if (!sameContent(a.child(i), b.child(i))) return false;
  }
  return true;
}

function sameMarks(a: PMNode, b: PMNode): boolean {
  return a.marks.length === b.marks.length && a.marks.every((mark, i) => b.marks[i]?.eq(mark) === true);
}

/** Whether a region holds anything worth keeping: text, images or nested blocks. */
function hasContent(region: PMNode): boolean {
  if (region.textContent.trim()) return true;
  let found = false;
  region.descendants((node) => {
    if (node.type.name === "image" || isLoreframeRoot(node)) found = true;
    return !found;
  });
  return found;
}

/**
 * Rich-text fields and slots the author has changed: they hold content and differ from the same region of
 * `fresh` (the block rendered with default values). Used to confirm before a toggle removes them.
 */
export function writtenRegions(
  root: PMNode,
  fresh: PMNode,
  definition: LoreframeTemplateDefinition,
): string[] {
  const regions = [
    ...(definition.fields ?? [])
      .filter((f) => f.type === "richText")
      .map((f) => [f.id, DATA_ATTR.field] as const),
    ...(definition.slots ?? []).map((slot) => [slot, DATA_ATTR.slot] as const),
  ];
  return regions
    .filter(([id, attr]) => {
      const written = findRegion(root, id, attr);
      if (!written || !hasContent(written)) return false;
      const original = findRegion(fresh, id, attr);
      return !original || !sameContent(written, original);
    })
    .map(([id]) => id);
}

/* -------------------------------------------- */
/*  Writing                                     */
/* -------------------------------------------- */

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Property fields whose region can be taken over from `old` as it is: the edit left their value unchanged, so the
 * author's inline formatting, links and extra structure in them survive. A field split into several regions is
 * rebuilt from its joined value instead, so no half is dropped.
 */
function unchangedFields(fresh: PMNode, old: PMNode, definition: LoreframeTemplateDefinition): Set<string> {
  const fields = definition.fields ?? [];
  const oldValues = readBlockValues(old, definition);
  const freshValues = readBlockValues(fresh, definition);
  const same = (id: string) => sameJson(oldValues[id], freshValues[id]);
  const kept = new Set<string>();
  for (const field of fields) {
    if (!["text", "image", "items", "links"].includes(field.type) || field.imageAltFor) continue;
    if (findRegions(old, field.id, DATA_ATTR.field).length !== 1) continue;
    // An image region also carries the alt text of the fields bound to it.
    const bound = fields.filter((other) => other.imageAltFor === field.id).map((other) => other.id);
    if (same(field.id) && bound.every(same)) kept.add(field.id);
  }
  return kept;
}

/**
 * `fresh` is the block rendered with new values. Every rich-text field and slot, and every property region whose
 * value did not change, is replaced by the matching region of `old`, so the author's writing, formatting and nested
 * blocks survive property edits.
 */
export function graftBlock(fresh: PMNode, old: PMNode, definition: LoreframeTemplateDefinition): PMNode {
  const keptFields = new Set([
    ...(definition.fields ?? []).filter((f) => f.type === "richText").map((f) => f.id),
    ...unchangedFields(fresh, old, definition),
  ]);
  const slots = new Set(definition.slots ?? []);

  const graft = (node: PMNode): PMNode => {
    const field = getHtmlAttribute(node, DATA_ATTR.field);
    const slot = getHtmlAttribute(node, DATA_ATTR.slot);
    const kept =
      (field !== undefined && keptFields.has(field) && findRegion(old, field, DATA_ATTR.field)) ||
      (slot !== undefined && slots.has(slot) && findRegion(old, slot, DATA_ATTR.slot));
    if (kept && node.type.validContent(kept.content)) return node.copy(kept.content);

    let content = node.content;
    node.forEach((child, _offset, index) => {
      const next = graft(child);
      if (next !== child) content = content.replaceChild(index, next);
    });
    return content === node.content ? node : node.copy(content);
  };
  return graft(fresh);
}

/** Replace a block with a freshly rendered version of itself (`freshHost` as parsed, wrapper included). */
export function rebuildBlockTransaction(
  state: EditorState,
  location: BlockLocation,
  freshHost: PMNode,
  definition: LoreframeTemplateDefinition,
  pm: StateModule,
): Transaction {
  const freshWrapped = isSecretWrapper(freshHost);
  const freshRoot = (freshWrapped ? freshHost.firstChild : freshHost) ?? freshHost;
  const grafted = graftBlock(freshRoot, location.root, definition);

  let host = grafted;
  // Keep the existing Foundry secret (id and revealed state) when the block already has one.
  if (location.host !== location.root)
    host = location.host.copy(location.host.content.replaceChild(0, grafted));
  else if (freshWrapped) host = freshHost.copy(freshHost.content.replaceChild(0, grafted));

  const tr = state.tr.replaceWith(location.hostPos, location.hostPos + location.host.nodeSize, host);
  // Writing the template does not own (e.g. a paragraph started with Enter after a title) would vanish with the
  // old block: it goes right below the rebuilt block instead.
  const parent = state.doc.resolve(location.hostPos).parent;
  const orphans = writingOutsideFields(location.root).flatMap((node) => fitInto(parent, node));
  if (orphans.length) tr.insert(location.hostPos + host.nodeSize, orphans);
  tr.setMeta(MOVED_OUT, orphans.length);
  // Keep working inside the edited block instead of letting the mapped selection drift into a neighbour.
  return tr.setSelection(pm.Selection.near(tr.doc.resolve(location.hostPos + 1)));
}

const MOVED_OUT = "loreframeMovedOut";

/** How many pieces of the author's writing a rebuild moved below the block. */
export function movedOutOfBlock(tr: Transaction): number {
  const value: unknown = tr.getMeta(MOVED_OUT);
  return typeof value === "number" ? value : 0;
}

/**
 * Nodes inside a block root that belong to no field or slot and were not produced by the template: renderer output
 * outside fields always carries a `loreframe*` class (checked for every built-in template in the tests).
 * Returns the outermost such nodes in document order.
 */
function writingOutsideFields(root: PMNode): PMNode[] {
  const found: PMNode[] = [];
  const visit = (node: PMNode) => {
    node.forEach((child) => {
      if (child.isText || child.isInline) return;
      const owned =
        getHtmlAttribute(child, DATA_ATTR.field) !== undefined ||
        getHtmlAttribute(child, DATA_ATTR.slot) !== undefined;
      if (owned) return;
      const templateNode = getHtmlClasses(child).some((cls) => CLASS_PATTERN.test(cls));
      if (templateNode && !isLoreframeRoot(child)) visit(child);
      else if (!templateNode && (child.textContent.trim() || hasContent(child))) found.push(child);
      else if (isLoreframeRoot(child)) found.push(child);
    });
  };
  visit(root);
  return found;
}

/** The node itself when the block's parent accepts it, otherwise its text as a paragraph. */
function fitInto(parent: PMNode, node: PMNode): PMNode[] {
  if (parent.type.contentMatch.matchType(node.type)) return [node];
  const { schema } = parent.type;
  const text = node.textContent.trim();
  return schema.nodes.paragraph && text ? [schema.nodes.paragraph.create(null, schema.text(text))] : [];
}

/** Insert a copy of the block right after it, with new instance and secret ids. */
export function duplicateBlockTransaction(
  state: EditorState,
  location: BlockLocation,
  newId: () => string,
): Transaction {
  const start = location.hostPos + location.host.nodeSize;
  const tr = state.tr.insert(start, location.host);
  tr.doc.nodesBetween(start, start + location.host.nodeSize, (node, pos) => {
    if (pos < start) return true;
    const identity = identityOf(node);
    if (identity) tr.setNodeMarkup(pos, undefined, identity.renamed(newId()));
    return true;
  });
  return tr;
}

/** Remove the block (and its secret wrapper). The document never ends up empty. */
export function deleteBlockTransaction(
  state: EditorState,
  location: BlockLocation,
  pm: StateModule,
): Transaction {
  const from = location.hostPos;
  const to = from + location.host.nodeSize;
  const tr = state.tr;
  const $from = state.doc.resolve(from);
  const paragraph = state.schema.nodes.paragraph;
  if ($from.parent.childCount === 1 && paragraph) {
    tr.replaceWith(from, to, paragraph.create());
    return tr.setSelection(pm.TextSelection.create(tr.doc, from + 1));
  }
  tr.delete(from, to);
  return tr.setSelection(pm.Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1));
}
