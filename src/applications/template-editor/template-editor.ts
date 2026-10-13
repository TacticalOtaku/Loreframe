import { MODULE_ID } from "../../constants";
import type { UserTemplateValues } from "../../core/user-templates";
import type { LoreframeRuntime } from "../../runtime";
import type { LoreframeTemplateDefinition } from "../../types";
import { logger } from "../../utils/logger";
import {
  buildTemplateEditorModel,
  initialTemplateValues,
  readTemplateEditorForm,
} from "./template-editor-model";

const TEMPLATE_DIR = `modules/${MODULE_ID}/templates/applications`;
const SECTIONS_PARTIAL = `${TEMPLATE_DIR}/inspector-sections.hbs`;

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

interface EditorState {
  definition: LoreframeTemplateDefinition;
  /** The user template being edited, or null when creating one. */
  id: string | null;
  name: string;
  description: string;
  preset: string | null;
  values: UserTemplateValues;
}

let editorClass: ReturnType<typeof defineTemplateEditor> | undefined;
const editing = new Map<string, InstanceType<ReturnType<typeof defineTemplateEditor>>>();

/** Open "My Template" settings (spec §32): name, preset, sections and options — never content. */
export function openTemplateEditor(runtime: LoreframeRuntime, request: TemplateEditorRequest): void {
  const state = resolveRequest(runtime, request);
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
  const app = new editorClass(runtime, state);
  if (state.id) editing.set(state.id, app);
  void app.render({ force: true });
}

function resolveRequest(runtime: LoreframeRuntime, request: TemplateEditorRequest): EditorState | null {
  if (request.mode === "edit") {
    const template = runtime.userTemplates.get(request.id);
    const definition = template ? runtime.core.templates.get(template.base) : undefined;
    if (!template || !definition) return null;
    return { ...template, definition };
  }
  const definition = runtime.core.templates.get(request.base);
  if (!definition) return null;
  const presets = runtime.presetsFor(definition);
  const preset = request.preset && presets.some((p) => p.id === request.preset) ? request.preset : null;
  return {
    definition,
    id: null,
    name: request.name ?? game.i18n.localize(definition.name),
    description: "",
    preset: preset ?? presets[0]?.id ?? null,
    values: initialTemplateValues(definition, request.values ?? {}),
  };
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

    readonly #runtime: LoreframeRuntime;
    readonly #state: EditorState;

    constructor(runtime: LoreframeRuntime, state: EditorState) {
      super({
        id: `${MODULE_ID}-template-editor-${state.id ?? `new-${foundry.utils.randomID(8)}`}`,
        window: {
          title: game.i18n.localize(
            state.id ? "LOREFRAME.UserTemplates.EditTitle" : "LOREFRAME.UserTemplates.CreateTitle",
          ),
        },
      });
      this.#runtime = runtime;
      this.#state = state;
    }

    override async close(options?: object): Promise<this> {
      if (this.#state.id && editing.get(this.#state.id) === this) editing.delete(this.#state.id);
      return super.close(options);
    }

    override async _prepareContext(): Promise<object> {
      const { definition, name, description, preset, values } = this.#state;
      return {
        ...buildTemplateEditorModel({
          definition,
          name,
          description,
          preset,
          values,
          presets: this.#runtime.presetsFor(definition),
        }),
        idPrefix: this.id,
        submitLabel: "LOREFRAME.UserTemplates.Save",
      };
    }

    async save(form: Record<string, unknown>): Promise<boolean> {
      const { definition, id } = this.#state;
      const result = readTemplateEditorForm(definition, form, this.#runtime.presetsFor(definition));
      if (!result.name) {
        ui.notifications.warn("LOREFRAME.UserTemplates.NameRequired", { localize: true });
        return false;
      }
      try {
        const store = this.#runtime.userTemplates;
        if (id) await store.update(id, result);
        else await store.create({ ...result, base: definition.id });
      } catch (error) {
        logger.error("Could not save the user template", error);
        ui.notifications.error("LOREFRAME.UserTemplates.SaveFailed", { localize: true });
        return false;
      }
      this.#runtime.notifyUserTemplatesChanged();
      // Foundry escapes `format` arguments (client/applications/ui/notifications.mjs).
      ui.notifications.info("LOREFRAME.UserTemplates.Saved", { format: { name: result.name } });
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
