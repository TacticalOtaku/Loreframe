import type { LoreframeTemplateDefinition, TemplateRendererFn } from "../../types";
import { imageField, paragraphs, text } from "../shared";

export const MEDIA_RENDERER = "media";
export const HERO_IMAGE_RENDERER = "hero-image";
const SIDES = ["left", "right"];

/**
 * Image beside content. `rendererOptions.region` chooses whether the content is a text field (Image + Text block)
 * or a slot that accepts other blocks (Media + Content layout).
 */
export const mediaRenderer: TemplateRendererFn = ({ definition, values, localize }) => {
  const side = typeof values.side === "string" && SIDES.includes(values.side) ? values.side : "left";
  const isSlot = definition.rendererOptions?.region === "slot";
  return {
    tag: "div",
    classes: ["loreframe-media", `loreframe-media--${side}`],
    children: [
      imageField("loreframe-media__image", text(values, "image"), text(values, "alt")),
      {
        tag: "div",
        classes: ["loreframe-media__content"],
        ...(isSlot ? { slot: "content" } : { field: "text" }),
        children: paragraphs(isSlot ? localize("LOREFRAME.Layout.ContentPlaceholder") : text(values, "text")),
      },
    ],
  };
};

const MEDIA_FIELDS: NonNullable<LoreframeTemplateDefinition["fields"]> = [
  { id: "image", type: "image", label: "LOREFRAME.Field.Image", default: "" },
  {
    id: "alt",
    type: "text",
    label: "LOREFRAME.Field.ImageAlt",
    defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
    imageAltFor: "image",
  },
  { id: "side", type: "select", label: "LOREFRAME.Field.ImageSide", options: SIDES, default: "left" },
];

export const imageTextDefinition: LoreframeTemplateDefinition = {
  id: "image-text",
  version: 1,
  name: "LOREFRAME.Template.ImageText.Name",
  description: "LOREFRAME.Template.ImageText.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-image-landscape",
  renderer: MEDIA_RENDERER,
  rendererOptions: { region: "field" },
  fields: [
    ...MEDIA_FIELDS,
    {
      id: "text",
      type: "richText",
      label: "LOREFRAME.Field.Text",
      defaultKey: "LOREFRAME.Field.BodyPlaceholder",
    },
  ],
  focusField: "text",
  tags: ["picture", "illustration", "portrait"],
};

export const mediaContentDefinition: LoreframeTemplateDefinition = {
  id: "media-content",
  version: 1,
  name: "LOREFRAME.Template.MediaContent.Name",
  description: "LOREFRAME.Template.MediaContent.Description",
  category: "layouts",
  type: "layout",
  icon: "fa-solid fa-table-columns",
  renderer: MEDIA_RENDERER,
  rendererOptions: { region: "slot" },
  fields: MEDIA_FIELDS,
  slots: ["content"],
  focusField: "content",
  tags: ["image", "columns", "layout"],
};

/** A full-width image with an optional caption. */
export const heroImageRenderer: TemplateRendererFn = ({ values }) => {
  const caption = text(values, "caption");
  return {
    tag: "div",
    classes: ["loreframe-hero-image"],
    children: [
      imageField("loreframe-hero-image__image", text(values, "image"), text(values, "alt")),
      ...(caption
        ? [{ tag: "p", classes: ["loreframe-hero-image__caption"], field: "caption", children: [caption] }]
        : []),
    ],
  };
};

export const heroImageDefinition: LoreframeTemplateDefinition = {
  id: "hero-image",
  version: 1,
  name: "LOREFRAME.Template.HeroImage.Name",
  description: "LOREFRAME.Template.HeroImage.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-panorama",
  renderer: HERO_IMAGE_RENDERER,
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
      id: "caption",
      type: "text",
      label: "LOREFRAME.Field.Caption",
      defaultKey: "LOREFRAME.Field.CaptionPlaceholder",
    },
  ],
  focusField: "caption",
  tags: ["banner", "cover", "splash"],
};
