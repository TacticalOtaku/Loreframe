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
import {
  imageField,
  labelHeading,
  paragraphs,
  PLACEHOLDER_IMAGE,
  secretRegion,
  selectOption,
  text,
} from "../shared";

export const LOCATION_RENDERER = "location";
export const INFO_SIDES = ["right", "left", "full"];
const INFO_ROWS = ["type", "population", "government", "climate", "danger"];
const LINK_LISTS = ["poi", "npcs", "factions"];
const LOCATION_PRESETS = ["editorial", "minimal", "arcane"];

type Localize = RenderContext["localize"];

const pascal = (id: string) => id.replace(/(^|-)([a-z])/g, (_m, _dash, char: string) => char.toUpperCase());
const labelKey = (id: string) => `LOREFRAME.Location.${pascal(id)}.Label`;
const placeholderKey = (id: string) => `LOREFRAME.Location.${pascal(id)}.Placeholder`;
const shown = (values: TemplateValues, id: string) => values[`show-${id}`] !== false;

const label = (id: string, localize: Localize) =>
  labelHeading("loreframe-location__label", localize(labelKey(id)));

function section(id: string, children: TreeElement[]): TreeElement {
  return {
    tag: "div",
    classes: ["loreframe-location__section", `loreframe-location__section--${id}`],
    children,
  };
}

function richSection(values: TemplateValues, id: string, localize: Localize): TreeElement {
  return section(id, [
    label(id, localize),
    { tag: "div", classes: ["loreframe-location__text"], field: id, children: paragraphs(text(values, id)) },
  ]);
}

/** A list value; new blocks (no value yet) get one localized sample entry to overwrite. */
function links(values: TemplateValues, id: string, localize: Localize): readonly LinkItem[] {
  const value = values[id];
  if (Array.isArray(value)) return value as readonly LinkItem[];
  return [
    {
      uuid: "",
      label: localize(placeholderKey(id)),
      note: localize(`LOREFRAME.Location.${pascal(id)}.Note`),
    },
  ];
}

/** Foundry-linked entries (spec §21): link text Foundry enriches on display, plus an optional note. */
function linkSection(values: TemplateValues, id: string, localize: Localize): TreeElement[] {
  const items = links(values, id, localize);
  if (!items.length) return [];
  return [
    section(id, [
      label(id, localize),
      {
        tag: "ul",
        classes: ["loreframe-links"],
        field: id,
        children: items.map((item) => ({
          tag: "li",
          classes: ["loreframe-links__item"],
          children: [
            { tag: "p", classes: ["loreframe-links__link"], children: [formatLink(item)] },
            ...(item.note ? [{ tag: "p", classes: ["loreframe-links__note"], children: [item.note] }] : []),
          ],
        })),
      },
    ]),
  ];
}

function lists(values: TemplateValues, localize: Localize): TreeElement[] {
  const sections = LINK_LISTS.flatMap((id) => linkSection(values, id, localize));
  return sections.length ? [{ tag: "div", classes: ["loreframe-location__lists"], children: sections }] : [];
}

function withClass(element: TreeElement, className: string): TreeElement {
  return { ...element, classes: [...(element.classes ?? []), className] };
}

function hero(values: TemplateValues): TreeElement {
  const meta = ["kind", "region"].flatMap((id): TreeElement[] => {
    const value = text(values, id);
    return value ? [{ tag: "p", classes: [`loreframe-location__${id}`], field: id, children: [value] }] : [];
  });
  return {
    tag: "header",
    classes: ["loreframe-location__hero"],
    children: [
      imageField("loreframe-location__banner", text(values, "image"), text(values, "alt")),
      {
        tag: "div",
        classes: ["loreframe-location__heading"],
        children: [
          {
            tag: "h2",
            classes: ["loreframe-location__name", "loreframe-preset__name"],
            field: "name",
            children: [text(values, "name")],
          },
          ...(meta.length ? [{ tag: "div", classes: ["loreframe-location__meta"], children: meta }] : []),
        ],
      },
    ],
  };
}

