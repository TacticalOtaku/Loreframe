import type { LoreframeTemplateDefinition, LoreframeTemplateField } from "../types";
import type { PresetRegistry } from "./preset-registry";
import type { TemplateRegistry } from "./template-registry";

/**
 * "My Templates" (spec §32, §33): declarative variants of a registered template — a preset plus section and option
 * choices. They are insertion recipes only: inserted blocks carry the base template id, so they stay editable and
 * portable even when the user template is renamed or deleted. Nothing here is ever executed or rendered as HTML.
 */
export const USER_TEMPLATE_SCHEMA = 1;
export const USER_TEMPLATE_LIMIT = 100;
export const EXPORT_FORMAT = "loreframe-templates";
/** Package size limit in UTF-16 code units (`string.length`). */
export const MAX_IMPORT_LENGTH = 256_000;
const ID_PATTERN = /^user-[a-z0-9][a-z0-9-]{0,47}$/;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 200;

export type UserTemplateValues = Record<string, string | boolean>;

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

export interface UserTemplateDeps {
  templates: Pick<TemplateRegistry, "get">;
  presets: Pick<PresetRegistry, "has">;
}

/** Fields a user template may configure: sections and options, never content. */
export function configurableFields(definition: LoreframeTemplateDefinition): LoreframeTemplateField[] {
  return (definition.fields ?? []).filter((field) => field.type === "select" || field.type === "boolean");
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Control characters are stripped; the text is only ever shown through escaping templates.
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length <= max ? text : null;
}

/** A validated copy of `raw`, or null. Unknown or invalid configuration keys are dropped. */
export function sanitizeUserTemplate(raw: unknown, deps: UserTemplateDeps): UserTemplate | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (data.schemaVersion !== USER_TEMPLATE_SCHEMA) return null;
  if (typeof data.id !== "string" || !ID_PATTERN.test(data.id)) return null;
  const name = plainText(data.name, NAME_MAX);
  if (!name) return null;
  const description = data.description === undefined ? "" : plainText(data.description, DESCRIPTION_MAX);
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
  const raws = data.values as Record<string, unknown>;
  const values: UserTemplateValues = {};
  for (const field of configurableFields(base)) {
    const value = raws[field.id];
    if (field.type === "boolean" && typeof value === "boolean") values[field.id] = value;
    if (field.type === "select" && typeof value === "string" && field.options?.includes(value)) {
      values[field.id] = value;
    }
  }
  return {
    schemaVersion: USER_TEMPLATE_SCHEMA,
    id: data.id,
    name,
    description,
    base: base.id,
    preset,
    values,
  };
}

export interface UserTemplateStoreDeps extends UserTemplateDeps {
  /** Stored list (Foundry: a user-scoped setting). */
  read(): unknown;
  /** Entries that are not valid now are written back unchanged (see `UserTemplateStore`). */
  write(templates: unknown[]): Promise<unknown>;
  newId(): string;
}

export interface UserTemplateInput {
  base: string;
  name: string;
  description?: string;
  preset: string | null;
  values: UserTemplateValues;
}

/**
 * Reads hide stored templates that are not usable now, but writes keep them: their base template or preset may only be
 * missing for a while (a module disabled, an older Loreframe), and the author never asked to delete them.
 */
export class UserTemplateStore {
  readonly #deps: UserTemplateStoreDeps;

  constructor(deps: UserTemplateStoreDeps) {
    this.#deps = deps;
  }

  /** Valid templates whose base is registered, in stored order. */
  list(): UserTemplate[] {
    return this.#stored().flatMap((raw) => sanitizeUserTemplate(raw, this.#deps) ?? []);
  }

  get(id: string): UserTemplate | undefined {
    return this.list().find((template) => template.id === id);
  }

  async create(input: UserTemplateInput): Promise<UserTemplate> {
    const stored = this.#stored();
    if (stored.length >= USER_TEMPLATE_LIMIT)
      throw new Error(`User template limit (${USER_TEMPLATE_LIMIT}) reached`);
    const template = this.#validate({ ...input, id: this.#newId() });
    await this.#deps.write([...stored, template]);
    return template;
  }

  async update(id: string, patch: Partial<Omit<UserTemplateInput, "base">>): Promise<UserTemplate> {
    const current = this.get(id);
    if (!current) throw new Error(`User template "${id}" not found`);
    const next = this.#validate({ ...current, ...patch, id });
    await this.#deps.write(this.#stored().map((raw) => (storedId(raw) === id ? next : raw)));
    return next;
  }

  async duplicate(id: string, name: string): Promise<UserTemplate> {
    const source = this.get(id);
    if (!source) throw new Error(`User template "${id}" not found`);
    return this.create({ ...source, name });
  }

  async remove(id: string): Promise<boolean> {
    if (!this.get(id)) return false;
    const next = this.#stored().filter((raw) => storedId(raw) !== id);
    await this.#deps.write(next);
    return true;
  }

  /** A JSON package of the given templates (all by default). */
  exportJson(ids?: readonly string[]): string {
    const templates = this.list().filter((template) => !ids || ids.includes(template.id));
    return JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: USER_TEMPLATE_SCHEMA, templates }, null, 2);
  }

  /** Add the valid templates of a package under new ids. Rejects malformed or oversized packages outright. */
  async import(text: string): Promise<{ added: number; skipped: number }> {
    if (text.length > MAX_IMPORT_LENGTH) throw new Error("Template package is too large");
    const data: unknown = JSON.parse(text);
    const pkg = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    if (pkg.format !== EXPORT_FORMAT) throw new Error("Not a Loreframe template package");
    if (pkg.schemaVersion !== USER_TEMPLATE_SCHEMA) throw new Error("Unsupported template package version");
    if (!Array.isArray(pkg.templates)) throw new Error("Template package has no template list");

    const list = this.#stored();
    let skipped = 0;
    for (const raw of pkg.templates) {
      const template = sanitizeUserTemplate(raw, this.#deps);
      if (!template || list.length >= USER_TEMPLATE_LIMIT) {
        skipped++;
        continue;
      }
      list.push({ ...template, id: this.#newId() });
    }
    const added = pkg.templates.length - skipped;
    if (added) await this.#deps.write(list);
    return { added, skipped };
  }

  #stored(): unknown[] {
    const stored = this.#deps.read();
    return Array.isArray(stored) ? [...stored] : [];
  }

  #newId(): string {
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
}

function storedId(raw: unknown): unknown {
  return typeof raw === "object" && raw !== null ? (raw as { id?: unknown }).id : undefined;
}
