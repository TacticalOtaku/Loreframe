import "../styles/loreframe.scss";
import { createApi, type LoreframeApi } from "./api";
import { openBlockInspector } from "./applications/block-inspector/block-inspector";
import { openTemplateLibrary } from "./applications/template-library/template-library";
import { MODULE_ID } from "./constants";
import { newInstanceId } from "./core/instance-id";
import { registerSettings } from "./core/settings";
import { buildBlockIntegrityPlugin } from "./editor/block-integrity-plugin";
import { buildBlockToolbarPlugin } from "./editor/block-toolbar";
import { buildDocumentDropPlugin, prependPlugin } from "./editor/document-drop";
import { isChatEditor } from "./editor/editor-kind";
import { buildEditorTrackerPlugin } from "./editor/editor-tracker";
import { buildLoreframeDropdown, DROPDOWN_KEY } from "./editor/menu";
import { createDnd5eAdapter } from "./integrations/dnd5e/dnd5e-adapter";
import { createRuntime, type LoreframeRuntime } from "./runtime";
import { logger } from "./utils/logger";
import { enhanceArticleContents } from "./view/article-contents";

let runtime: LoreframeRuntime;
let api: LoreframeApi;

Hooks.once("init", () => {
  registerSettings();
  runtime = createRuntime();

  const libraryDeps = {
    catalog: runtime.catalog,
    tracker: runtime.tracker,
    inserter: runtime.inserter,
  };
  const inspectorDeps = {
    blocks: runtime.blocks,
    catalog: runtime.catalog,
  };

  const module = game.modules.get(MODULE_ID);
  api = createApi({
    core: runtime.core,
    version: module?.version ?? "0.0.0",
    openLibrary: () => openTemplateLibrary(libraryDeps),
    activeEditor: () => runtime.tracker.active(),
    insert: (view, templateId, options) => runtime.inserter.insert(view, templateId, options),
    integrations: runtime.integrations,
  });

  // Built-in adapters; the integration manager ignores those of other game systems.
  runtime.integrations.register(
    createDnd5eAdapter({
      formatCR: (cr) => globalThis.dnd5e?.utils?.formatCR?.(cr) ?? String(cr),
      format: (key, data) => game.i18n.format(key, data),
    }),
  );

  if (module) module.api = api;
  else logger.error("Module entry missing from game.modules; API not exposed");

  // Foundry 14 common/prosemirror/menu.mjs → Hooks.callAll("getProseMirrorMenuDropDowns", menu, menus)
  Hooks.on(
    "getProseMirrorMenuDropDowns",
    (_menu: ProseMirrorMenuLike, menus: Record<string, ProseMirrorDropDownConfig>) => {
      menus[DROPDOWN_KEY] = buildLoreframeDropdown({
        catalog: runtime.catalog,
        insert: (view, id) => runtime.inserter.insert(view, id),
        openLibrary: (view) => openTemplateLibrary(libraryDeps, view),
      });
    },
  );

  // client/applications/ux/prosemirror-editor.mjs → Hooks.callAll("createProseMirrorEditor", uuid, plugins, options)
  Hooks.on("createProseMirrorEditor", (_uuid: string, plugins: Record<string, unknown>) => {
    // The chat message input is not a place for Loreframe blocks.
    if (isChatEditor(plugins, ProseMirror.plugins.chat.ChatInputPlugin.key)) return;
    // Before Foundry's content-link plugin, which would otherwise take every document drop.
    prependPlugin(
      plugins,
      "loreframeDocumentDrop",
      buildDocumentDropPlugin({
        Plugin: ProseMirror.state.Plugin,
        getDragData: (event) => foundry.applications.ux.TextEditor.implementation.getDragEventData(event),
        claims: (type) => runtime.integrations.handles(type),
        onDrop: (view, drop) => runtime.dropHandler.handle(view, drop),
      }),
    );
    plugins.loreframeBlockIntegrity = buildBlockIntegrityPlugin({
      Plugin: ProseMirror.state.Plugin,
      newInstanceId,
    });
    plugins.loreframeEditorTracker = buildEditorTrackerPlugin({
      Plugin: ProseMirror.state.Plugin,
      tracker: runtime.tracker,
    });
    plugins.loreframeBlockToolbar = buildBlockToolbarPlugin({
      Plugin: ProseMirror.state.Plugin,
      localize: (key) => game.i18n.localize(key),
      templateName: (id) => {
        const definition = runtime.core.templates.get(id);
        return definition ? game.i18n.localize(definition.name) : null;
      },
      onEdit: (view, instanceId) => {
        openBlockInspector(inspectorDeps, view, instanceId).catch((error: unknown) =>
          logger.error(`Could not open the inspector for "${instanceId}"`, error),
        );
      },
      onDuplicate: (view, instanceId) => runtime.blocks.duplicate(view, instanceId),
      onDelete: (view, instanceId) => {
        runtime.blocks
          .deleteWithConfirmation(view, instanceId)
          .catch((error: unknown) => logger.error(`Could not delete block "${instanceId}"`, error));
      },
    });
  });

  // client/applications/api/application.mjs: render hooks run after _onRender for every parent class.
  Hooks.on("renderJournalEntryPageSheet", (app: { isView?: boolean }, element: HTMLElement) => {
    if (!app.isView) return;
    try {
      enhanceArticleContents(element, (key) => game.i18n.localize(key));
    } catch (error) {
      logger.error("Could not build article contents", error);
    }
  });
});

// After every module's init: other modules register their templates and presets here.
Hooks.once("setup", () => {
  Hooks.callAll("loreframeRegisterTemplates", api);
});

Hooks.once("ready", () => {
  Hooks.callAll("loreframeReady", api);
  logger.debug(`Ready with ${runtime.core.templates.list().length} templates`);
});
