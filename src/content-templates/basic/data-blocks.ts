import type { LoreframeTemplateDefinition, TemplateRendererFn, TreeElement } from "../../types";
import { cell, labelHeading, text } from "../shared";

export const KEY_VALUE_RENDERER = "key-value";
export const TAGS_RENDERER = "tags";
export const STATS_RENDERER = "stats-row";

const PLACEHOLDER_ROWS = 3;
const PLACEHOLDER_TAGS = 3;
const PLACEHOLDER_STATS = 4;

/**
 * Key/value facts as a two-column table: Foundry's table tools (add/remove rows) edit it without HTML.
 */
export const keyValueRenderer: TemplateRendererFn = ({ values, localize }) => {
  const rows: TreeElement[] = Array.from({ length: PLACEHOLDER_ROWS }, () => ({
    tag: "tr",
    children: [
      cell("th", localize("LOREFRAME.Template.KeyValue.KeyPlaceholder")),
      cell("td", localize("LOREFRAME.Template.KeyValue.ValuePlaceholder")),
    ],
  }));
  return {
    tag: "div",
    classes: ["loreframe-facts"],
    children: [
      labelHeading("loreframe-facts__title", text(values, "title"), "title"),
      {
        tag: "table",
        classes: ["loreframe-facts__table"],
        field: "rows",
        children: [{ tag: "tbody", children: rows }],
      },
    ],
  };
};

export const keyValueDefinition: LoreframeTemplateDefinition = {
  id: "key-value",
  version: 1,
  name: "LOREFRAME.Template.KeyValue.Name",
  description: "LOREFRAME.Template.KeyValue.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-list-dropdown",
  renderer: KEY_VALUE_RENDERER,
  fields: [
    {
      id: "title",
      type: "text",
      label: "LOREFRAME.Field.Title",
      defaultKey: "LOREFRAME.Template.KeyValue.Title",
    },
    // Structural regions edited directly in the Journal; their placeholder rows come from the renderer.
    { id: "rows", type: "richText", label: "LOREFRAME.Field.Rows" },
  ],
  focusField: "title",
  tags: ["facts", "properties", "details", "infobox"],
};

/** A list of short labels. Pressing Enter in a tag creates the next one (list items). */
export const tagsRenderer: TemplateRendererFn = ({ localize }) => ({
  tag: "div",
  classes: ["loreframe-tags"],
  children: [
    {
      tag: "ul",
      classes: ["loreframe-tags__list"],
      field: "tags",
      children: Array.from({ length: PLACEHOLDER_TAGS }, () => ({
        tag: "li",
        children: [{ tag: "p", children: [localize("LOREFRAME.Template.Tags.Placeholder")] }],
      })),
    },
  ],
});

export const tagsDefinition: LoreframeTemplateDefinition = {
  id: "tags",
  version: 1,
  name: "LOREFRAME.Template.Tags.Name",
  description: "LOREFRAME.Template.Tags.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-tags",
  renderer: TAGS_RENDERER,
  fields: [{ id: "tags", type: "richText", label: "LOREFRAME.Field.Tags" }],
  focusField: "tags",
  tags: ["keywords", "labels", "traits"],
};

/** A row of labelled numbers as a one-row table with a header row. */
export const statsRenderer: TemplateRendererFn = ({ localize }) => {
  const label = localize("LOREFRAME.Template.StatsRow.LabelPlaceholder");
  const value = localize("LOREFRAME.Template.StatsRow.ValuePlaceholder");
  const row = (tag: "th" | "td", content: string): TreeElement => ({
    tag: "tr",
    children: Array.from({ length: PLACEHOLDER_STATS }, () => cell(tag, content)),
  });
  return {
    tag: "div",
    classes: ["loreframe-stats"],
    children: [
      {
        tag: "table",
        classes: ["loreframe-stats__table"],
        field: "stats",
        children: [
          { tag: "thead", children: [row("th", label)] },
          { tag: "tbody", children: [row("td", value)] },
        ],
      },
    ],
  };
};

export const statsRowDefinition: LoreframeTemplateDefinition = {
  id: "stats-row",
  version: 1,
  name: "LOREFRAME.Template.StatsRow.Name",
  description: "LOREFRAME.Template.StatsRow.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-chart-simple",
  renderer: STATS_RENDERER,
  fields: [{ id: "stats", type: "richText", label: "LOREFRAME.Field.Stats" }],
  focusField: "stats",
  tags: ["numbers", "attributes", "scores"],
};
