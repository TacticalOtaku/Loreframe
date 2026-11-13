import { PLACEHOLDER_IMAGE } from "../../content-templates/shared";
import type {
  FieldType,
  GalleryItem,
  InspectorGroup,
  LinkItem,
  LoreframePresetDefinition,
  LoreframeTemplateDefinition,
  TemplateValue,
  TemplateValues,
} from "../../types";

export interface InspectorOption {
  value: string;
  /** Localization key. */
  label: string;
}

export interface InspectorField {
  id: string;
  type: Exclude<FieldType, "richText" | "items" | "links">;
  /** Localization key. */
  label: string;
  value: string | boolean;
  options?: InspectorOption[];
}

/** Form key of the preset select; field ids cannot start with "_", so it never collides with a field. */
export const PRESET_FORM_KEY = "_preset";

export interface InspectorStyle {
  preset: string | null;
  /** Presets the template supports, in display order. */
  presets: readonly LoreframePresetDefinition[];
  /** Include only configurable fields (select, boolean) and preset, omitting content/image/list fields. */
  configurableOnly?: boolean;
}

export interface InspectorSection {
  id: InspectorGroup | "options";
  /** Localization key. */
  label: string;
  fields: InspectorField[];
}

interface ListPosition {
  index: number;
  first: boolean;
  last: boolean;
}

export interface InspectorItem extends GalleryItem, ListPosition {
  /** What to show as thumbnail (placeholder when the item has no image yet). */
  preview: string;
}

export interface InspectorLink extends LinkItem, ListPosition {
  /** Whether the entry points at a document. */
  linked: boolean;
}

/** An editable list: gallery images or Foundry document links. */
export interface InspectorList {
  fieldId: string;
  /** Localization key. */
  label: string;
  kind: "images" | "links";
  images: InspectorItem[];
  links: InspectorLink[];
}

export interface InspectorModel {
  sections: InspectorSection[];
  lists: InspectorList[];
  /** The template also has content that is edited directly in the Journal. */
  richTextHint: boolean;
  empty: boolean;
}

const SECTION_ORDER: { id: InspectorSection["id"]; label: string }[] = [
  { id: "general", label: "LOREFRAME.Inspector.General" },
  { id: "sections", label: "LOREFRAME.Inspector.Sections" },
  { id: "options", label: "LOREFRAME.Inspector.Options" },
  { id: "style", label: "LOREFRAME.Inspector.Style" },
];

/** View data for the block inspector (spec §24). Rich text stays in the Journal editor. */
export function buildInspectorModel(
  definition: LoreframeTemplateDefinition,
  values: TemplateValues,
  style: InspectorStyle = { preset: null, presets: [] },
): InspectorModel {
  const groups = new Map<InspectorSection["id"], InspectorField[]>(SECTION_ORDER.map((s) => [s.id, []]));
  const push = (id: InspectorSection["id"], field: InspectorField) => groups.get(id)?.push(field);
  const lists: InspectorList[] = [];

  // The preset leads the Style section when there is a real choice.
  if (style.presets.length > 1) {
    push("style", {
      id: PRESET_FORM_KEY,
      type: "select",
      label: "LOREFRAME.Inspector.Preset",
      value: style.preset ?? style.presets[0]?.id ?? "",
      options: style.presets.map((preset) => ({ value: preset.id, label: preset.name })),
    });
  }

  for (const field of definition.fields ?? []) {
    if (style.configurableOnly && field.type !== "select" && field.type !== "boolean") continue;
    const value = values[field.id];
    switch (field.type) {
      case "text":
      case "image":
        push(field.inspectorGroup ?? "general", {
          id: field.id,
          type: field.type,
          label: field.label,
          value: typeof value === "string" ? value : "",
        });
        break;
      case "select":
        push(field.inspectorGroup ?? "options", {
          id: field.id,
          type: "select",
          label: field.label,
          value: typeof value === "string" ? value : String(field.default ?? ""),
          options: (field.options ?? []).map((option) => ({
            value: option,
            label: `LOREFRAME.Option.${field.id}.${option}`,
          })),
        });
        break;
      case "boolean":
        push(field.inspectorGroup ?? "options", {
          id: field.id,
          type: "boolean",
          label: field.label,
          value: value === true,
        });
        break;
      case "items": {
        const list = Array.isArray(value) ? (value as readonly GalleryItem[]) : [];
        lists.push({
          fieldId: field.id,
          label: field.label,
          kind: "images",
          images: list.map((item, index) => ({
            ...item,
            ...position(index, list.length),
            preview: item.src || PLACEHOLDER_IMAGE,
          })),
          links: [],
        });
        break;
      }
      case "links": {
        const list = Array.isArray(value) ? (value as readonly LinkItem[]) : [];
        lists.push({
          fieldId: field.id,
          label: field.label,
          kind: "links",
          images: [],
          links: list.map((item, index) => ({
            ...item,
            ...position(index, list.length),
            linked: item.uuid !== "",
          })),
        });
        break;
      }
      case "richText":
        break;
    }
  }

  const sections = SECTION_ORDER.flatMap(({ id, label }): InspectorSection[] => {
    const fields = groups.get(id) ?? [];
    return fields.length ? [{ id, label, fields }] : [];
  });
  return {
    sections,
    lists,
    richTextHint: style.configurableOnly
      ? false
      : (definition.fields ?? []).some((f) => f.type === "richText") || Boolean(definition.slots?.length),
    empty: !sections.length && !lists.length,
  };
}

