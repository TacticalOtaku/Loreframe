import type { LoreframeTemplateDefinition, TemplateRendererFn } from "../../types";
import { paragraphs, text } from "../shared";

export const SUBTITLE_RENDERER = "subtitle";
export const QUOTE_RENDERER = "quote";

/** A standalone subtitle line under a heading. */
export const subtitleRenderer: TemplateRendererFn = ({ values }) => ({
  tag: "div",
  classes: ["loreframe-subtitle"],
  children: [
    { tag: "p", classes: ["loreframe-subtitle__text"], field: "text", children: [text(values, "text")] },
  ],
});

export const subtitleDefinition: LoreframeTemplateDefinition = {
  id: "subtitle",
  version: 1,
  name: "LOREFRAME.Template.Subtitle.Name",
  description: "LOREFRAME.Template.Subtitle.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-text",
  renderer: SUBTITLE_RENDERER,
  fields: [
    {
      id: "text",
      type: "text",
      label: "LOREFRAME.Field.Text",
      defaultKey: "LOREFRAME.Field.SubtitlePlaceholder",
    },
  ],
  focusField: "text",
  tags: ["tagline", "byline"],
};

/** A pull quote with an attribution line. */
export const quoteRenderer: TemplateRendererFn = ({ values }) => {
  const attribution = text(values, "attribution");
  return {
    tag: "div",
    classes: ["loreframe-quote"],
    children: [
      {
        tag: "blockquote",
        classes: ["loreframe-quote__text"],
        field: "quote",
        children: paragraphs(text(values, "quote")),
      },
      ...(attribution
        ? [
            {
              tag: "p",
              classes: ["loreframe-quote__attribution"],
              field: "attribution",
              children: [attribution],
            },
          ]
        : []),
    ],
  };
};

export const quoteDefinition: LoreframeTemplateDefinition = {
  id: "quote",
  version: 1,
  name: "LOREFRAME.Template.Quote.Name",
  description: "LOREFRAME.Template.Quote.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-quote-left",
  renderer: QUOTE_RENDERER,
  fields: [
    {
      id: "quote",
      type: "richText",
      label: "LOREFRAME.Field.Quote",
      defaultKey: "LOREFRAME.Template.Quote.Placeholder",
    },
    {
      id: "attribution",
      type: "text",
      label: "LOREFRAME.Field.Attribution",
      defaultKey: "LOREFRAME.Template.Quote.Attribution",
    },
  ],
  focusField: "quote",
  tags: ["citation", "epigraph", "saying"],
};
