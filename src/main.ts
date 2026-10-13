import "../styles/loreframe.scss";
import { createApi, type LoreframeApi } from "./api";
import { openTemplateLibrary } from "./applications/template-library/template-library";
import { MODULE_ID } from "./constants";
import { newInstanceId } from "./core/instance-id";
import { registerSettings } from "./core/settings";
import { deleteBlockWithConfirmation } from "./applications/block-actions";
import { openBlockInspector } from "./applications/block-inspector/block-inspector";
import { buildBlockIntegrityPlugin } from "./editor/block-integrity-plugin";
import { buildBlockToolbarPlugin } from "./editor/block-toolbar";
import { isChatEditor } from "./editor/editor-kind";
import { buildDocumentDropPlugin, prependPlugin } from "./editor/document-drop";
import { buildEditorTrackerPlugin } from "./editor/editor-tracker";
import { registerDnd5eIntegration } from "./integrations/dnd5e";
import { handleDocumentDrop } from "./integrations/document-drop-flow";
import { buildLoreframeDropdown, DROPDOWN_KEY } from "./editor/menu";
import { createRuntime, type LoreframeRuntime } from "./runtime";
import { logger } from "./utils/logger";
import { enhanceArticleContents } from "./view/article-contents";

let runtime: LoreframeRuntime;
let api: LoreframeApi;

Hooks.once("init", () => {
  registerSettings();
  runtime = createRuntime();

  const module = game.modules.get(MODULE_ID);
  api = createApi({
    core: runtime.core,
    version: module?.version ?? "0.0.0",
    openLibrary: () => openTemplateLibrary(runtime),
    activeEditor: () => runtime.tracker.active(),
    insert: (view, templateId, options) => runtime.insert(view, templateId, options),
    integrations: runtime.integrations,
  });

  // Built-in adapters; the integration manager ignores those of other game systems.
  registerDnd5eIntegration(runtime.integrations, (key, data) => game.i18n.format(key, data));

  if (module) module.api = api;
  else logger.error("Module entry missing from game.modules; API not exposed");

  // Foundry 14 common/prosemirror/menu.mjs → Hooks.callAll("getProseMirrorMenuDropDowns", menu, menus)
  Hooks.on(
    "getProseMirrorMenuDropDowns",
    (_menu: ProseMirrorMenuLike, menus: Record<string, ProseMirrorDropDownConfig>) => {
      menus[DROPDOWN_KEY] = buildLoreframeDropdown({
        templates: runtime.core.templates,
        systemId: game.system.id,
        favorites: () => runtime.preferences.favorites(),
        recent: () => runtime.preferences.recent(),
        userTemplates: () => runtime.libraryUserTemplates(),
        insert: (view, id) => runtime.insertEntry(view, id),
        openLibrary: (view) => openTemplateLibrary(runtime, view),
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
        onDrop: (view, drop) => {
          handleDocumentDrop(runtime, view, drop).catch((error: unknown) => {
            logger.error("Document drop failed", error);
            ui.notifications.error("LOREFRAME.Error.InsertFailed", { localize: true });
          });
        },
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
        openBlockInspector(runtime, view, instanceId).catch((error: unknown) =>
          logger.error(`Could not open the inspector for "${instanceId}"`, error),
        );
      },
      onDuplicate: (view, instanceId) => runtime.duplicateBlock(view, instanceId),
      onDelete: (view, instanceId) => {
        deleteBlockWithConfirmation(runtime, view, instanceId).catch((error: unknown) =>
          logger.error(`Could not delete block "${instanceId}"`, error),
        );
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
