import type {
  LoreframeTemplateDefinition,
  LoreframeTemplateField,
  TemplateRendererFn,
  TemplateValues,
  TreeElement,
} from "../../types";
import { BUILT_IN_PRESET_IDS } from "../presets";
import { imageField, labelHeading, paragraphs, secretRegion, text } from "../shared";

export const NPC_RENDERER = "npc";
export const PORTRAIT_POSITIONS = ["left", "right", "top"];
export const DENSITIES = ["comfortable", "compact"];

type NpcVariant = "card" | "dossier";

/** Dossier sections (spec §20) in reading order, grouped into rows that share width on wide pages. */
const DOSSIER_GROUPS: { id: string; sections: string[] }[] = [
  { id: "presence", sections: ["appearance", "personality", "voice"] },
  { id: "drive", sections: ["motivation", "goals", "fears"] },
  { id: "ties", sections: ["relationships"] },
  { id: "lore", sections: ["knowledge", "rumours"] },
];
const CARD_FACTS = ["personality", "goal", "location"];

const pascal = (id: string) => id.replace(/(^|-)([a-z])/g, (_m, _dash, char: string) => char.toUpperCase());
const labelKey = (id: string) => `LOREFRAME.Npc.${pascal(id)}.Label`;
const placeholderKey = (id: string) => `LOREFRAME.Npc.${pascal(id)}.Placeholder`;
const toggleId = (id: string) => `show-${id}`;

function option(values: TemplateValues, id: string, allowed: string[]): string {
  const value = values[id];
  return typeof value === "string" && allowed.includes(value) ? value : (allowed[0] ?? "");
}

/** Optional sections are on unless explicitly switched off. */
const shown = (values: TemplateValues, id: string) => values[toggleId(id)] !== false;

/** A short text line, omitted when empty so the layout does not keep blank rows. */
function line(values: TemplateValues, id: string): TreeElement[] {
  const value = text(values, id);
  return value ? [{ tag: "p", classes: [`loreframe-npc__${id}`], field: id, children: [value] }] : [];
}

function richRegion(values: TemplateValues, id: string, className: string): TreeElement {
  return { tag: "div", classes: [className], field: id, children: paragraphs(text(values, id)) };
}

function labelledSection(values: TemplateValues, id: string, localize: (key: string) => string): TreeElement {
  return {
    tag: "div",
    classes: ["loreframe-npc__section", `loreframe-npc__section--${id}`],
    children: [
      labelHeading("loreframe-npc__label", localize(labelKey(id))),
      richRegion(values, id, "loreframe-npc__text"),
    ],
  };
}

/** Name (a TOC heading: pages often list several NPCs), role, "Ancestry · Occupation" and the summary. */
function identity(variant: NpcVariant, values: TemplateValues): TreeElement {
  const meta = ["ancestry", "occupation"].flatMap((id) => line(values, id));
  return {
    tag: "div",
    classes: ["loreframe-npc__identity"],
    children: [
      {
        tag: variant === "dossier" ? "h2" : "h3",
        classes: ["loreframe-npc__name", "loreframe-preset__name"],
        field: "name",
        children: [text(values, "name")],
      },
      ...(variant === "dossier" ? line(values, "role") : []),
      ...(meta.length ? [{ tag: "div", classes: ["loreframe-npc__meta"], children: meta }] : []),
      ...(variant === "card" || shown(values, "summary")
        ? [richRegion(values, "summary", "loreframe-npc__summary")]
        : []),
    ],
  };
}

/** The portrait is always present: without an image it shows the placeholder, which CSS hides outside the editor. */
function header(variant: NpcVariant, values: TemplateValues): TreeElement {
  return {
    tag: "header",
    classes: ["loreframe-npc__header"],
    children: [
      imageField("loreframe-npc__portrait", text(values, "image"), text(values, "alt")),
      identity(variant, values),
    ],
  };
}

function cardBody(values: TemplateValues, localize: (key: string) => string): TreeElement[] {
  // Facts are text properties shown only when filled in; clearing one removes it.
  const facts = CARD_FACTS.flatMap((id): TreeElement[] => {
    const value = text(values, id);
    if (!value) return [];
    return [
      {
        tag: "div",
        classes: ["loreframe-npc__fact", `loreframe-npc__fact--${id}`],
        children: [
          labelHeading("loreframe-npc__label", localize(labelKey(id))),
          { tag: "p", classes: ["loreframe-npc__fact-value"], field: id, children: [value] },
        ],
      },
    ];
  });
  return [
    ...(facts.length ? [{ tag: "div", classes: ["loreframe-npc__facts"], children: facts }] : []),
    ...(shown(values, "notes") ? [labelledSection(values, "notes", localize)] : []),
  ];
}

