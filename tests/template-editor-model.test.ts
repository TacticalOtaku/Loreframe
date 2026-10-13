import { describe, expect, it } from "vitest";
import {
  buildTemplateEditorModel,
  initialTemplateValues,
  readTemplateEditorForm,
} from "../src/applications/template-editor/template-editor-model";
import { testCore } from "./helpers/core";

const core = testCore();
const dossier = core.templates.get("npc-dossier")!;
const presets = core.presets.listFor(dossier);

describe("initialTemplateValues", () => {
  it("starts from the template defaults for configurable fields only, then applies overrides", () => {
    const values = initialTemplateValues(dossier, { "show-rumours": false, name: "Bob", portrait: "nope" });
    expect(values).toMatchObject({
      "show-rumours": false,
      "show-fears": true,
      portrait: "left",
      density: "comfortable",
    });
    expect(values).not.toHaveProperty("name");
    expect(Object.keys(values)).toHaveLength(13);
  });
});

describe("buildTemplateEditorModel", () => {
  it("shows the name, the base and only section, option and style settings", () => {
    const model = buildTemplateEditorModel({
      definition: dossier,
      name: "Merchant",
      description: "Shopkeepers",
      preset: "minimal",
      values: initialTemplateValues(dossier, {}),
      presets,
    });
    expect(model).toMatchObject({ name: "Merchant", description: "Shopkeepers", baseName: dossier.name });
    expect(model.sections.map((s) => s.id)).toEqual(["sections", "style"]);
    const style = model.sections[1]!;
    expect(style.fields.map((f) => [f.id, f.value])).toEqual([
      ["_preset", "minimal"],
      ["portrait", "left"],
      ["density", "comfortable"],
    ]);
  });
});

describe("readTemplateEditorForm", () => {
  it("reads name, description, preset and configurable values", () => {
    const form: Record<string, unknown> = {
      name: "  Merchant ",
      description: "",
      _preset: "arcane",
      portrait: "right",
      density: "compact",
      title: "ignored",
    };
    for (const field of dossier.fields!)
      if (field.type === "boolean") form[field.id] = field.id !== "show-rumours";
    const result = readTemplateEditorForm(dossier, form, presets);
    expect(result).toMatchObject({ name: "Merchant", description: "", preset: "arcane" });
    expect(result.values).toMatchObject({ "show-rumours": false, "show-fears": true, portrait: "right" });
    expect(result.values).not.toHaveProperty("title");
    expect(readTemplateEditorForm(dossier, { ...form, _preset: "bad" }, presets).preset).toBeNull();
  });
});
