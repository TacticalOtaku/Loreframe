import type { EditorView } from "prosemirror-view";
import { MODULE_ID } from "../../constants";
import { configurableFields, type TemplateCatalog } from "../../core/template-catalog";
import type { BlockLifecycle, BlockSnapshot } from "../../editor/block-document";
import type { GalleryItem, LinkItem, TemplateValue, TemplateValues } from "../../types";
import { logger } from "../../utils/logger";
import { openTemplateEditor } from "../template-editor/template-editor";
import {
  addItems,
  addLinks,
  buildInspectorModel,
  changedValues,
  moveItem,
  readInspectorForm,
  readPresetForm,
  removeItem,
} from "./inspector-model";

const TEMPLATE_DIR = `modules/${MODULE_ID}/templates/applications`;

type ListEntry = GalleryItem | LinkItem;
const emptyLink = { uuid: "", label: "" };

export interface BlockInspectorDeps {
  blocks: Pick<BlockLifecycle, "prepareEdit" | "applyEdit">;
  catalog: Pick<TemplateCatalog, "presetsFor" | "prepareEditor" | "saveEditor">;
}

interface InspectorTarget extends BlockSnapshot {
  deps: BlockInspectorDeps;
  view: EditorView;
  instanceId: string;
  /** Window key: editor + block (see inspectorKey). */
  key: string;
}

let inspectorClass: ReturnType<typeof defineBlockInspector> | undefined;
const open = new Map<string, InstanceType<ReturnType<typeof defineBlockInspector>>>();

/**
 * Instance ids are unique per document only: a block copied to another page, or a duplicated page, keeps its id.
 * Windows are therefore keyed by editor and block.
 */
const editorKeys = new WeakMap<EditorView, number>();
let nextEditorKey = 0;

function inspectorKey(view: EditorView, instanceId: string): string {
  let key = editorKeys.get(view);
  if (key === undefined) {
    key = ++nextEditorKey;
    editorKeys.set(view, key);
  }
  return `${key}-${instanceId}`;
}

/** Open the inspector for one block (spec §24), or bring its existing window forward. */
export async function openBlockInspector(
  deps: BlockInspectorDeps,
  view: EditorView,
  instanceId: string,
): Promise<void> {
  const key = inspectorKey(view, instanceId);
  const existing = open.get(key);
  if (existing?.rendered) {
    existing.bringToFront();
    return;
  }
  const block = await deps.blocks.prepareEdit(view, instanceId);
  if (!block) return;
  inspectorClass ??= defineBlockInspector();
  const app = new inspectorClass({ deps, view, instanceId, key, ...block });
  open.set(key, app);
  await app.render({ force: true, position: besideEditor(view) });
}

const INSPECTOR_WIDTH = 460;
const MARGIN = 8;

/** Next to the window holding the editor: right of it when it fits, else left of it, else over its right edge. */
function besideEditor(view: EditorView): { left: number; top: number } | undefined {
  const frame = view.dom.closest(".application")?.getBoundingClientRect();
  if (!frame) return undefined;
  const right = frame.right + MARGIN;
  const left =
    right + INSPECTOR_WIDTH <= window.innerWidth
      ? right
      : frame.left - MARGIN - INSPECTOR_WIDTH >= 0
        ? frame.left - MARGIN - INSPECTOR_WIDTH
        : Math.max(MARGIN, frame.right - INSPECTOR_WIDTH - MARGIN);
  return { left, top: Math.max(MARGIN, frame.top) };
}

