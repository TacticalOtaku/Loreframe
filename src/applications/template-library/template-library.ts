import type { EditorView } from "prosemirror-view";
import { MODULE_ID } from "../../constants";
import { MAX_IMPORT_LENGTH, type TemplateCatalog } from "../../core/template-catalog";
import type { EditorTracker } from "../../editor/editor-tracker";
import type { TemplateInserter } from "../../editor/insert";
import { escapeHtml } from "../../utils/html";
import { openTemplateEditor } from "../template-editor/template-editor";
import {
  createLibrarySession,
  matchesQuery,
  type LibraryCategoryId,
  type LibrarySession,
} from "./library-model";

const TEMPLATE_DIR = `modules/${MODULE_ID}/templates/applications`;
const SEARCH_DEBOUNCE_MS = 120;

export interface TemplateLibraryDeps {
  catalog: TemplateCatalog;
  tracker: EditorTracker;
  inserter: TemplateInserter;
}

type TemplateLibraryApplication = InstanceType<ReturnType<typeof defineTemplateLibrary>>;

let applicationClass: ReturnType<typeof defineTemplateLibrary> | undefined;
let instance: TemplateLibraryApplication | undefined;

/**
 * Open the Template Library (spec §14), or bring it forward. `target` pins the editor to insert into;
 * otherwise the most recently focused editor is used.
 */
