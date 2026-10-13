import { formatLink } from "../core/links";
import type { TemplateValues } from "../types";
import type { LoreframeNpcData } from "./types";

export interface NpcValueDeps {
  localize(key: string): string;
  format(key: string, data: Record<string, string>): string;
}

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

const DOSSIER_SECTIONS = ["appearance", "personality", "motivation", "relationships", "fears"] as const;
const DOSSIER_EMPTY = ["voice", "goals", "knowledge", "rumours"];

/**
 * Template values for a snapshot of `npc` (spec §35). Missing data is an empty value, never placeholder text; GM-only
 * text is only used where the template renders it inside a Foundry secret.
 */
export function npcTemplateValues(
  npc: LoreframeNpcData,
  templateId: string,
  deps: NpcValueDeps,
): TemplateValues {
  const link = formatLink({ uuid: npc.uuid, label: npc.name });
  const common: TemplateValues = {
    name: npc.name,
    image: npc.image,
    alt: deps.format("LOREFRAME.Integration.PortraitAlt", { name: npc.name }),
    ancestry: npc.ancestry,
    occupation: npc.occupation,
  };
  switch (templateId) {
    case "npc-card":
      return {
        ...common,
        summary: npc.summary,
        personality: firstSentence(npc.personality),
        goal: firstSentence(npc.motivation),
        location: "",
        notes: link,
      };
    case "npc-dossier": {
      const values: TemplateValues = {
        ...common,
        role: npc.role,
        summary: [npc.summary, link].filter(Boolean).join("\n\n"),
        secrets: npc.secrets,
        "show-summary": true,
        "show-secrets": npc.secrets !== "",
      };
      for (const field of DOSSIER_SECTIONS) {
        values[field] = npc[field];
        values[`show-${field}`] = npc[field] !== "";
      }
      for (const field of DOSSIER_EMPTY) {
        values[field] = "";
        values[`show-${field}`] = false;
      }
      return values;
    }
    default:
      throw new Error(`Template "${templateId}" cannot be filled from NPC data`);
  }
}

/** Card facts are one line: keep the first sentence of longer text. */
function firstSentence(text: string): string {
  const line = text.split("\n")[0] ?? "";
  const match = /^(.+?[.!?])(\s|$)/.exec(line);
  return (match?.[1] ?? line).trim();
}
