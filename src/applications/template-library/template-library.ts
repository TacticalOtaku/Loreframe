import type { EditorView } from "prosemirror-view";
import { MODULE_ID } from "../../constants";
import { MAX_IMPORT_LENGTH } from "../../core/user-templates";
import type { LoreframeRuntime } from "../../runtime";
import { escapeHtml } from "../../utils/html";
import { logger } from "../../utils/logger";
import { openTemplateEditor } from "../template-editor/template-editor";
import { buildLibraryModel, matchesQuery, type LibraryCategoryId, type LibraryState } from "./library-model";

const TEMPLATE_DIR = `modules/${MODULE_ID}/templates/applications`;
const SEARCH_DEBOUNCE_MS = 120;

type TemplateLibraryApplication = InstanceType<ReturnType<typeof defineTemplateLibrary>>;

let applicationClass: ReturnType<typeof defineTemplateLibrary> | undefined;
let instance: TemplateLibraryApplication | undefined;

/**
 * Open the Template Library (spec §14), or bring it forward. `target` pins the editor to insert into;
 * otherwise the most recently focused editor is used.
 */
export function openTemplateLibrary(runtime: LoreframeRuntime, target?: EditorView): void {
  applicationClass ??= defineTemplateLibrary();
  instance ??= new applicationClass(runtime);
  instance.setTarget(target ?? null);
  if (instance.rendered) {
    instance.bringToFront();
    void instance.render({ parts: ["preview"] });
  } else {
    void instance.render({ force: true });
  }
}

/**
 * The class is created lazily: Foundry's application base classes only exist once the game is running.
 * It only holds UI state; all data shaping happens in `buildLibraryModel`.
 */
