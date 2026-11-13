import type {
  LoreframePresetDefinition,
  LoreframeTemplateDefinition,
  LoreframeTemplateField,
} from "../types";
import { logger } from "../utils/logger";
import { resolveValues, type PresetRegistry } from "./preset-registry";
import type { TemplateRegistry } from "./template-registry";
import type { TemplateRenderer } from "./template-renderer";

/**
 * "My Templates" (spec §32, §33), favorites, recent history (spec §16), and world availability in one catalog.
 * User templates are declarative insertion recipes over a registered template — never executable or raw HTML —
 * so deleted or renamed variants leave existing journal blocks completely intact.
 */
export const USER_TEMPLATE_SCHEMA = 1;
export const USER_TEMPLATE_LIMIT = 100;
export const RECENT_LIMIT = 15;
export const EXPORT_FORMAT = "loreframe-templates";
export const USER_TEMPLATE_NAME_MAX = 80;
export const USER_TEMPLATE_DESCRIPTION_MAX = 200;
/** Package size limit in UTF-16 code units (`string.length`). */
export const MAX_IMPORT_LENGTH = 256_000;
const ID_PATTERN = /^user-[a-z0-9][a-z0-9-]{0,47}$/;

export type UserTemplateValues = Record<string, string | boolean>;
export type PreferenceKey = "favorites" | "recent";

export interface UserTemplate {
  schemaVersion: typeof USER_TEMPLATE_SCHEMA;
  id: string;
  name: string;
  description: string;
  /** Id of a registered template. */
  base: string;
  preset: string | null;
  /** Section toggles and options (select/boolean fields of the base). */
  values: UserTemplateValues;
}

export interface UserTemplateInput {
  base: string;
  name: string;
  description?: string;
  preset: string | null;
  values: UserTemplateValues;
}

export interface UserTemplateDeps {
  templates: Pick<TemplateRegistry, "get">;
  presets: Pick<PresetRegistry, "has">;
}

export interface CatalogStorage {
  readUserTemplates(): unknown;
  /** Entries that are not valid now are written back unchanged so temporary module removal never deletes them. */
  writeUserTemplates(templates: unknown[]): Promise<unknown>;
  readPreference(key: PreferenceKey): unknown;
  writePreference(key: PreferenceKey, value: string[]): Promise<unknown>;
}

export interface TemplateCatalogDeps {
  templates: TemplateRegistry;
  presets: PresetRegistry;
  renderer: Pick<TemplateRenderer, "render">;
  storage: CatalogStorage;
  systemId(): string;
  localize(key: string): string;
  newId(): string;
  formatCopyName?(name: string): string;
}

export interface CatalogUserTemplate extends Omit<UserTemplate, "base"> {
  base: LoreframeTemplateDefinition;
}

export interface CatalogEntry {
  kind: "template" | "user";
  id: string;
  definition: LoreframeTemplateDefinition;
  userTemplate: UserTemplate | null;
  name: string;
  description: string;
  baseName: string;
  preset: string | null | undefined;
  values?: UserTemplateValues;
}

/** Create a user template from a template (optionally pre-configured), or edit an existing user template. */
export type TemplateEditorRequest =
  | {
      mode: "create";
      base: string;
      name?: string;
      preset?: string | null;
      values?: Readonly<Record<string, unknown>>;
    }
  | { mode: "edit"; id: string };

export interface TemplateEditorState {
  definition: LoreframeTemplateDefinition;
  /** The user template being edited, or null when creating one. */
  id: string | null;
  name: string;
  description: string;
  preset: string | null;
  values: UserTemplateValues;
  presets: LoreframePresetDefinition[];
}

export interface TemplateEditorSaveInput {
  name: string;
  description: string;
  preset: string | null;
  values: UserTemplateValues;
}

export type TemplateSaveOutcome =
  { ok: true; template: UserTemplate } | { ok: false; reason: "name-required" | "save-failed" };

/** Fields a user template may configure: sections and options, never content. */
export function configurableFields(definition: LoreframeTemplateDefinition): LoreframeTemplateField[] {
  return (definition.fields ?? []).filter((field) => field.type === "select" || field.type === "boolean");
}

