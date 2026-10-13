import type { LoreframeTemplateDefinition, TemplateRendererFn } from "../../types";
import { labelHeading, paragraphs, text } from "../shared";

export const CALLOUT_RENDERER = "callout";
export const CALLOUT_TONES = ["note", "lore", "warning", "read-aloud", "gm-note", "secret"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/**
 * Callout: a labelled aside. The label is a heading for accessibility but carries `data-no-toc`,
 * which Foundry's JournalEntryPage.buildTOC skips.
 */
export const calloutRenderer: TemplateRendererFn = ({ definition, values }) => {
  const tone = definition.rendererOptions?.tone;
  if (typeof tone !== "string" || !(CALLOUT_TONES as readonly string[]).includes(tone)) {
    throw new Error(`Callout template "${definition.id}" has invalid tone "${String(tone)}"`);
  }
  return {
    tag: "aside",
    classes: ["loreframe-callout", `loreframe-callout--${tone}`],
    children: [
      labelHeading("loreframe-callout__title", text(values, "title"), "title"),
      {
        tag: "div",
        classes: ["loreframe-callout__body"],
        field: "body",
        children: paragraphs(text(values, "body")),
      },
    ],
  };
};

interface CalloutSpec {
  tone: CalloutTone;
  key: string;
  icon: string;
  tags: string[];
  secret?: boolean;
  bodyKey?: string;
}

function calloutDefinition({
  tone,
  key,
  icon,
  tags,
  secret,
  bodyKey,
}: CalloutSpec): LoreframeTemplateDefinition {
  return {
    id: tone,
    version: 1,
    name: `LOREFRAME.Template.${key}.Name`,
    description: `LOREFRAME.Template.${key}.Description`,
    category: "blocks",
    type: "block",
    icon,
    renderer: CALLOUT_RENDERER,
    rendererOptions: { tone },
    fields: [
      {
        id: "title",
        type: "text",
        label: "LOREFRAME.Field.Title",
        defaultKey: `LOREFRAME.Template.${key}.Name`,
      },
      {
        id: "body",
        type: "richText",
        label: "LOREFRAME.Field.Body",
        defaultKey: bodyKey ?? "LOREFRAME.Field.BodyPlaceholder",
      },
    ],
    focusField: "body",
    secret,
    tags,
  };
}

export const readAloudDefinition = calloutDefinition({
  tone: "read-aloud",
  key: "ReadAloud",
  icon: "fa-solid fa-book-open-reader",
  tags: ["boxed text", "description", "narration"],
  bodyKey: "LOREFRAME.Template.ReadAloud.Placeholder",
});

export const noteDefinition = calloutDefinition({
  tone: "note",
  key: "Note",
  icon: "fa-solid fa-message-lines",
  tags: ["callout", "aside", "info"],
});

export const loreDefinition = calloutDefinition({
  tone: "lore",
  key: "Lore",
  icon: "fa-solid fa-scroll-old",
  tags: ["callout", "history", "legend"],
});

export const warningDefinition = calloutDefinition({
  tone: "warning",
  key: "Warning",
  icon: "fa-solid fa-triangle-exclamation",
  tags: ["callout", "danger", "caution"],
});

export const gmNoteDefinition = calloutDefinition({
  tone: "gm-note",
  key: "GmNote",
  icon: "fa-solid fa-user-secret",
  tags: ["private", "gm only", "hidden"],
  secret: true,
});

export const secretDefinition = calloutDefinition({
  tone: "secret",
  key: "Secret",
  icon: "fa-solid fa-eye-slash",
  tags: ["reveal", "hidden", "plot"],
  secret: true,
});
