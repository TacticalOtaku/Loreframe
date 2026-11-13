/** Shared Loreframe domain types (spec §8–10). */

export type LoreframeTemplateCategory =
  "blocks" | "layouts" | "npc" | "locations" | "wiki" | "gallery" | "campaign" | "system";

export type LoreframeTemplateType = "block" | "layout" | "page";

export type FieldType = "text" | "richText" | "image" | "select" | "boolean" | "items" | "links";

/** One image of an `items` field (Gallery). */
export interface GalleryItem {
  src: string;
  alt: string;
  caption: string;
}

/** One entry of a `links` field: a Foundry document link with a short note. */
export interface LinkItem {
  /** Document uuid; empty for an unlinked entry. */
  uuid: string;
  label: string;
  note: string;
}

export type TemplateValue = string | boolean | readonly GalleryItem[] | readonly LinkItem[];
export type TemplateValues = Record<string, TemplateValue>;

export interface LoreframeTemplateField {
  id: string;
  type: FieldType;
  /** Localization key of the field label. */
  label: string;
  /** Localization key used as the default value (text fields). */
  defaultKey?: string;
  default?: TemplateValue;
  /** Text field stored as the `alt` attribute of the named image field instead of as visible text. */
  imageAltFor?: string;
  /** Allowed values for `select` fields. */
  options?: string[];
  /** Inspector section; defaults to "general" for text/image fields and "options" for select/boolean fields. */
  inspectorGroup?: InspectorGroup;
}

export type InspectorGroup = "general" | "sections" | "style";

/** A structure template: what information exists and how it is organised (spec §8–9). Pure data. */
export interface LoreframeTemplateDefinition {
  id: string;
  version: number;
  /** Localization key. */
  name: string;
  /** Localization key. */
  description?: string;
  category: LoreframeTemplateCategory;
  type: LoreframeTemplateType;
  icon?: string;
  thumbnail?: string;
  /** Id of a built-in renderer. */
  renderer: string;
  /** Static, data-only options passed to the renderer. */
  rendererOptions?: Readonly<Record<string, string | number | boolean>>;
  fields?: readonly LoreframeTemplateField[];
  /** Slot regions (`data-loreframe-slot`) where users may nest other blocks. */
  slots?: readonly string[];
  /** Field or slot whose first text is selected right after insertion, so typing replaces its placeholder. */
  focusField?: string;
  /** GM-only: rendered inside a Foundry secret block, hidden from non-owners (spec §22). */
  secret?: boolean;
  /** Ids of presets this template supports, in display order. */
  presets?: readonly string[];
  /** Game system id this template needs, or null/undefined for system-agnostic templates. */
  system?: string | null;
  tags?: readonly string[];
  aliases?: readonly string[];
}

/** A visual preset: how a structure looks (spec §8). */
export interface LoreframePresetDefinition {
  id: string;
  /** Localization key. */
  name: string;
  /** Default values the preset applies before explicit values. */
  values?: Readonly<TemplateValues>;
}

/** A node of the element tree renderers produce. Strings are text nodes. */
export type TreeChild = TreeElement | string;

export interface TreeElement {
  tag: string;
  classes?: string[];
  /** Becomes `data-loreframe-field`. */
  field?: string;
  /** Becomes `data-loreframe-slot`: a region where other blocks may be nested. */
  slot?: string;
  /** A bare Foundry secret (`<section class="secret">`), hidden from players by enrichHTML. */
  secret?: boolean;
  attrs?: Record<string, string>;
  children?: TreeChild[];
}

export interface EmbedOptions {
  /** Distinguishes embedded blocks of one parent; the nested instance id is `<parent id>-<key>`. */
  key: string;
  values?: Readonly<Record<string, unknown>>;
  preset?: string | null;
}

export interface RenderContext {
  definition: LoreframeTemplateDefinition;
  values: TemplateValues;
  preset: string | null;
  localize(key: string): string;
  /** Render another registered template as a complete nested block (composition, spec §51 M7). */
  embed(templateId: string, options: EmbedOptions): TreeElement;
}

export type TemplateRendererFn = (context: RenderContext) => TreeElement;

export type BlockStatus = "current" | "outdated" | "newer" | "unknown" | "invalid";
