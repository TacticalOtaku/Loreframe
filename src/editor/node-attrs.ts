/**
 * Compatibility boundary: reading HTML attributes from ProseMirror nodes.
 *
 * Foundry 14.367 has no public accessor for arbitrary element attributes on schema nodes. Its
 * AttributeCapture (common/prosemirror/schema/attribute-capture.mjs) stores every allowed attribute,
 * including `data-*`, in the node attr `_preserve`. This is the only module that knows that detail.
 */
import type { Node as PMNode } from "prosemirror-model";
import { DATA_ATTR } from "../constants";

export function getHtmlAttribute(node: PMNode, name: string): string | undefined {
  const preserved: unknown = node.attrs._preserve;
  if (typeof preserved !== "object" || preserved === null) return undefined;
  const value: unknown = (preserved as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/** The node's HTML classes (AttributeCapture keeps them in the `classes` attr, separately from `_preserve`). */
export function getHtmlClasses(node: PMNode): string[] {
  const classes: unknown = node.attrs.classes;
  return typeof classes === "string" ? classes.split(/\s+/).filter(Boolean) : [];
}

/** Whether the node is the root element of a Loreframe block. */
export function isLoreframeRoot(node: PMNode): boolean {
  return getHtmlAttribute(node, DATA_ATTR.template) !== undefined;
}

/** Whether the node is a slot region inside a block, where other blocks may be nested. */
export function isLoreframeSlot(node: PMNode): boolean {
  return getHtmlAttribute(node, DATA_ATTR.slot) !== undefined;
}

/** Node attrs with one HTML attribute replaced, for `tr.setNodeMarkup`. */
export function withHtmlAttribute(node: PMNode, name: string, value: string): Record<string, unknown> {
  const preserved: unknown = node.attrs._preserve;
  const base = typeof preserved === "object" && preserved !== null ? preserved : {};
  return { ...node.attrs, _preserve: { ...base, [name]: value } };
}

/** Foundry's secret node (common/prosemirror/schema/secret-node.mjs). */
export function isFoundrySecret(node: PMNode): boolean {
  return node.type.name === "secret";
}

/** A secret that exists only to hide one Loreframe block (see TemplateRenderer). It belongs to that block. */
export function isSecretWrapper(node: PMNode): boolean {
  return (
    isFoundrySecret(node) &&
    node.childCount === 1 &&
    node.firstChild !== null &&
    isLoreframeRoot(node.firstChild)
  );
}

export interface Identity {
  key: string;
  /** Node attrs carrying a fresh identifier. */
  renamed(freshId: string): Record<string, unknown>;
}

/** Identifiers that must stay unique in a document: block instance ids and Foundry secret ids. */
export function identityOf(node: PMNode): Identity | null {
  const instance = getHtmlAttribute(node, DATA_ATTR.instance);
  if (instance) {
    return {
      key: `instance:${instance}`,
      renamed: (freshId) => withHtmlAttribute(node, DATA_ATTR.instance, freshId),
    };
  }
  const secretId: unknown = isFoundrySecret(node) ? node.attrs.id : undefined;
  if (typeof secretId === "string" && secretId) {
    return { key: `secret:${secretId}`, renamed: (freshId) => ({ ...node.attrs, id: `secret-${freshId}` }) };
  }
  return null;
}