/** Configurable values of a template (sections and options), from its defaults and the given overrides. */
export function initialTemplateValues(
  definition: LoreframeTemplateDefinition,
  overrides: Readonly<Record<string, unknown>>,
): UserTemplateValues {
  // Configurable fields use literal defaults, so no localization is involved.
  const resolved = resolveValues(definition, null, overrides, (key) => key);
  const values: UserTemplateValues = {};
  for (const field of configurableFields(definition)) {
    const value = resolved[field.id];
    if (typeof value === "string" || typeof value === "boolean") values[field.id] = value;
  }
  return values;
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Control characters are stripped; the text is only ever shown through escaping templates.
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length <= max ? text : null;
}

function pickConfigurableValues(
  definition: LoreframeTemplateDefinition,
  raws: Record<string, unknown>,
): UserTemplateValues {
  const values: UserTemplateValues = {};
  for (const field of configurableFields(definition)) {
    const value = raws[field.id];
    if (field.type === "boolean" && typeof value === "boolean") values[field.id] = value;
    if (field.type === "select" && typeof value === "string" && field.options?.includes(value)) {
      values[field.id] = value;
    }
  }
  return values;
}

/** A validated copy of `raw`, or null. Unknown or invalid configuration keys are dropped. */
export function sanitizeUserTemplate(raw: unknown, deps: UserTemplateDeps): UserTemplate | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (data.schemaVersion !== USER_TEMPLATE_SCHEMA) return null;
  if (typeof data.id !== "string" || !ID_PATTERN.test(data.id)) return null;
  const name = plainText(data.name, USER_TEMPLATE_NAME_MAX);
  if (!name) return null;
  const description =
    data.description === undefined ? "" : plainText(data.description, USER_TEMPLATE_DESCRIPTION_MAX);
  if (description === null) return null;
  const base = typeof data.base === "string" ? deps.templates.get(data.base) : undefined;
  if (!base) return null;
  const preset = data.preset ?? null;
  if (
    preset !== null &&
    (typeof preset !== "string" || !base.presets?.includes(preset) || !deps.presets.has(preset))
  ) {
    return null;
  }
  if (typeof data.values !== "object" || data.values === null || Array.isArray(data.values)) return null;
  return {
    schemaVersion: USER_TEMPLATE_SCHEMA,
    id: data.id,
    name,
    description,
    base: base.id,
    preset,
    values: pickConfigurableValues(base, data.values as Record<string, unknown>),
  };
}

export class TemplateCatalog {
  readonly #deps: TemplateCatalogDeps;
  readonly #listeners = new Set<() => void>();

  constructor(deps: TemplateCatalogDeps) {
    this.#deps = deps;
  }

  /* -------------------------------------------- */
  /*  Subscriptions & world availability          */
  /* -------------------------------------------- */

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  availableTemplates(): LoreframeTemplateDefinition[] {
    return this.#deps.templates.list({ systemId: this.#deps.systemId() });
  }

  availableUserTemplates(): CatalogUserTemplate[] {
    const available = new Map(this.availableTemplates().map((definition) => [definition.id, definition]));
    return this.listUserTemplates().flatMap((template) => {
      const base = available.get(template.base);
      return base ? [{ ...template, base }] : [];
    });
  }

  presetsFor(definition: LoreframeTemplateDefinition): LoreframePresetDefinition[] {
    return this.#deps.presets.listFor(definition);
  }

  resolveEntry(id: string): CatalogEntry | null {
    const userTemplate = this.getUserTemplate(id);
    if (userTemplate) {
      const definition = this.#deps.templates.get(userTemplate.base);
      if (!definition) return null;
      const baseName = this.#deps.localize(definition.name);
      return {
        kind: "user",
        id: userTemplate.id,
        definition,
        userTemplate,
        name: userTemplate.name,
        description: userTemplate.description,
        baseName,
        preset: userTemplate.preset,
        values: userTemplate.values,
      };
    }
    const definition = this.#deps.templates.get(id);
    if (!definition) return null;
    const name = this.#deps.localize(definition.name);
    return {
      kind: "template",
      id: definition.id,
      definition,
      userTemplate: null,
      name,
      description: definition.description ? this.#deps.localize(definition.description) : "",
      baseName: name,
      preset: undefined,
    };
  }

