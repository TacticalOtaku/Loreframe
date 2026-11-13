import { formatLink } from "../../core/links";
import type {
  LinkItem,
  LoreframeTemplateDefinition,
  LoreframeTemplateField,
  RenderContext,
  TemplateRendererFn,
  TemplateValues,
  TreeElement,
} from "../../types";
import { DATA_ATTR } from "../../constants";
import { cell, imageField, labelHeading, paragraphs, selectOption, text } from "../shared";

export const WIKI_RENDERER = "wiki-article";
export const INFOBOX_PLACEMENTS = ["right", "left", "full", "hidden"];
const INFO_ROWS = ["type", "region", "alignment", "population"];
const WIKI_PRESETS = ["editorial", "minimal", "arcane"];

type Localize = RenderContext["localize"];

const pascal = (id: string) => id.replace(/(^|-)([a-z])/g, (_m, _dash, char: string) => char.toUpperCase());
const labelKey = (id: string) => `LOREFRAME.Wiki.${pascal(id)}.Label`;
const placeholderKey = (id: string) => `LOREFRAME.Wiki.${pascal(id)}.Placeholder`;
const shown = (values: TemplateValues, id: string) => values[`show-${id}`] !== false;
const label = (id: string, localize: Localize) =>
  labelHeading("loreframe-wiki__label", localize(labelKey(id)));

function header(values: TemplateValues): TreeElement {
  const subtitle = text(values, "subtitle");
  return {
    tag: "header",
    classes: ["loreframe-wiki__header"],
    children: [
      {
        tag: "h2",
        classes: ["loreframe-wiki__title", "loreframe-preset__name"],
        field: "title",
        children: [text(values, "title")],
      },
      ...(subtitle
        ? [{ tag: "p", classes: ["loreframe-wiki__subtitle"], field: "subtitle", children: [subtitle] }]
        : []),
    ],
  };
}

/**
 * Infobox (spec §19): fixed rows are properties shown when filled in; custom rows are a table the author edits with
 * Foundry's table tools. It is always rendered — "hidden" is a placement that CSS hides from readers.
 */