function dossierBody(values: TemplateValues, localize: (key: string) => string): TreeElement[] {
  const groups = DOSSIER_GROUPS.flatMap(({ id, sections }): TreeElement[] => {
    const children = sections.filter((section) => shown(values, section));
    if (!children.length) return [];
    return [
      {
        tag: "div",
        classes: ["loreframe-npc__group", `loreframe-npc__group--${id}`],
        children: children.map((section) => labelledSection(values, section, localize)),
      },
    ];
  });
  // GM Secrets: a nested Foundry secret, so players never receive it (spec §22).
  const secrets = shown(values, "secrets")
    ? [
        secretRegion(
          ["loreframe-npc__section", "loreframe-npc__section--secrets"],
          "secrets",
          labelHeading("loreframe-npc__label", localize(labelKey("secrets"))),
          text(values, "secrets"),
        ),
      ]
    : [];
  return [...groups, ...secrets];
}

/** NPC card and dossier (spec §20). The structure is fixed; presets only restyle it (spec §8). */
export const npcRenderer: TemplateRendererFn = ({ definition, values, localize }) => {
  const variant = definition.rendererOptions?.variant;
  if (variant !== "card" && variant !== "dossier") {
    throw new Error(`NPC template "${definition.id}" has invalid variant "${String(variant)}"`);
  }
  return {
    tag: "article",
    classes: [
      "loreframe-npc",
      `loreframe-npc--${variant}`,
      `loreframe-npc--portrait-${option(values, "portrait", PORTRAIT_POSITIONS)}`,
      `loreframe-npc--density-${option(values, "density", DENSITIES)}`,
    ],
    children: [
      header(variant, values),
      ...(variant === "card" ? cardBody(values, localize) : dossierBody(values, localize)),
    ],
  };
};

/* -------------------------------------------- */
/*  Definitions                                 */
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
  id: toggleId(id),
  type: "boolean",
  label: labelKey(id),
  default: true,
  inspectorGroup: "sections",
});

const PORTRAIT_FIELDS: LoreframeTemplateField[] = [
  { id: "image", type: "image", label: "LOREFRAME.Field.Image", default: "", inspectorGroup: "general" },
  {
    id: "alt",
    type: "text",
    label: labelKey("portrait-alt"),
    defaultKey: placeholderKey("portrait-alt"),
    imageAltFor: "image",
    inspectorGroup: "general",
  },
];

const STYLE_FIELDS: LoreframeTemplateField[] = [
  {
    id: "portrait",
    type: "select",
    label: "LOREFRAME.Field.PortraitPosition",
    options: PORTRAIT_POSITIONS,
    default: "left",
    inspectorGroup: "style",
  },
  {
    id: "density",
    type: "select",
    label: "LOREFRAME.Field.Density",
    options: DENSITIES,
    default: "comfortable",
    inspectorGroup: "style",
  },
];

const SECTION_IDS = DOSSIER_GROUPS.flatMap((group) => group.sections);

export const npcCardDefinition: LoreframeTemplateDefinition = {
  id: "npc-card",
  version: 1,
  name: "LOREFRAME.Template.NpcCard.Name",
  description: "LOREFRAME.Template.NpcCard.Description",
  category: "npc",
  type: "block",
  icon: "fa-solid fa-id-badge",
  renderer: NPC_RENDERER,
  rendererOptions: { variant: "card" },
  fields: [
    ...[textField("name"), textField("ancestry"), textField("occupation")],
    ...PORTRAIT_FIELDS,
    ...CARD_FACTS.map(textField),
    richField("summary"),
    richField("notes"),
    toggle("notes"),
    ...STYLE_FIELDS,
  ],
  focusField: "name",
  presets: BUILT_IN_PRESET_IDS,
  tags: ["character", "person", "compact", "portrait"],
  aliases: ["персонаж", "нпс"],
};

export const npcDossierDefinition: LoreframeTemplateDefinition = {
  id: "npc-dossier",
  version: 1,
  name: "LOREFRAME.Template.NpcDossier.Name",
  description: "LOREFRAME.Template.NpcDossier.Description",
  category: "npc",
  type: "page",
  icon: "fa-solid fa-user-secret",
  renderer: NPC_RENDERER,
  rendererOptions: { variant: "dossier" },
  fields: [
    ...[textField("name"), textField("role"), textField("ancestry"), textField("occupation")],
    ...PORTRAIT_FIELDS,
    richField("summary"),
    ...SECTION_IDS.map(richField),
    richField("secrets"),
    ...["summary", ...SECTION_IDS, "secrets"].map(toggle),
    ...STYLE_FIELDS,
  ],
  focusField: "name",
  presets: BUILT_IN_PRESET_IDS,
  tags: ["character", "person", "profile", "gm secrets", "relationships", "rumours"],
  aliases: ["персонаж", "досье", "нпс"],
};
