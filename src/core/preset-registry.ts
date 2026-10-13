import { isLinkItem } from "./links";
import type {
  GalleryItem,
  LoreframePresetDefinition,
  LoreframeTemplateDefinition,
  LoreframeTemplateField,
  TemplateValue,
  TemplateValues,
} from "../types";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Visual presets (spec §8). A structure can render with any preset it lists. */
export class PresetRegistry {
  readonly #presets = new Map<string, LoreframePresetDefinition>();

  register(preset: LoreframePresetDefinition): void {
    if (typeof preset.id !== "string" || !ID_PATTERN.test(preset.id)) {
      throw new Error(`Invalid preset id "${String(preset.id)}"`);
    }
    if (typeof preset.name !== "string" || !preset.name)
      throw new Error(`Preset "${preset.id}" needs a name`);
    if (this.#presets.has(preset.id)) throw new Error(`Preset "${preset.id}" is already registered`);
    this.#presets.set(preset.id, Object.freeze({ ...preset, values: Object.freeze({ ...preset.values }) }));
  }

  has(id: string): boolean {
    return this.#presets.has(id);
  }

  get(id: string): LoreframePresetDefinition | undefined {
    return this.#presets.get(id);
  }

  /** Presets available to a template, in the template's declared order. */
  listFor(definition: LoreframeTemplateDefinition): LoreframePresetDefinition[] {
    return (definition.presets ?? []).flatMap((id) => this.#presets.get(id) ?? []);
  }
}

/**
 * Resolve the values a template renders with: field defaults < preset values < explicit values.
 * Only declared fields survive, and only with a value of the field's type.
 */
export function resolveValues(
  definition: LoreframeTemplateDefinition,
  preset: LoreframePresetDefinition | null,
  explicit: Readonly<Record<string, unknown>>,
  localize: (key: string) => string,
): TemplateValues {
  const values: TemplateValues = {};
  for (const field of definition.fields ?? []) {
    const candidates = [explicit[field.id], preset?.values?.[field.id], defaultValue(field, localize)];
    const value = candidates.find((candidate) => isValidValue(field, candidate));
    if (value === undefined) continue;
    // Lists are copied so callers cannot mutate defaults or preset values.
    values[field.id] = structuredClone(value as TemplateValue);
  }
  return values;
}

function defaultValue(
  field: LoreframeTemplateField,
  localize: (key: string) => string,
): TemplateValue | undefined {
  if (field.default !== undefined) return field.default;
  return field.defaultKey ? localize(field.defaultKey) : undefined;
}

function isValidValue(field: LoreframeTemplateField, value: unknown): boolean {
  switch (field.type) {
    case "items":
      return Array.isArray(value) && value.every(isGalleryItem);
    case "links":
      return Array.isArray(value) && value.every(isLinkItem);
    case "boolean":
      return typeof value === "boolean";
    case "select":
      return typeof value === "string" && (field.options ?? []).includes(value);
    default:
      return typeof value === "string";
  }
}

function isGalleryItem(value: unknown): value is GalleryItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.src === "string" && typeof item.alt === "string" && typeof item.caption === "string";
}