function overview(values: TemplateValues, localize: Localize): TreeElement {
  const rows = INFO_ROWS.flatMap((id): TreeElement[] => {
    const value = text(values, id);
    if (!value) return [];
    return [
      {
        tag: "div",
        classes: ["loreframe-location__row"],
        children: [
          { tag: "p", classes: ["loreframe-location__key"], children: [localize(labelKey(id))] },
          { tag: "p", classes: ["loreframe-location__value"], field: id, children: [value] },
        ],
      },
    ];
  });
  const info: TreeElement[] = rows.length
    ? [
        {
          tag: "aside",
          classes: ["loreframe-location__info"],
          children: [labelHeading("loreframe-location__label", localize(labelKey("info"))), ...rows],
        },
      ]
    : [];
  return {
    tag: "div",
    classes: ["loreframe-location__overview"],
    children: [...info, withClass(richSection(values, "description", localize), "loreframe-location__main")],
  };
}

function map(values: TemplateValues, localize: Localize): TreeElement {
  // A rich region: the author replaces the image with Foundry's own image tool and may add more below it.
  return section("map", [
    label("map", localize),
    {
      tag: "div",
      classes: ["loreframe-location__map"],
      field: "map",
      children: [
        { tag: "img", attrs: { src: PLACEHOLDER_IMAGE, alt: localize(labelKey("map")) } },
        ...paragraphs(text(values, "map")),
      ],
    },
  ]);
}

/** Location page (spec §21): composes hero, info, Foundry links, map, secrets and an embedded Gallery. */
export const locationRenderer: TemplateRendererFn = ({ values, localize, embed }) => ({
  tag: "article",
  classes: [
    "loreframe-location",
    `loreframe-location--info-${selectOption(values, "info-side", INFO_SIDES)}`,
  ],
  children: [
    hero(values),
    ...(shown(values, "summary")
      ? [
          {
            tag: "div",
            classes: ["loreframe-location__summary"],
            field: "summary",
            children: paragraphs(text(values, "summary")),
          },
        ]
      : []),
    overview(values, localize),
    ...(shown(values, "map") ? [map(values, localize)] : []),
    ...lists(values, localize),
    ...(shown(values, "rumours") ? [richSection(values, "rumours", localize)] : []),
    ...(shown(values, "secrets")
      ? [
          secretRegion(
            ["loreframe-location__section", "loreframe-location__section--secrets"],
            "secrets",
            label("secrets", localize),
            text(values, "secrets"),
          ),
        ]
      : []),
    ...(shown(values, "gallery")
      ? [
          section("gallery", [
            label("gallery", localize),
            {
              tag: "div",
              classes: ["loreframe-location__gallery"],
              slot: "gallery",
              children: [embed("gallery", { key: "gallery" })],
            },
          ]),
        ]
      : []),
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

const richField = (id: string): LoreframeTemplateField => ({
  id,
  type: "richText",
  label: labelKey(id),
  defaultKey: placeholderKey(id),
});

const toggle = (id: string): LoreframeTemplateField => ({
  id: `show-${id}`,
  type: "boolean",
  label: labelKey(id),
  default: true,
  inspectorGroup: "sections",
});

export const locationDefinition: LoreframeTemplateDefinition = {
  id: "location",
  version: 1,
  name: "LOREFRAME.Template.Location.Name",
  description: "LOREFRAME.Template.Location.Description",
  category: "locations",
  type: "page",
  icon: "fa-solid fa-map-location-dot",
  renderer: LOCATION_RENDERER,
  fields: [
    textField("name"),
    textField("kind"),
    textField("region"),
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
    ...LINK_LISTS.map((id): LoreframeTemplateField => ({ id, type: "links", label: labelKey(id) })),
    richField("summary"),
    richField("description"),
    richField("map"),
    richField("rumours"),
    richField("secrets"),
    ...["summary", "map", "rumours", "secrets", "gallery"].map(toggle),
    {
      id: "info-side",
      type: "select",
      label: "LOREFRAME.Field.InfoSide",
      options: INFO_SIDES,
      default: "right",
      inspectorGroup: "style",
    },
  ],
  slots: ["gallery"],
  focusField: "name",
  presets: LOCATION_PRESETS,
  tags: ["place", "settlement", "region", "points of interest", "map", "wiki"],
  aliases: ["локация", "место", "город"],
};
