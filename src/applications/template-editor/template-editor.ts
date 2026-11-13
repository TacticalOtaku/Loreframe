import { MODULE_ID } from "../../constants";
import type {
  TemplateCatalog,
  TemplateEditorRequest,
  TemplateEditorState,
  UserTemplateValues,
} from "../../core/template-catalog";
import { buildInspectorModel, readInspectorForm, readPresetForm } from "../block-inspector/inspector-model";

const TEMPLATE_DIR = `modules/${MODULE_ID}/templates/applications`;
const SECTIONS_PARTIAL = `${TEMPLATE_DIR}/inspector-sections.hbs`;

export interface TemplateEditorDeps {
  catalog: Pick<TemplateCatalog, "prepareEditor" | "saveEditor">;
}

let editorClass: ReturnType<typeof defineTemplateEditor> | undefined;
const editing = new Map<string, InstanceType<ReturnType<typeof defineTemplateEditor>>>();

/** Open "My Template" settings (spec §32): name, preset, sections and options — never content. */
export function openTemplateEditor(deps: TemplateEditorDeps, request: TemplateEditorRequest): void {
  const state = deps.catalog.prepareEditor(request);
  if (!state) {
    ui.notifications.warn("LOREFRAME.UserTemplates.Missing", { localize: true });
    return;
  }
  const existing = state.id ? editing.get(state.id) : undefined;
  if (existing?.rendered) {
    existing.bringToFront();
    return;
  }
  editorClass ??= defineTemplateEditor();
  const app = new editorClass(deps, state);
  if (state.id) editing.set(state.id, app);
  void app.render({ force: true });
}

function defineTemplateEditor() {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  class TemplateEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    static override DEFAULT_OPTIONS: ApplicationV2Options = {
      classes: ["loreframe", "loreframe-inspector", "loreframe-template-editor"],
      tag: "form",
      window: { icon: "fa-solid fa-bookmark", resizable: true, contentClasses: ["standard-form"] },
      position: { width: 440, height: "auto" },
      form: { handler: submit, closeOnSubmit: false, submitOnChange: false },
    };

    static override PARTS: HandlebarsParts = {
      body: {
        template: `${TEMPLATE_DIR}/template-editor.hbs`,
        templates: [SECTIONS_PARTIAL],
        scrollable: [".loreframe-inspector__body"],
      },
      footer: { template: `${TEMPLATE_DIR}/block-inspector-footer.hbs` },
    };

    readonly #deps: TemplateEditorDeps;
    readonly #state: TemplateEditorState;

    constructor(deps: TemplateEditorDeps, state: TemplateEditorState) {
      super({
        id: `${MODULE_ID}-template-editor-${state.id ?? `new-${foundry.utils.randomID(8)}`}`,
        window: {
          title: game.i18n.localize(
            state.id ? "LOREFRAME.UserTemplates.EditTitle" : "LOREFRAME.UserTemplates.CreateTitle",
          ),
        },
      });
      this.#deps = deps;
      this.#state = state;
    }

    override async close(options?: object): Promise<this> {
      if (this.#state.id && editing.get(this.#state.id) === this) editing.delete(this.#state.id);
      return super.close(options);
    }

    override async _prepareContext(): Promise<object> {
      const { definition, name, description, preset, values, presets } = this.#state;
      const { sections } = buildInspectorModel(definition, values, {
        preset,
        presets,
        configurableOnly: true,
      });
      return {
        name,
        description,
        baseName: definition.name,
        sections,
        idPrefix: this.id,
        submitLabel: "LOREFRAME.UserTemplates.Save",
      };
    }

    async save(form: Record<string, unknown>): Promise<boolean> {
      const { definition, presets } = this.#state;
      const outcome = await this.#deps.catalog.saveEditor(this.#state, {
        name: typeof form.name === "string" ? form.name : "",
        description: typeof form.description === "string" ? form.description : "",
        preset: readPresetForm(form, presets),
        values: readInspectorForm(definition, form, { configurableOnly: true }) as UserTemplateValues,
      });
      if (!outcome.ok) {
        if (outcome.reason === "name-required") {
          ui.notifications.warn("LOREFRAME.UserTemplates.NameRequired", { localize: true });
        } else {
          ui.notifications.error("LOREFRAME.UserTemplates.SaveFailed", { localize: true });
        }
        return false;
      }
      // Foundry escapes `format` arguments (client/applications/ui/notifications.mjs).
      ui.notifications.info("LOREFRAME.UserTemplates.Saved", { format: { name: outcome.template.name } });
      return true;
    }
  }

  async function submit(
    this: ApplicationV2Instance,
    _event: Event,
    _form: HTMLFormElement,
    formData: { object: Record<string, unknown> },
  ) {
    if (await (this as TemplateEditor).save(formData.object)) await this.close();
  }

  return TemplateEditor;
}
