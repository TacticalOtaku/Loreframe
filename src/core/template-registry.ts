import type { LoreframeTemplateCategory, LoreframeTemplateDefinition, LoreframeTemplateType } from "../types";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** Lowercase only: field ids become attribute names (data-loreframe-opt-*), which HTML lowercases. */
const FIELD_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const CATEGORIES = new Set<LoreframeTemplateCategory>([
  "blocks",
  "layouts",
  "npc",
  "locations",
  "wiki",
  "gallery",
  "campaign",
  "system",
]);
const TYPES = new Set<LoreframeTemplateType>(["block", "layout", "page"]);
const FIELD_TYPES = new Set(["text", "richText", "image", "select", "boolean", "items", "links"]);
const INSPECTOR_GROUPS = new Set(["general", "sections", "style"]);

export interface TemplateRegistryDeps {
  hasRenderer(id: string): boolean;
  hasPreset(id: string): boolean;
}

export interface TemplateListFilter {
  category?: LoreframeTemplateCategory;
  type?: LoreframeTemplateType;
  /** The active game system; system-specific templates for other systems are excluded. */
  systemId?: string;
}

/** Central store of structure template definitions (spec §9). */
export class TemplateRegistry {
  readonly #templates = new Map<string, LoreframeTemplateDefinition>();
  readonly #deps: TemplateRegistryDeps;

  constructor(deps: TemplateRegistryDeps) {
    this.#deps = deps;
  }

  register(definition: LoreframeTemplateDefinition): void {
    this.#validate(definition);
    if (this.#templates.has(definition.id)) {
      throw new Error(`Template "${definition.id}" is already registered`);
    }
    this.#templates.set(definition.id, deepFreeze(structuredClone(definition)));
  }

  unregister(id: string): boolean {
    return this.#templates.delete(id);
  }

  has(id: string): boolean {
    return this.#templates.has(id);
  }

  get(id: string): LoreframeTemplateDefinition | undefined {
    return this.#templates.get(id);
  }

  list(filter: TemplateListFilter = {}): LoreframeTemplateDefinition[] {
    return [...this.#templates.values()].filter(
      (d) =>
        (filter.category === undefined || d.category === filter.category) &&
        (filter.type === undefined || d.type === filter.type) &&
        (filter.systemId === undefined || d.system == null || d.system === filter.systemId),
    );
  }

  #validate(d: LoreframeTemplateDefinition): void {
    const fail = (message: string): never => {
      throw new Error(`Invalid template "${String(d.id)}": ${message}`);
    };
    if (typeof d.id !== "string" || !ID_PATTERN.test(d.id)) fail("id must be lowercase kebab-case");
    if (!Number.isInteger(d.version) || d.version < 1) fail("version must be a positive integer");
    if (typeof d.name !== "string" || !d.name) fail("name is required");
    if (!CATEGORIES.has(d.category)) fail(`unknown category "${d.category}"`);
    if (!TYPES.has(d.type)) fail(`unknown type "${d.type}"`);
    if (!this.#deps.hasRenderer(d.renderer)) fail(`unknown renderer "${d.renderer}"`);
    for (const preset of d.presets ?? []) {
      if (!this.#deps.hasPreset(preset)) fail(`unknown preset "${preset}"`);
    }
    const fieldIds = new Set<string>();
    for (const field of d.fields ?? []) {
      if (!FIELD_ID_PATTERN.test(field.id) || fieldIds.has(field.id))
        fail(`invalid or duplicate field "${field.id}"`);
      fieldIds.add(field.id);
      if (!FIELD_TYPES.has(field.type)) fail(`field "${field.id}" has unknown type "${field.type}"`);
      if (field.type === "select" && !field.options?.length) fail(`select field "${field.id}" needs options`);
      if (field.inspectorGroup !== undefined && !INSPECTOR_GROUPS.has(field.inspectorGroup)) {
        fail(`field "${field.id}" has unknown inspectorGroup "${field.inspectorGroup}"`);
      }
    }
    for (const field of d.fields ?? []) {
      if (field.imageAltFor === undefined) continue;
      const target = d.fields?.find((f) => f.id === field.imageAltFor);
      if (field.type !== "text" || target?.type !== "image") {
        fail(`field "${field.id}" has imageAltFor "${field.imageAltFor}" that is not an image field`);
      }
    }
    const slotIds = new Set<string>();
    for (const slot of d.slots ?? []) {
      if (!FIELD_ID_PATTERN.test(slot) || slotIds.has(slot) || fieldIds.has(slot)) {
        fail(`invalid, duplicate or field-named slot "${slot}"`);
      }
      slotIds.add(slot);
    }
    if (d.focusField !== undefined && !fieldIds.has(d.focusField) && !slotIds.has(d.focusField)) {
      fail(`focusField "${d.focusField}" is neither a field nor a slot`);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
