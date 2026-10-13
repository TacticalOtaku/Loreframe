import type { LinkItem } from "../types";

/**
 * Foundry content links as stored in Journal text: `@UUID[uuid]{label}`. Foundry inserts exactly this text when a
 * document is dropped into the editor (common/prosemirror/content-link-plugin.mjs) and enriches it on display.
 * The patterns mirror Foundry's enricher (client/applications/ux/text-editor.mjs): the uuid may carry a
 * "#heading" anchor and only "}" ends a label.
 */
const UUID_PATTERN = /^[^#\]\s{}]+(?:#[^\]\s]+)?$/;
const LINK_PATTERN = /^@UUID\[([^\]]+)\](?:\{([^}]*)\})?$/;

/**
 * The link text for an item. Without a usable uuid the label is returned exactly as written: it may be text the
 * author typed around a link, rolls or other enrichers, and must survive a rebuild unchanged.
 */
export function formatLink(item: Pick<LinkItem, "uuid" | "label">): string {
  if (!UUID_PATTERN.test(item.uuid)) return item.label.trim();
  const label = item.label.replace(/}/g, "").trim();
  return label ? `@UUID[${item.uuid}]{${label}}` : `@UUID[${item.uuid}]`;
}

/** Read a link back from its text; anything else is a plain label. */
export function parseLink(text: string): Pick<LinkItem, "uuid" | "label"> {
  const trimmed = text.trim();
  const match = LINK_PATTERN.exec(trimmed);
  if (!match?.[1] || !UUID_PATTERN.test(match[1])) return { uuid: "", label: trimmed };
  return { uuid: match[1], label: match[2]?.trim() ?? "" };
}

export function isLinkItem(value: unknown): value is LinkItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.uuid === "string" && typeof item.label === "string" && typeof item.note === "string";
}