/** Created lazily: Foundry's application classes exist only once the game runs. */
function defineBlockInspector() {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  class BlockInspector extends HandlebarsApplicationMixin(ApplicationV2) {
    static override DEFAULT_OPTIONS: ApplicationV2Options = {
      classes: ["loreframe", "loreframe-inspector"],
      tag: "form",
      window: { icon: "fa-solid fa-sliders", resizable: true, contentClasses: ["standard-form"] },
      position: { width: INSPECTOR_WIDTH, height: "auto" },
      // Closed by the handler itself: the author may cancel a confirmation or fail saving and keep editing.
      form: { handler: submit, closeOnSubmit: false, submitOnChange: false },
      actions: {
        addItem: action((app, target) => app.#addImage(listOf(target))),
        saveAsTemplate: action((app) => app.#saveAsTemplate()),
        addLink: action((app, target) =>
          app.#changeList(listOf(target), (items) => addLinks(items as readonly LinkItem[], [emptyLink])),
        ),
        removeItem: action((app, target) =>
          app.#changeList(listOf(target), (items) => removeItem(items, indexOf(target))),
        ),
        moveItemUp: action((app, target) =>
          app.#changeList(listOf(target), (items) => moveItem(items, indexOf(target), -1)),
        ),
        moveItemDown: action((app, target) =>
          app.#changeList(listOf(target), (items) => moveItem(items, indexOf(target), 1)),
        ),
      },
    };

    static override PARTS: HandlebarsParts = {
      body: {
        template: `${TEMPLATE_DIR}/block-inspector.hbs`,
        templates: [`${TEMPLATE_DIR}/inspector-sections.hbs`],
        scrollable: [".loreframe-inspector__body"],
      },
      footer: { template: `${TEMPLATE_DIR}/block-inspector-footer.hbs` },
    };

    readonly #target: InspectorTarget;
    /** Edits made so far (form inputs are folded in before every re-render). */
    #values: TemplateValues;
    #preset: string | null;

    constructor(target: InspectorTarget) {
      super({
        id: `${MODULE_ID}-inspector-${target.key}`,
        window: {
          title: game.i18n.format("LOREFRAME.Inspector.Title", {
            name: game.i18n.localize(target.definition.name),
          }),
        },
      });
      this.#target = target;
      this.#values = structuredClone(target.values);
      this.#preset = target.preset;
    }

    get #presets() {
      return this.#target.deps.catalog.presetsFor(this.#target.definition);
    }

    override async _prepareContext(): Promise<object> {
      return {
        ...buildInspectorModel(this.#target.definition, this.#values, {
          preset: this.#preset,
          presets: this.#presets,
        }),
        // Element ids must be unique across open inspectors (label for= targets).
        idPrefix: this.id,
        canSaveTemplate: configurableFields(this.#target.definition).length > 0,
      };
    }

    override _attachPartListeners(
      partId: string,
      html: HTMLElement,
      options: ApplicationV2RenderOptions,
    ): void {
      super._attachPartListeners(partId, html, options);
      for (const zone of html.querySelectorAll<HTMLElement>("[data-drop-list]")) {
        zone.addEventListener("dragover", (event) => {
          event.preventDefault();
          zone.classList.add("loreframe-inspector__links--drop");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("loreframe-inspector__links--drop"));
        zone.addEventListener("drop", (event) => {
          event.preventDefault();
          zone.classList.remove("loreframe-inspector__links--drop");
          void this.#dropLink(zone.dataset.dropList ?? "", event);
        });
      }
    }

    override async close(options?: object): Promise<this> {
      open.delete(this.#target.key);
      return super.close(options);
    }

    /** Called by the form handler. Resolves false when cancelled or update fails, so the window stays open. */
    async apply(formValues: Record<string, unknown>): Promise<boolean> {
      const { deps, view, instanceId, definition } = this.#target;
      const edited = readInspectorForm(definition, formValues);
      const changed = changedValues(this.#target.values, edited);
      const chosen = readPresetForm(formValues, this.#presets);
      const nextPreset = chosen !== null && chosen !== this.#target.preset ? chosen : undefined;
      return deps.blocks.applyEdit(view, instanceId, { changed, edited, nextPreset });
    }

    #readForm(): void {
      const form = this.element instanceof HTMLFormElement ? this.element : null;
      if (!form) return;
      const data = new foundry.applications.ux.FormDataExtended(form).object;
      this.#values = { ...this.#values, ...readInspectorForm(this.#target.definition, data) };
      this.#preset = readPresetForm(data, this.#presets) ?? this.#preset;
    }

    /** Keep the current section, option and preset choices as a "My Template" (spec §32). */
    #saveAsTemplate(): void {
      this.#readForm();
      const { deps, definition } = this.#target;
      openTemplateEditor(
        { catalog: deps.catalog },
        {
          mode: "create",
          base: definition.id,
          preset: this.#preset,
          values: this.#values,
        },
      );
    }

    /** Apply a change to one list field (images or links), keeping everything typed so far. */
    #changeList(fieldId: string, change: (items: readonly ListEntry[]) => readonly ListEntry[]): void {
      const field = this.#target.definition.fields?.find((f) => f.id === fieldId);
      if (field?.type !== "items" && field?.type !== "links") return;
      this.#readForm();
      const value = this.#values[fieldId];
      const items = Array.isArray(value) ? (value as readonly ListEntry[]) : [];
      this.#values = { ...this.#values, [fieldId]: [...change(items)] as TemplateValue };
      void this.render();
    }

    #addImage(fieldId: string): void {
      const { FilePicker } = foundry.applications.apps;
      const picker = new FilePicker.implementation({
        type: "image",
        callback: (path: string) =>
          this.#changeList(fieldId, (items) => addItems(items as readonly GalleryItem[], [path])),
      });
      picker.browse().catch((error: unknown) => logger.error("Could not open the file picker", error));
    }

    /** A document dragged from the sidebar (or a compendium) becomes a linked entry named after it. */
    async #dropLink(fieldId: string, event: DragEvent): Promise<void> {
      const { TextEditor } = foundry.applications.ux;
      const data = TextEditor.implementation.getDragEventData(event);
      const uuid = typeof data.uuid === "string" ? data.uuid : "";
      if (!uuid) return;
      let label = "";
      try {
        label = (await foundry.utils.fromUuid(uuid))?.name ?? "";
      } catch (error) {
        logger.warn(`Could not resolve dropped document "${uuid}"`, error);
      }
      this.#changeList(fieldId, (items) => addLinks(items as readonly LinkItem[], [{ uuid, label }]));
    }
  }

  function action(
    handler: (app: BlockInspector, target: HTMLElement) => unknown,
  ): NonNullable<ApplicationV2Options["actions"]>[string] {
    return function (this: ApplicationV2Instance, _event: PointerEvent, target: HTMLElement) {
      return handler(this as BlockInspector, target);
    };
  }

  async function submit(
    this: ApplicationV2Instance,
    _event: Event,
    _form: HTMLFormElement,
    formData: { object: Record<string, unknown> },
  ) {
    if (await (this as BlockInspector).apply(formData.object)) await this.close();
  }

  function listOf(target: HTMLElement): string {
    return target.closest<HTMLElement>("[data-list]")?.dataset.list ?? "";
  }

  function indexOf(target: HTMLElement): number {
    return Number(target.closest<HTMLElement>("[data-index]")?.dataset.index ?? -1);
  }

  return BlockInspector;
}
