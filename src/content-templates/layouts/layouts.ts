import type { LoreframeTemplateDefinition, TemplateRendererFn, TreeElement } from "../../types";
import { imageField, labelHeading, paragraphs, slotRegion, text } from "../shared";

export const COLUMNS_RENDERER = "columns";
export const HERO_CONTENT_RENDERER = "hero-content";
export const CARD_GRID_RENDERER = "card-grid";

type RegionSize = "narrow" | "normal" | "third" | "wide" | "sidebar" | "main";

interface Region {
  slot: string;
  size: RegionSize;
  placeholder: string;
}

const COLUMN = "LOREFRAME.Layout.ColumnPlaceholder";
const SIDEBAR = "LOREFRAME.Layout.SidebarPlaceholder";
const MAIN = "LOREFRAME.Layout.ContentPlaceholder";

/** Region patterns. Sizes map to flex bases, so regions wrap onto new lines when the Journal is narrow. */
const PATTERNS: Record<string, Region[]> = {
  halves: [
    { slot: "column-1", size: "normal", placeholder: COLUMN },
    { slot: "column-2", size: "normal", placeholder: COLUMN },
  ],
  "narrow-wide": [
    { slot: "column-1", size: "narrow", placeholder: COLUMN },
    { slot: "column-2", size: "wide", placeholder: COLUMN },
  ],
  "wide-narrow": [
    { slot: "column-1", size: "wide", placeholder: COLUMN },
    { slot: "column-2", size: "narrow", placeholder: COLUMN },
  ],
  thirds: [
    { slot: "column-1", size: "third", placeholder: COLUMN },
    { slot: "column-2", size: "third", placeholder: COLUMN },
    { slot: "column-3", size: "third", placeholder: COLUMN },
  ],
  "sidebar-left": [
    { slot: "sidebar", size: "sidebar", placeholder: SIDEBAR },
    { slot: "main", size: "main", placeholder: MAIN },
  ],
  "sidebar-right": [
    { slot: "main", size: "main", placeholder: MAIN },
    { slot: "sidebar", size: "sidebar", placeholder: SIDEBAR },
  ],
};

function patternOf(definition: LoreframeTemplateDefinition): { name: string; regions: Region[] } {
  const name = definition.rendererOptions?.pattern;
  const regions = typeof name === "string" ? PATTERNS[name] : undefined;
  if (!regions) throw new Error(`Layout "${definition.id}" has unknown pattern "${String(name)}"`);
  return { name: name as string, regions };
}

export const columnsRenderer: TemplateRendererFn = ({ definition, localize }) => {
  const { name, regions } = patternOf(definition);
  return {
    tag: "div",
    classes: ["loreframe-columns", `loreframe-columns--${name}`],
    children: regions.map(({ slot, size, placeholder }) =>
      slotRegion(
        ["loreframe-columns__region", `loreframe-columns__region--${size}`],
        slot,
        localize(placeholder),
      ),
    ),
  };
};

function columnsDefinition(
  id: string,
  key: string,
  pattern: keyof typeof PATTERNS,
  icon: string,
  tags: string[],
): LoreframeTemplateDefinition {
  const slots = (PATTERNS[pattern] ?? []).map((region) => region.slot);
  return {
    id,
    version: 1,
    name: `LOREFRAME.Template.${key}.Name`,
    description: `LOREFRAME.Template.${key}.Description`,
    category: "layouts",
    type: "layout",
    icon,
    renderer: COLUMNS_RENDERER,
    rendererOptions: { pattern },
    slots,
    focusField: slots[0],
    tags: ["columns", "layout", ...tags],
  };
}

export const columnDefinitions: LoreframeTemplateDefinition[] = [
  columnsDefinition("two-columns", "TwoColumns", "halves", "fa-solid fa-table-columns", ["50/50", "split"]),
  columnsDefinition("columns-narrow-wide", "NarrowWide", "narrow-wide", "fa-solid fa-table-columns", [
    "33/66",
  ]),
  columnsDefinition("columns-wide-narrow", "WideNarrow", "wide-narrow", "fa-solid fa-table-columns", [
    "66/33",
  ]),
  columnsDefinition("three-columns", "ThreeColumns", "thirds", "fa-solid fa-table-columns", ["thirds"]),
  columnsDefinition("sidebar-left", "SidebarLeft", "sidebar-left", "fa-solid fa-sidebar", ["aside"]),
  columnsDefinition("sidebar-right", "SidebarRight", "sidebar-right", "fa-solid fa-sidebar-flip", ["aside"]),
];

/** A hero banner (image, title, subtitle) above a content slot. */
export const heroContentRenderer: TemplateRendererFn = ({ values, localize }) => ({
  tag: "section",
  classes: ["loreframe-hero"],
  children: [
    {
      tag: "header",
      classes: ["loreframe-hero__banner"],
      children: [
        imageField("loreframe-hero__image", text(values, "image"), text(values, "alt")),
        { tag: "h2", classes: ["loreframe-hero__title"], field: "title", children: [text(values, "title")] },
        {
          tag: "p",
          classes: ["loreframe-hero__subtitle"],
          field: "subtitle",
          children: [text(values, "subtitle")],
        },
      ],
    },
    slotRegion(["loreframe-hero__content"], "content", localize(MAIN)),
  ],
});

export const heroContentDefinition: LoreframeTemplateDefinition = {
  id: "hero-content",
  version: 1,
  name: "LOREFRAME.Template.HeroContent.Name",
  description: "LOREFRAME.Template.HeroContent.Description",
  category: "layouts",
  type: "layout",
  icon: "fa-solid fa-rectangle-history",
  renderer: HERO_CONTENT_RENDERER,
  fields: [
    { id: "image", type: "image", label: "LOREFRAME.Field.Image", default: "" },
    {
      id: "alt",
      type: "text",
      label: "LOREFRAME.Field.ImageAlt",
      defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
      imageAltFor: "image",
    },
    {
      id: "title",
      type: "text",
      label: "LOREFRAME.Field.Title",
      defaultKey: "LOREFRAME.Template.HeroContent.Name",
    },
    {
      id: "subtitle",
      type: "text",
      label: "LOREFRAME.Field.Subtitle",
      defaultKey: "LOREFRAME.Field.SubtitlePlaceholder",
    },
  ],
  slots: ["content"],
  focusField: "title",
  tags: ["banner", "page", "layout", "cover"],
};

const CARD_COUNT = 3;

/** Cards in a responsive grid; each card is a slot. */
export const cardGridRenderer: TemplateRendererFn = ({ localize }) => ({
  tag: "div",
  classes: ["loreframe-card-grid"],
  children: Array.from({ length: CARD_COUNT }, (_, index): TreeElement => ({
    tag: "div",
    classes: ["loreframe-card-grid__card"],
    slot: `card-${index + 1}`,
    children: [
      labelHeading("loreframe-card-grid__title", localize("LOREFRAME.Layout.CardTitle")),
      ...paragraphs(localize("LOREFRAME.Layout.CardPlaceholder")),
    ],
  })),
});

export const cardGridDefinition: LoreframeTemplateDefinition = {
  id: "card-grid",
  version: 1,
  name: "LOREFRAME.Template.CardGrid.Name",
  description: "LOREFRAME.Template.CardGrid.Description",
  category: "layouts",
  type: "layout",
  icon: "fa-solid fa-grid-2",
  renderer: CARD_GRID_RENDERER,
  slots: Array.from({ length: CARD_COUNT }, (_, index) => `card-${index + 1}`),
  focusField: "card-1",
  tags: ["cards", "grid", "overview", "layout"],
};