function position(index: number, length: number): ListPosition {
  return { index, first: index === 0, last: index === length - 1 };
}

/** Values from the inspector form (flat `name → value`, as FormDataExtended produces). */
export function readInspectorForm(
  definition: LoreframeTemplateDefinition,
  form: Readonly<Record<string, unknown>>,
  options: { configurableOnly?: boolean } = {},
): TemplateValues {
  const values: TemplateValues = {};
  const str = (key: string) => {
    const value = form[key];
    return typeof value === "string" ? value.trim() : "";
  };
  for (const field of definition.fields ?? []) {
    if (options.configurableOnly && field.type !== "select" && field.type !== "boolean") continue;
    switch (field.type) {
      case "text":
      case "image":
        if (field.id in form) values[field.id] = str(field.id);
        break;
      case "select":
        if (field.options?.includes(str(field.id))) values[field.id] = str(field.id);
        break;
      case "boolean":
        values[field.id] = form[field.id] === true || form[field.id] === "on";
        break;
      case "items": {
        const list: GalleryItem[] = [];
        for (let index = 0; `${field.id}.${index}.src` in form; index++) {
          const prefix = `${field.id}.${index}`;
          list.push({
            src: str(`${prefix}.src`),
            alt: str(`${prefix}.alt`),
            caption: str(`${prefix}.caption`),
          });
        }
        values[field.id] = list;
        break;
      }
      case "links": {
        const list: LinkItem[] = [];
        for (let index = 0; `${field.id}.${index}.uuid` in form; index++) {
          const prefix = `${field.id}.${index}`;
          const item = {
            uuid: str(`${prefix}.uuid`),
            label: str(`${prefix}.label`),
            note: str(`${prefix}.note`),
          };
          if (item.uuid || item.label || item.note) list.push(item);
        }
        values[field.id] = list;
        break;
      }
      case "richText":
        break;
    }
  }
  return values;
}

/** The preset chosen in the form, or null when the form offers none or an unsupported one. */
export function readPresetForm(
  form: Readonly<Record<string, unknown>>,
  presets: readonly LoreframePresetDefinition[],
): string | null {
  const value = form[PRESET_FORM_KEY];
  return typeof value === "string" && presets.some((preset) => preset.id === value) ? value : null;
}

function sameValue(a: TemplateValue | undefined, b: TemplateValue): boolean {
  // Lists hold plain JSON objects with a fixed key order (built by readInspectorForm / readBlockValues).
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** The subset of `edited` that differs from `original`. */
export function changedValues(original: TemplateValues, edited: TemplateValues): TemplateValues {
  const changed: TemplateValues = {};
  for (const [key, value] of Object.entries(edited)) {
    if (!sameValue(original[key], value)) changed[key] = value;
  }
  return changed;
}

export function moveItem<T>(items: readonly T[], index: number, delta: number): readonly T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}

export function removeItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

/** Append images; the alt text starts as a readable version of the file name, for the author to refine. */
export function addItems(items: readonly GalleryItem[], sources: readonly string[]): GalleryItem[] {
  return [...items, ...sources.map((src) => ({ src, alt: altFromPath(src), caption: "" }))];
}

/**
 * Append document links (dropped from the sidebar or an empty row to fill in). A document already in the list is
 * not added twice.
 */
export function addLinks(
  items: readonly LinkItem[],
  documents: readonly Pick<LinkItem, "uuid" | "label">[],
): LinkItem[] {
  const next = [...items];
  for (const { uuid, label } of documents) {
    if (uuid && next.some((item) => item.uuid === uuid)) continue;
    next.push({ uuid, label, note: "" });
  }
  return next;
}

function altFromPath(path: string): string {
  return safeDecode(path.split("/").at(-1) ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Not valid percent-encoding: the raw file name is still a usable starting point.
    return value;
  }
}