export function openTemplateLibrary(deps: TemplateLibraryDeps, target?: EditorView): void {
  applicationClass ??= defineTemplateLibrary();
  instance ??= new applicationClass(deps);
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
 * It only binds ApplicationV2 events and DOM; session state and business rules live in `createLibrarySession`.
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
        customize: action((app) => app.#session.customizeSelected()),
        editTemplate: action((app) => app.#session.editSelected()),
        duplicateTemplate: action((app) => app.#session.duplicateSelected()),
        deleteTemplate: action((app) => app.#session.deleteSelected()),
        exportTemplates: action((app, target) =>
          app.#session.exportTemplates(target.dataset.scope === "selected"),
        ),
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

    readonly #session: LibrarySession;
    #searchTimer: ReturnType<typeof setTimeout> | undefined;
    #disconnect: (() => void) | null = null;

    constructor(deps: TemplateLibraryDeps) {
      super();
      this.#session = createLibrarySession({
        catalog: deps.catalog,
        tracker: deps.tracker,
        inserter: deps.inserter,
        ui: {
          localize: (key) => game.i18n.localize(key),
          notifyWarn: (key) => ui.notifications.warn(key, { localize: true }),
          notifyError: (key) => ui.notifications.error(key, { localize: true }),
          notifyInfo: (key, format) => ui.notifications.info(key, { format }),
          confirmDeleteUserTemplate: async (name) => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
              window: {
                title: game.i18n.localize("LOREFRAME.UserTemplates.DeleteTitle"),
                icon: "fa-solid fa-trash",
              },
              content: `<p>${game.i18n.format("LOREFRAME.UserTemplates.DeleteContent", {
                name: escapeHtml(name),
              })}</p>`,
              modal: true,
              yes: {
                label: game.i18n.localize("LOREFRAME.UserTemplates.Delete"),
                icon: "fa-solid fa-trash",
              },
            });
            return confirmed === true;
          },
          openTemplateEditor: (request) => openTemplateEditor({ catalog: deps.catalog }, request),
          saveJsonFile: (content, filename) =>
            foundry.utils.saveDataToFile(content, "application/json", filename),
        },
      });
    }

    override async close(options?: object): Promise<this> {
      this.#disconnect?.();
      this.#disconnect = null;
      clearTimeout(this.#searchTimer);
      return super.close(options);
    }

    setTarget(target: EditorView | null): void {
      this.#session.setTarget(target);
    }

    override async _prepareContext(): Promise<object> {
      this.#disconnect ??= this.#session.connect((parts) => {
        if (this.rendered) void this.render({ parts });
      });
      return this.#session.snapshot();
    }

    override _attachPartListeners(
      partId: string,
      html: HTMLElement,
      options: ApplicationV2RenderOptions,
    ): void {
      super._attachPartListeners(partId, html, options);
      if (partId === "preview") {
        html.querySelector<HTMLSelectElement>("select[name=preset]")?.addEventListener("change", (event) => {
          this.#session.selectPreset((event.currentTarget as HTMLSelectElement).value);
          void this.render({ parts: ["preview"] });
        });
        return;
      }
      if (partId !== "browser") return;
      html.querySelector<HTMLInputElement>("input[name=importFile]")?.addEventListener("change", (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file) {
          void this.#session.importTemplates(async () => {
            // Checked before reading: a wrong file (a video, say) would be loaded into memory whole.
            // UTF-8 needs at most 3 bytes per UTF-16 code unit; the exact length is checked by `importUserTemplates`.
            if (file.size > MAX_IMPORT_LENGTH * 3) throw new Error("Template package is too large");
            return foundry.utils.readTextFromFile(file);
          });
        }
      });
      const search = html.querySelector<HTMLInputElement>("input[name=query]");
      search?.addEventListener("input", () => {
        clearTimeout(this.#searchTimer);
        this.#searchTimer = setTimeout(() => {
          const previous = this.#session.snapshot().selected?.id ?? null;
          const { selectedId } = this.#session.setQuery(search.value);
          this.#applySearch(html);
          void this.#refreshSelection(html, previous, selectedId);
        }, SEARCH_DEBOUNCE_MS);
      });
      html.querySelector(".loreframe-library__grid")?.addEventListener("dblclick", (event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-template-id]");
        if (card && !(event.target as HTMLElement).closest(".loreframe-library__favorite")) {
          this.#insertSelected();
        }
      });
      this.#applySearch(html);
    }

    /** Filter rendered cards in place — no re-render per keystroke (spec §15, §42). */
    #applySearch(html: HTMLElement): void {
      const query = this.#session.state.query;
      const cards = html.querySelectorAll<HTMLElement>(".loreframe-library__card");
      let visible = 0;
      for (const card of cards) {
        const match = matchesQuery(card.dataset.search ?? "", query);
        card.hidden = !match;
        if (match) visible++;
      }
      const noResults = html.querySelector<HTMLElement>(".loreframe-library__no-results");
      if (noResults) noResults.hidden = visible > 0 || cards.length === 0;
    }

    /** The selection must stay visible: re-render the preview and mirror the selection onto the cards. */
    async #refreshSelection(
      browser: HTMLElement,
      previous: string | null,
      next: string | null,
    ): Promise<void> {
      await this.render({ parts: ["preview"] });
      if (next === previous) return;
      for (const card of browser.querySelectorAll<HTMLElement>(".loreframe-library__card")) {
        const selected = card.dataset.templateId === next;
        card.classList.toggle("loreframe-library__card--selected", selected);
        card.querySelector(".loreframe-library__card-main")?.setAttribute("aria-pressed", String(selected));
      }
    }

    #selectCategory(target: HTMLElement): void {
      const category = target.dataset.category as LibraryCategoryId | undefined;
      if (!category || !this.#session.selectCategory(category)) return;
      void this.render({ parts: ["nav", "browser", "preview"] });
    }

    #selectTemplate(target: HTMLElement, event: PointerEvent): void {
      const id = target.closest<HTMLElement>("[data-template-id]")?.dataset.templateId;
      if (!id) return;
      // Keyboard activation (Enter/Space reports detail 0) on the already selected card inserts it.
      if (!this.#session.selectTemplate(id)) {
        if (event.detail === 0) this.#insertSelected();
        return;
      }
      void this.render({ parts: ["browser", "preview"] });
    }

    async #toggleFavorite(target: HTMLElement): Promise<void> {
      const id = target.closest<HTMLElement>("[data-template-id]")?.dataset.templateId;
      if (!id) return;
      if (!(await this.#session.toggleFavorite(id))) return;
      // The hovered star is replaced by the re-render; drop its tooltip so it does not linger.
      if (game.tooltip.element && this.element.contains(game.tooltip.element)) game.tooltip.deactivate();
    }

    #chooseImportFile(): void {
      this.element.querySelector<HTMLInputElement>("input[name=importFile]")?.click();
    }

    #insertSelected(): void {
      this.#session.insertSelected();
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
