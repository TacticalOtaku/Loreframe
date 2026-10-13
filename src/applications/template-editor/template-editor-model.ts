import { resolveValues } from "../../core/preset-registry";
import { configurableFields, type UserTemplateValues } from "../../core/user-templates";
import type { LoreframePresetDefinition, LoreframeTemplateDefinition } from "../../types";
import {
  buildInspectorModel,
  readInspectorForm,
  readPresetForm,
  type InspectorSection,
} from "../block-inspector/inspector-model";

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

export interface TemplateEditorInput {
  definition: LoreframeTemplateDefinition;
  name: string;
  description: string;
  preset: string | null;
  values: UserTemplateValues;
  presets: readonly LoreframePresetDefinition[];
}

export interface TemplateEditorModel {
  name: string;
  description: string;
  /** Localization key of the base template name. */
  baseName: string;
  sections: InspectorSection[];
}

/** View data for "My Template" settings (spec §32): the inspector's section/option/style groups, no content. */
export function buildTemplateEditorModel(input: TemplateEditorInput): TemplateEditorModel {
  const inspector = buildInspectorModel(input.definition, input.values, {
    preset: input.preset,
    presets: input.presets,
  });
  const configurable = new Set(configurableFields(input.definition).map((field) => field.id));
  const sections = inspector.sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => field.id === "_preset" || configurable.has(field.id)),
    }))
    .filter((section) => section.fields.length);
  return { name: input.name, description: input.description, baseName: input.definition.name, sections };
}

export interface TemplateEditorResult {
  name: string;
  description: string;
  preset: string | null;
  values: UserTemplateValues;
}

export function readTemplateEditorForm(
  definition: LoreframeTemplateDefinition,
  form: Readonly<Record<string, unknown>>,
  presets: readonly LoreframePresetDefinition[],
): TemplateEditorResult {
  const text = (key: string) => (typeof form[key] === "string" ? (form[key] as string).trim() : "");
  const read = readInspectorForm(definition, form);
  const values: UserTemplateValues = {};
  for (const field of configurableFields(definition)) {
    const value = read[field.id];
    if (typeof value === "string" || typeof value === "boolean") values[field.id] = value;
  }
  return {
    name: text("name"),
    description: text("description"),
    preset: readPresetForm(form, presets),
    values,
  };
}