function defineTemplateLibrary() {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  class TemplateLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
    static override DEFAULT_OPTIONS: ApplicationV2Options = {
      id: `${MODULE_ID}-template-library`,
      classes: ["loreframe", "loreframe-library"],
      window: {
        title: "LOREFRAME.Library.Title",
        icon: "fa-solid fa-swatchbook",
        resizable: true,
      },
      position: { width: 960, height: 620 },
      actions: {
        selectCategory: action((app, target) => app.#selectCategory(target)),
        selectTemplate: action((app, target, event) => app.#selectTemplate(target, event)),
        toggleFavorite: action((app, target) => app.#toggleFavorite(target)),
        insert: action((app) => app.#insertSelected()),
        customize: action((app) => app.#customize()),
        editTemplate: action((app) => app.#editSelected()),
        duplicateTemplate: action((app) => app.#duplicateSelected()),
        deleteTemplate: action((app) => app.#deleteSelected()),
        exportTemplates: action((app, target) => app.#export(target.dataset.scope === "selected")),
        importTemplates: action((app) => app.#chooseImportFile()),
      },
    };

    static override PARTS: HandlebarsParts = {
      nav: { template: `${TEMPLATE_DIR}/library-nav.hbs` },
      browser: {
        template: `${TEMPLATE_DIR}/library-browser.hbs`,
        scrollable: [".loreframe-library__results"],
      },
      preview: {
        template: `${TEMPLATE_DIR}/library-preview.hbs`,
        scrollable: [".loreframe-library__preview-body"],
      },
    };

    readonly #runtime: LoreframeRuntime;
    #state: LibraryState = { category: "all", query: "", selectedId: null, preset: null };
    #target: EditorView | null = null;
    #searchTimer: ReturnType<typeof setTimeout> | undefined;

    #unsubscribe: (() => void) | null = null;

    constructor(runtime: LoreframeRuntime) {
      super();
      this.#runtime = runtime;
    }

    #unwatchEditors: (() => void) | null = null;
    #couldInsert: boolean | null = null;

    override async close(options?: object): Promise<this> {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#unwatchEditors?.();
      this.#unwatchEditors = null;
      clearTimeout(this.#searchTimer);
      return super.close(options);
    }

    setTarget(target: EditorView | null): void {
      this.#target = target;
    }

    override async _prepareContext(): Promise<object> {
      const { preferences } = this.#runtime;
      const model = buildLibraryModel({
        templates: this.#runtime.availableTemplates(),
        favorites: preferences.favorites(),
        recent: preferences.recent(),
        state: this.#state,
        localize: (key) => game.i18n.localize(key),
        renderPreview: (id, preset) => this.#runtime.renderPreview(id, preset),
        presetsFor: (definition) => this.#runtime.presetsFor(definition),
        canInsert: this.#insertTarget() !== null,
        userTemplates: this.#runtime.libraryUserTemplates(),
      });
      // Saved or deleted "My Templates" (also from the block inspector) refresh the open library.
      this.#unsubscribe ??= this.#runtime.onUserTemplatesChanged(() => {
        if (this.rendered) void this.render({ parts: ["nav", "browser", "preview"] });
      });
      // The Insert button follows the editors: focusing or closing one refreshes the preview part.
      this.#couldInsert = model.canInsert;
      this.#unwatchEditors ??= this.#runtime.tracker.onChange(() => {
        if (this.rendered && (this.#insertTarget() !== null) !== this.#couldInsert) {
          void this.render({ parts: ["preview"] });
        }
      });
      this.#state.selectedId = model.selected?.id ?? null;
      // A user template brings its own preset; it must not replace the choice made for built-in templates.
      if (model.preset !== null && !model.selected?.mine) this.#state.preset = model.preset;
      return { ...model, query: this.#state.query, mineCategory: this.#state.category === "mine" };
    }

    override _attachPartListeners(
      partId: string,
      html: HTMLElement,
      options: ApplicationV2RenderOptions,
    ): void {
      super._attachPartListeners(partId, html, options);
      if (partId === "preview") {
        html.querySelector<HTMLSelectElement>("select[name=preset]")?.addEventListener("change", (event) => {
          this.#state.preset = (event.currentTarget as HTMLSelectElement).value;
          void this.render({ parts: ["preview"] });
        });
        return;
      }
      if (partId !== "browser") return;
      html.querySelector<HTMLInputElement>("input[name=importFile]")?.addEventListener("change", (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file) void this.#import(file);
      });
      const search = html.querySelector<HTMLInputElement>("input[name=query]");
      search?.addEventListener("input", () => {
        clearTimeout(this.#searchTimer);
        this.#searchTimer = setTimeout(() => {
          this.#state.query = search.value;
          this.#applySearch(html);
          void this.#refreshSelection(html);
        }, SEARCH_DEBOUNCE_MS);
      });
      html.querySelector(".loreframe-library__grid")?.addEventListener("dblclick", (event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-template-id]");
        if (card && !(event.target as HTMLElement).closest(".loreframe-library__favorite"))
          this.#insertSelected();
      });
      this.#applySearch(html);
    }

    /** The editor to insert into: the pinned one while it is usable, else the most recently focused one. */
    #insertTarget(): EditorView | null {
      const pinned = this.#target;
      if (pinned && !pinned.isDestroyed && pinned.dom.isConnected && pinned.editable) return pinned;
      return this.#runtime.tracker.active();
    }

    /** Filter rendered cards in place — no re-render per keystroke (spec §15, §42). */
    #applySearch(html: HTMLElement): void {
      const cards = html.querySelectorAll<HTMLElement>(".loreframe-library__card");
      let visible = 0;
      for (const card of cards) {
        const match = matchesQuery(card.dataset.search ?? "", this.#state.query);
        card.hidden = !match;
        if (match) visible++;
      }
      const noResults = html.querySelector<HTMLElement>(".loreframe-library__no-results");
      if (noResults) noResults.hidden = visible > 0 || cards.length === 0;
    }

    /** The selection must stay visible: re-render the preview and mirror the selection onto the cards. */
    async #refreshSelection(browser: HTMLElement): Promise<void> {
      const previous = this.#state.selectedId;
      await this.render({ parts: ["preview"] });
      if (this.#state.selectedId === previous) return;
      for (const card of browser.querySelectorAll<HTMLElement>(".loreframe-library__card")) {
        const selected = card.dataset.templateId === this.#state.selectedId;
        card.classList.toggle("loreframe-library__card--selected", selected);
        card.querySelector(".loreframe-library__card-main")?.setAttribute("aria-pressed", String(selected));
      }
    }

    #selectCategory(target: HTMLElement): void {
      const category = target.dataset.category as LibraryCategoryId | undefined;
      if (!category || category === this.#state.category) return;
      this.#state.category = category;
      this.#state.selectedId = null;
      void this.render({ parts: ["nav", "browser", "preview"] });
    }

    #selectTemplate(target: HTMLElement, event: PointerEvent): void {
      const id = target.closest<HTMLElement>("[data-template-id]")?.dataset.templateId;
      if (!id) return;
      // Keyboard activation (Enter/Space reports detail 0) on the already selected card inserts it.
      if (id === this.#state.selectedId && event.detail === 0) {
        this.#insertSelected();
        return;
      }
      if (id === this.#state.selectedId) return;
      this.#state.selectedId = id;
      void this.render({ parts: ["browser", "preview"] });
    }

    async #toggleFavorite(target: HTMLElement): Promise<void> {
      const id = target.closest<HTMLElement>("[data-template-id]")?.dataset.templateId;
      if (!id) return;
      try {
        await this.#runtime.preferences.toggleFavorite(id);
      } catch (error) {
        logger.error(`Could not update favorite "${id}"`, error);
        ui.notifications.error("LOREFRAME.Error.PreferencesFailed", { localize: true });
        return;
      }
      // The hovered star is replaced by the re-render; drop its tooltip so it does not linger.
      if (game.tooltip.element && this.element.contains(game.tooltip.element)) game.tooltip.deactivate();
      await this.render({ parts: ["nav", "browser"] });
    }

    /* -------------------------------------------- */
    /*  My Templates (spec §32)                     */
    /* -------------------------------------------- */

    /** Start a user template from the selected template (with the preset chosen in the preview). */
    #customize(): void {
      const id = this.#state.selectedId;
      if (!id) return;
      if (this.#runtime.userTemplates.get(id)) {
        this.#editSelected();
        return;
      }
      openTemplateEditor(this.#runtime, { mode: "create", base: id, preset: this.#state.preset });
    }

    #editSelected(): void {
      const id = this.#state.selectedId;
      if (id && this.#runtime.userTemplates.get(id)) openTemplateEditor(this.#runtime, { mode: "edit", id });
    }

    async #duplicateSelected(): Promise<void> {
      const template = this.#state.selectedId
        ? this.#runtime.userTemplates.get(this.#state.selectedId)
        : null;
      if (!template) return;
      const name = game.i18n.format("LOREFRAME.UserTemplates.CopyName", { name: template.name }).slice(0, 80);
      await this.#changeUserTemplates(async (store) => {
        const copy = await store.duplicate(template.id, name);
        this.#state.selectedId = copy.id;
      });
    }

    async #deleteSelected(): Promise<void> {
      const template = this.#state.selectedId
        ? this.#runtime.userTemplates.get(this.#state.selectedId)
        : null;
      if (!template) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: game.i18n.localize("LOREFRAME.UserTemplates.DeleteTitle"),
          icon: "fa-solid fa-trash",
        },
        content: `<p>${game.i18n.format("LOREFRAME.UserTemplates.DeleteContent", {
          name: escapeHtml(template.name),
        })}</p>`,
        modal: true,
        yes: { label: game.i18n.localize("LOREFRAME.UserTemplates.Delete"), icon: "fa-solid fa-trash" },
      });
      if (confirmed !== true) return;
      await this.#changeUserTemplates(async (store) => {
        await store.remove(template.id);
        await this.#runtime.preferences.forget(template.id);
        this.#state.selectedId = null;
      });
    }

    /** Download a JSON package of the selected user template, or of all of them. */
    #export(selectedOnly: boolean): void {
      const store = this.#runtime.userTemplates;
      const ids = selectedOnly && this.#state.selectedId ? [this.#state.selectedId] : undefined;
      if (!store.list().some((template) => !ids || ids.includes(template.id))) {
        ui.notifications.warn("LOREFRAME.UserTemplates.NothingToExport", { localize: true });
        return;
      }
      foundry.utils.saveDataToFile(store.exportJson(ids), "application/json", "loreframe-templates.json");
    }

    #chooseImportFile(): void {
      this.element.querySelector<HTMLInputElement>("input[name=importFile]")?.click();
    }

    async #import(file: File): Promise<void> {
      try {
        // Checked before reading: a wrong file (a video, say) would be loaded into memory whole.
        // UTF-8 needs at most 3 bytes per UTF-16 code unit; the exact length is checked by `import`.
        if (file.size > MAX_IMPORT_LENGTH * 3) throw new Error("Template package is too large");
        const text = await foundry.utils.readTextFromFile(file);
        const result = await this.#runtime.userTemplates.import(text);
        this.#runtime.notifyUserTemplatesChanged();
        ui.notifications.info("LOREFRAME.UserTemplates.Imported", {
          format: { added: String(result.added), skipped: String(result.skipped) },
        });
      } catch (error) {
        logger.warn("Template import rejected", error);
        ui.notifications.error("LOREFRAME.UserTemplates.ImportFailed", { localize: true });
      }
    }

    async #changeUserTemplates(
      change: (store: LoreframeRuntime["userTemplates"]) => Promise<void>,
    ): Promise<void> {
      try {
        await change(this.#runtime.userTemplates);
      } catch (error) {
        logger.error("Could not update user templates", error);
        ui.notifications.error("LOREFRAME.UserTemplates.SaveFailed", { localize: true });
        return;
      }
      this.#runtime.notifyUserTemplatesChanged();
    }

    #insertSelected(): void {
      const id = this.#state.selectedId;
      if (!id) return;
      const view = this.#insertTarget();
      if (!view) {
        ui.notifications.warn("LOREFRAME.Error.NoEditor", { localize: true });
        return;
      }
      const definition = this.#runtime.core.templates.get(id);
      const offered = definition ? this.#runtime.presetsFor(definition) : [];
      const preset = offered.find((p) => p.id === this.#state.preset)?.id;
      if (this.#runtime.insertEntry(view, id, preset)) void this.render({ parts: ["nav"] });
    }
  }

  /** Adapt a private-method handler to Foundry's `actions` signature (`this` is the application). */
  function action(
    handler: (app: TemplateLibrary, target: HTMLElement, event: PointerEvent) => unknown,
  ): NonNullable<ApplicationV2Options["actions"]>[string] {
    return function (this: ApplicationV2Instance, event: PointerEvent, target: HTMLElement) {
      return handler(this as TemplateLibrary, target, event);
    };
  }

  return TemplateLibrary;
}

export type { TemplateLibraryApplication };