  /** Render preview markup for a template or user template, returning null (and logging) on failure. */
  renderPreview(id: string, preset?: string | null): string | null {
    try {
      const entry = this.resolveEntry(id);
      const templateId = entry?.definition.id ?? id;
      const effectivePreset =
        preset === undefined ? (entry?.userTemplate ? entry.userTemplate.preset : undefined) : preset;
      return this.#deps.renderer.render(templateId, {
        instanceId: "preview",
        ...(entry?.values ? { values: entry.values } : {}),
        ...(effectivePreset === undefined ? {} : { preset: effectivePreset }),
      });
    } catch (error) {
      logger.error(`Preview of template "${id}" failed`, error);
      return null;
    }
  }

  /* -------------------------------------------- */
  /*  User templates ("My Templates")             */
  /* -------------------------------------------- */

  /** Valid templates whose base is registered, in stored order. */
  listUserTemplates(): UserTemplate[] {
    return this.#storedUserTemplates().flatMap((raw) => sanitizeUserTemplate(raw, this.#deps) ?? []);
  }

  getUserTemplate(id: string): UserTemplate | undefined {
    return this.listUserTemplates().find((template) => template.id === id);
  }

  async createUserTemplate(input: UserTemplateInput): Promise<UserTemplate> {
    const stored = this.#storedUserTemplates();
    if (stored.length >= USER_TEMPLATE_LIMIT) {
      throw new Error(`User template limit (${USER_TEMPLATE_LIMIT}) reached`);
    }
    const template = this.#validate({ ...input, id: this.#newUserId() });
    await this.#deps.storage.writeUserTemplates([...stored, template]);
    this.#notify();
    return template;
  }

  async updateUserTemplate(
    id: string,
    patch: Partial<Omit<UserTemplateInput, "base">>,
  ): Promise<UserTemplate> {
    const current = this.getUserTemplate(id);
    if (!current) throw new Error(`User template "${id}" not found`);
    const next = this.#validate({ ...current, ...patch, id });
    await this.#deps.storage.writeUserTemplates(
      this.#storedUserTemplates().map((raw) => (storedId(raw) === id ? next : raw)),
    );
    this.#notify();
    return next;
  }

  async duplicateUserTemplate(id: string, name?: string): Promise<UserTemplate> {
    const source = this.getUserTemplate(id);
    if (!source) throw new Error(`User template "${id}" not found`);
    const rawName = name ?? this.#deps.formatCopyName?.(source.name) ?? `${source.name} (copy)`;
    const truncated = rawName.trim().slice(0, USER_TEMPLATE_NAME_MAX).trim();
    return this.createUserTemplate({ ...source, name: truncated });
  }

  /** Remove a user template and prune it from favorites and recent history before notifying listeners. */
  async removeUserTemplate(id: string): Promise<boolean> {
    if (!this.getUserTemplate(id)) return false;
    const next = this.#storedUserTemplates().filter((raw) => storedId(raw) !== id);
    await this.#deps.storage.writeUserTemplates(next);
    await this.#forgetPreference(id);
    this.#notify();
    return true;
  }

  exportUserTemplates(ids?: readonly string[]): string {
    const templates = this.listUserTemplates().filter((template) => !ids || ids.includes(template.id));
    return JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: USER_TEMPLATE_SCHEMA, templates }, null, 2);
  }

  /** Add the valid templates of a package under new ids. Rejects malformed or oversized packages outright. */
  async importUserTemplates(text: string): Promise<{ added: number; skipped: number }> {
    if (text.length > MAX_IMPORT_LENGTH) throw new Error("Template package is too large");
    const data: unknown = JSON.parse(text);
    const pkg = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    if (pkg.format !== EXPORT_FORMAT) throw new Error("Not a Loreframe template package");
    if (pkg.schemaVersion !== USER_TEMPLATE_SCHEMA) throw new Error("Unsupported template package version");
    if (!Array.isArray(pkg.templates)) throw new Error("Template package has no template list");

    const stored = this.#storedUserTemplates();
    let skipped = 0;
    for (const raw of pkg.templates) {
      const template = sanitizeUserTemplate(raw, this.#deps);
      if (!template || stored.length >= USER_TEMPLATE_LIMIT) {
        skipped++;
        continue;
      }
      stored.push({ ...template, id: this.#newUserId() });
    }
    const added = pkg.templates.length - skipped;
    if (added) {
      await this.#deps.storage.writeUserTemplates(stored);
      this.#notify();
    }
    return { added, skipped };
  }

  /* -------------------------------------------- */
  /*  Favorites & recent history                  */
  /* -------------------------------------------- */

  favorites(): string[] {
    return this.#readPreference("favorites");
  }

  isFavorite(templateId: string): boolean {
    return this.favorites().includes(templateId);
  }

  /** Add or remove a favorite; resolves to whether it is now a favorite. */
  async toggleFavorite(templateId: string): Promise<boolean> {
    const favorites = this.favorites();
    const isFavorite = favorites.includes(templateId);
    const next = isFavorite ? favorites.filter((id) => id !== templateId) : [...favorites, templateId];
    await this.#deps.storage.writePreference("favorites", next);
    this.#notify();
    return !isFavorite;
  }

  /** Most recently used first. */
  recent(): string[] {
    return this.#readPreference("recent");
  }

  async recordUse(templateId: string): Promise<void> {
    const recent = this.recent();
    if (recent[0] === templateId) return;
    const next = [templateId, ...recent.filter((id) => id !== templateId)].slice(0, RECENT_LIMIT);
    await this.#deps.storage.writePreference("recent", next);
    this.#notify();
  }

  /* -------------------------------------------- */
  /*  Template editor session & persistence       */
  /* -------------------------------------------- */

  prepareEditor(request: TemplateEditorRequest): TemplateEditorState | null {
    if (request.mode === "edit") {
      const template = this.getUserTemplate(request.id);
      const definition = template ? this.#deps.templates.get(template.base) : undefined;
      if (!template || !definition) return null;
      return {
        definition,
        id: template.id,
        name: template.name,
        description: template.description,
        preset: template.preset,
        values: { ...template.values },
        presets: this.presetsFor(definition),
      };
    }
    const definition = this.#deps.templates.get(request.base);
    if (!definition) return null;
    const presets = this.presetsFor(definition);
    const preset = request.preset && presets.some((p) => p.id === request.preset) ? request.preset : null;
    return {
      definition,
      id: null,
      name: request.name ?? this.#deps.localize(definition.name),
      description: "",
      preset: preset ?? presets[0]?.id ?? null,
      values: initialTemplateValues(definition, request.values ?? {}),
      presets,
    };
  }

  async saveEditor(state: TemplateEditorState, input: TemplateEditorSaveInput): Promise<TemplateSaveOutcome> {
    const name = input.name.trim();
    if (!name) return { ok: false, reason: "name-required" };
    const values = pickConfigurableValues(state.definition, input.values);
    const description = input.description.trim();
    const preset = input.preset && state.presets.some((p) => p.id === input.preset) ? input.preset : null;
    try {
      const template = state.id
        ? await this.updateUserTemplate(state.id, { name, description, preset, values })
        : await this.createUserTemplate({
            base: state.definition.id,
            name,
            description,
            preset,
            values,
          });
      return { ok: true, template };
    } catch (error) {
      logger.error("Could not save the user template", error);
      return { ok: false, reason: "save-failed" };
    }
  }

  /* -------------------------------------------- */
  /*  Internal helpers                            */
  /* -------------------------------------------- */

  #storedUserTemplates(): unknown[] {
    const stored = this.#deps.storage.readUserTemplates();
    return Array.isArray(stored) ? [...stored] : [];
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  #newUserId(): string {
    return `user-${this.#deps.newId().toLowerCase()}`;
  }

  #validate(input: UserTemplateInput & { id: string }): UserTemplate {
    const template = sanitizeUserTemplate(
      { ...input, schemaVersion: USER_TEMPLATE_SCHEMA, description: input.description ?? "" },
      this.#deps,
    );
    if (!template) throw new Error(`Invalid user template "${input.name}"`);
    return template;
  }

  #readPreference(key: PreferenceKey): string[] {
    const value = this.#deps.storage.readPreference(key);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  }

  async #forgetPreference(templateId: string): Promise<void> {
    for (const key of ["favorites", "recent"] as const) {
      const list = this.#readPreference(key);
      if (list.includes(templateId)) {
        await this.#deps.storage.writePreference(
          key,
          list.filter((id) => id !== templateId),
        );
      }
    }
  }
}

function storedId(raw: unknown): unknown {
  return typeof raw === "object" && raw !== null ? (raw as { id?: unknown }).id : undefined;
}
