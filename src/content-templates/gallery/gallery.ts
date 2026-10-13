import type { GalleryItem, LoreframeTemplateDefinition, TemplateRendererFn, TreeElement } from "../../types";
import { PLACEHOLDER_IMAGE } from "../shared";

export const GALLERY_RENDERER = "gallery";
export const GALLERY_MODES = ["uniform", "portrait", "landscape", "feature", "captioned"] as const;
const PLACEHOLDER_COUNT = 3;

function galleryItems(value: unknown): readonly GalleryItem[] | null {
  return Array.isArray(value) ? (value as readonly GalleryItem[]) : null;
}

/**
 * Gallery (spec §18): a grid of native <figure> elements (image + optional caption) in an `items` field.
 * Layout modes are CSS only, so switching modes never touches the images.
 */
export const galleryRenderer: TemplateRendererFn = ({ values, localize }) => {
  const mode =
    typeof values.mode === "string" && (GALLERY_MODES as readonly string[]).includes(values.mode)
      ? values.mode
      : "uniform";
  const placeholderAlt = localize("LOREFRAME.Template.Gallery.PlaceholderAlt");
  const items =
    galleryItems(values.items) ??
    Array.from({ length: PLACEHOLDER_COUNT }, () => ({ src: "", alt: placeholderAlt, caption: "" }));

  return {
    tag: "div",
    classes: ["loreframe-gallery", `loreframe-gallery--${mode}`],
    children: [
      {
        tag: "div",
        classes: ["loreframe-gallery__grid"],
        field: "items",
        children: items.map((item): TreeElement => ({
          tag: "figure",
          classes: ["loreframe-gallery__item"],
          children: [
            { tag: "img", attrs: { src: item.src || PLACEHOLDER_IMAGE, alt: item.alt } },
            // figcaption is `inline+` in Foundry's schema, so an empty caption is left out.
            ...(item.caption
              ? [{ tag: "figcaption", classes: ["loreframe-gallery__caption"], children: [item.caption] }]
              : []),
          ],
        })),
      },
    ],
  };
};

export const galleryDefinition: LoreframeTemplateDefinition = {
  id: "gallery",
  version: 1,
  name: "LOREFRAME.Template.Gallery.Name",
  description: "LOREFRAME.Template.Gallery.Description",
  category: "gallery",
  type: "block",
  icon: "fa-solid fa-images",
  renderer: GALLERY_RENDERER,
  fields: [
    { id: "items", type: "items", label: "LOREFRAME.Field.Images" },
    {
      id: "mode",
      type: "select",
      label: "LOREFRAME.Field.GalleryMode",
      options: [...GALLERY_MODES],
      default: "uniform",
    },
  ],
  tags: ["images", "pictures", "portraits", "photos"],
  aliases: ["image grid"],
};
