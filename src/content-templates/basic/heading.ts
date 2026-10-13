import type { LoreframeTemplateDefinition, TemplateRendererFn } from "../../types";
import { text } from "../shared";

export const HEADING_RENDERER = "heading";

/** Section heading with a subtitle. The title is a real section heading and stays in the page ToC. */
export const headingRenderer: TemplateRendererFn = ({ values }) => {
  const subtitle = text(values, "subtitle");
  return {
    tag: "header",
    classes: ["loreframe-heading"],
    children: [
      { tag: "h2", classes: ["loreframe-heading__title"], field: "title", children: [text(values, "title")] },
      ...(subtitle
        ? [{ tag: "p", classes: ["loreframe-heading__subtitle"], field: "subtitle", children: [subtitle] }]
        : []),
    ],
  };
};

export const headingDefinition: LoreframeTemplateDefinition = {
  id: "heading",
  version: 1,
  name: "LOREFRAME.Template.Heading.Name",
  description: "LOREFRAME.Template.Heading.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-heading",
  renderer: HEADING_RENDERER,
  fields: [
    {
      id: "title",
      type: "text",
      label: "LOREFRAME.Field.Title",
      defaultKey: "LOREFRAME.Template.Heading.Name",
    },
    {
      id: "subtitle",
      type: "text",
      label: "LOREFRAME.Field.Subtitle",
      defaultKey: "LOREFRAME.Field.SubtitlePlaceholder",
    },
  ],
  focusField: "title",
  tags: ["title", "section", "header"],
  aliases: ["heading block"],
};