function infobox(values: TemplateValues, localize: Localize): TreeElement {
  const rows = INFO_ROWS.flatMap((id): TreeElement[] => {
    const value = text(values, id);
    if (!value) return [];
    return [
      {
        tag: "div",
        classes: ["loreframe-wiki__row"],
        children: [
          { tag: "p", classes: ["loreframe-wiki__key"], children: [localize(labelKey(id))] },
          { tag: "p", classes: ["loreframe-wiki__value"], field: id, children: [value] },
        ],
      },
    ];
  });
  const hidden = selectOption(values, "infobox", INFOBOX_PLACEMENTS) === "hidden";
  return {
    tag: "aside",
    classes: ["loreframe-wiki__infobox"],
    // Shown by CSS in the editor only, so the author knows why readers do not see this box.
    ...(hidden ? { attrs: { "data-loreframe-hint": localize("LOREFRAME.Wiki.Infobox.HiddenHint") } } : {}),
    children: [
      label("infobox", localize),
      ...(rows.length ? [{ tag: "div", classes: ["loreframe-wiki__rows"], children: rows }] : []),
      {
        tag: "table",
        classes: ["loreframe-wiki__facts"],
        field: "facts",
        children: [
          {
            tag: "tbody",
            children: [
              {
                tag: "tr",
                children: [
                  cell("th", localize("LOREFRAME.Wiki.Facts.KeyPlaceholder")),
                  cell("td", localize("LOREFRAME.Wiki.Facts.ValuePlaceholder")),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function contents(localize: Localize): TreeElement {
  // Filled from the article's headings when the page is displayed (src/view/article-contents.ts). The editor hint
  // is an attribute shown by CSS, so a page read without Loreframe carries no misleading text.
  return {
    tag: "nav",
    classes: ["loreframe-wiki__contents"],
    attrs: { [DATA_ATTR.contents]: "", "data-loreframe-hint": localize(placeholderKey("contents")) },
    children: [label("contents", localize)],
  };
}

function article(localize: Localize): TreeElement {
  const section = (n: number): TreeElement[] => [
    { tag: "h3", children: [localize(`LOREFRAME.Wiki.Article.Heading${n}`)] },
    ...paragraphs(localize(`LOREFRAME.Wiki.Article.Text${n}`)),
  ];
  return {
    tag: "div",
    classes: ["loreframe-wiki__article"],
    slot: "article",
    children: [...section(1), ...section(2)],
  };
}

function related(values: TemplateValues, localize: Localize): TreeElement[] {
  const value = values.related;
  const items: readonly LinkItem[] = Array.isArray(value)
    ? (value as readonly LinkItem[])
    : [{ uuid: "", label: localize(placeholderKey("related")), note: "" }];
  if (!items.length) return [];
  return [
    {
      tag: "div",
      classes: ["loreframe-wiki__related"],
      children: [
        label("related", localize),
        {
          tag: "ul",
          classes: ["loreframe-links", "loreframe-links--inline"],
          field: "related",
          children: items.map((item) => ({
            tag: "li",
            classes: ["loreframe-links__item"],
            children: [
              { tag: "p", classes: ["loreframe-links__link"], children: [formatLink(item)] },
              ...(item.note ? [{ tag: "p", classes: ["loreframe-links__note"], children: [item.note] }] : []),
            ],
          })),
        },
      ],
    },
  ];
}

/** Wiki article (spec §19): long-form content framed by an infobox, contents and related entries. */
export const wikiRenderer: TemplateRendererFn = ({ values, localize }) => ({
  tag: "article",
  classes: [
    "loreframe-wiki",
    `loreframe-wiki--infobox-${selectOption(values, "infobox", INFOBOX_PLACEMENTS)}`,
  ],
  children: [
    header(values),
    imageField("loreframe-wiki__hero", text(values, "image"), text(values, "alt")),
    {
      tag: "div",
      classes: ["loreframe-wiki__body"],
      children: [
        infobox(values, localize),
        ...(shown(values, "intro")
          ? [
              {
                tag: "div",
                classes: ["loreframe-wiki__intro"],
                field: "intro",
                children: paragraphs(text(values, "intro")),
              },
            ]
          : []),
        ...(shown(values, "contents") ? [contents(localize)] : []),
        article(localize),
      ],
    },
    ...related(values, localize),
  ],
});

/* -------------------------------------------- */
/*  Definition                                  */
/* -------------------------------------------- */

const textField = (id: string): LoreframeTemplateField => ({
  id,
  type: "text",
  label: labelKey(id),
  defaultKey: placeholderKey(id),
  inspectorGroup: "general",
});

export const wikiDefinition: LoreframeTemplateDefinition = {
  id: "wiki-article",
  version: 1,
  name: "LOREFRAME.Template.WikiArticle.Name",
  description: "LOREFRAME.Template.WikiArticle.Description",
  category: "wiki",
  type: "page",
  icon: "fa-solid fa-book-open",
  renderer: WIKI_RENDERER,
  fields: [
    textField("title"),
    textField("subtitle"),
    { id: "image", type: "image", label: "LOREFRAME.Field.Image", default: "", inspectorGroup: "general" },
    {
      id: "alt",
      type: "text",
      label: "LOREFRAME.Field.ImageAlt",
      defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
      imageAltFor: "image",
      inspectorGroup: "general",
    },
    ...INFO_ROWS.map(textField),
    { id: "related", type: "links", label: labelKey("related") },
    { id: "intro", type: "richText", label: labelKey("intro"), defaultKey: placeholderKey("intro") },
    // Custom infobox rows; the renderer supplies the sample row.
    { id: "facts", type: "richText", label: labelKey("facts") },
    {
      id: "show-intro",
      type: "boolean",
      label: labelKey("intro"),
      default: true,
      inspectorGroup: "sections",
    },
    {
      id: "show-contents",
      type: "boolean",
      label: labelKey("contents"),
      default: true,
      inspectorGroup: "sections",
    },
    {
      id: "infobox",
      type: "select",
      label: labelKey("infobox"),
      options: INFOBOX_PLACEMENTS,
      default: "right",
      inspectorGroup: "style",
    },
  ],
  slots: ["article"],
  focusField: "title",
  presets: WIKI_PRESETS,
  tags: ["article", "encyclopedia", "infobox", "long read", "lore", "contents"],
  aliases: ["вики", "статья", "энциклопедия"],
};
