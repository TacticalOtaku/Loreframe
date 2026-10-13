import type { EditorView } from "prosemirror-view";
import { MODULE_ID, SETTINGS } from "./constants";
import { newInstanceId } from "./core/instance-id";
import { createCore, type LoreframeCore } from "./core/loreframe-core";
import { Preferences } from "./core/preferences";
import { UserTemplateStore } from "./core/user-templates";
import type { LibraryUserTemplate } from "./applications/template-library/library-model";
import { getSetting } from "./core/settings";
import {
  blockVersionState,
  type BlockVersionState,
  deleteBlockTransaction,
  duplicateBlockTransaction,
  locateBlock,
  movedOutOfBlock,
  readBlockValues,
  rebuildBlockTransaction,
  writtenRegions,
} from "./editor/block-document";
import { EditorTracker } from "./editor/editor-tracker";
import { insertTemplateIntoView, type InsertTemplateOptions } from "./editor/insert-template";
import { IntegrationManager } from "./integrations/integration-manager";
import { DATA_ATTR } from "./constants";
import type { LoreframePresetDefinition, LoreframeTemplateDefinition, TemplateValues } from "./types";
import { getHtmlAttribute } from "./editor/node-attrs";
import { logger } from "./utils/logger";

/** Foundry-bound services shared by hooks, the editor menu, the library window and the API. */
export interface LoreframeRuntime {
  readonly core: LoreframeCore;
  readonly preferences: Preferences;
  readonly tracker: EditorTracker;
  readonly integrations: IntegrationManager;
  readonly userTemplates: UserTemplateStore;
  /** User templates whose base template is available in this world. */
  libraryUserTemplates(): LibraryUserTemplate[];
  /** Insert a library entry: a registered template, or a user template (its base with its preset and options). */
  insertEntry(view: EditorView, id: string, preset?: string): boolean;
  /** Save or delete user templates through this, so open windows can refresh. */
  onUserTemplatesChanged(listener: () => void): () => void;
  notifyUserTemplatesChanged(): void;
  /** Templates usable in this world (filtered by the active game system). */
  availableTemplates(): ReturnType<LoreframeCore["templates"]["list"]>;
  /** Insert a new instance; the preset defaults to the template's first preset. */
  insert(view: EditorView, templateId: string, options?: InsertTemplateOptions): boolean;
  /** Preview markup for a template or user template, or null (logged) when it cannot render. */
  renderPreview(id: string, preset?: string): string | null;
  /** Presets a template supports, in display order. */
  presetsFor(definition: LoreframeTemplateDefinition): LoreframePresetDefinition[];
  /** The block's template, current property values and preset, or null when the block or its template is gone. */
  readBlock(view: EditorView, instanceId: string): BlockSnapshot | null;
  /** Rich-text fields and slots of the block the author has changed (see `writtenRegions`). */
  writtenFields(view: EditorView, instanceId: string): string[];
  /**
   * Re-render a block with changed values (and optionally another preset), keeping the author's rich text and
   * nested blocks.
   */
  updateBlock(view: EditorView, instanceId: string, changed: TemplateValues, preset?: string): boolean;
  duplicateBlock(view: EditorView, instanceId: string): boolean;
  deleteBlock(view: EditorView, instanceId: string): boolean;
}

export interface BlockSnapshot {
  definition: LoreframeTemplateDefinition;
  values: TemplateValues;
  preset: string | null;
  /** Only "current" blocks can be edited; see `blockVersionState`. */
  version: BlockVersionState;
}

/** Resolve a block for editing, reporting why it cannot be edited. */
function editableBlock(core: LoreframeCore, view: EditorView, instanceId: string) {
  if (view.isDestroyed || !view.editable) {
    ui.notifications.warn("LOREFRAME.Error.NoEditor", { localize: true });
    return null;
  }
  const location = locateBlock(view.state.doc, instanceId);
  if (!location) {
    ui.notifications.warn("LOREFRAME.Error.BlockMissing", { localize: true });
    return null;
  }
  return location;
}

export function createRuntime(): LoreframeRuntime {
  const core = createCore({ localize: (key) => game.i18n.localize(key), newInstanceId });
  const preferences = new Preferences({
    get: (key) => getSetting(key === "favorites" ? SETTINGS.favorites : SETTINGS.recent),
    set: (key, value) =>
      game.settings.set(MODULE_ID, key === "favorites" ? SETTINGS.favorites : SETTINGS.recent, value),
  });
  const tracker = new EditorTracker();
  const userTemplates = new UserTemplateStore({
    templates: core.templates,
    presets: core.presets,
    read: () => getSetting(SETTINGS.userTemplates),
    write: (list) => game.settings.set(MODULE_ID, SETTINGS.userTemplates, list),
    newId: newInstanceId,
  });
  const listeners = new Set<() => void>();
  const integrations = new IntegrationManager({
    systemId: () => game.system.id,
    enabled: () => getSetting(SETTINGS.enableIntegrations),
  });

  return {
    core,
    preferences,
    tracker,
    integrations,
    userTemplates,
    libraryUserTemplates: () => {
      const available = new Map(
        core.templates.list({ systemId: game.system.id }).map((definition) => [definition.id, definition]),
      );
      return userTemplates.list().flatMap((template) => {
        const base = available.get(template.base);
        return base ? [{ ...template, base }] : [];
      });
    },
    insertEntry(view, id, preset) {
      const template = userTemplates.get(id);
      if (!template) return this.insert(view, id, preset ? { preset } : {});
      return this.insert(view, template.base, {
        values: template.values,
        ...(template.preset ? { preset: template.preset } : {}),
        recordAs: template.id,
      });
    },
    onUserTemplatesChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notifyUserTemplatesChanged() {
      for (const listener of listeners) listener();
    },
    availableTemplates: () => core.templates.list({ systemId: game.system.id }),
    insert: (view, templateId, options = {}) =>
      insertTemplateIntoView(
        view,
        templateId,
        {
          templates: core.templates,
          renderNew: (id, renderOptions = {}) => core.renderNew(id, renderOptions),
          parseHtml: (html) => ProseMirror.dom.parseString(html),
          stateModule: ProseMirror.state,
          recordUse: (id) => preferences.recordUse(id),
          notifyError: (key) => ui.notifications.error(key, { localize: true }),
        },
        options,
      ),
    presetsFor: (definition) => core.presets.listFor(definition),
    readBlock: (view, instanceId) => {
      const location = locateBlock(view.state.doc, instanceId);
      const definition = location ? core.templates.get(location.templateId) : undefined;
      if (!location || !definition) return null;
      return {
        definition,
        values: readBlockValues(location.root, definition),
        preset: getHtmlAttribute(location.root, DATA_ATTR.preset) ?? null,
        version: blockVersionState(location.root, definition),
      };
    },
    writtenFields: (view, instanceId) => {
      const location = locateBlock(view.state.doc, instanceId);
      const definition = location ? core.templates.get(location.templateId) : undefined;
      if (!location || !definition) return [];
      try {
        const preset = getHtmlAttribute(location.root, DATA_ATTR.preset) ?? null;
        const html = core.renderer.render(definition.id, { instanceId, preset });
        const fresh = ProseMirror.dom.parseString(html).firstChild;
        const freshRoot = fresh?.type.name === "secret" ? fresh.firstChild : fresh;
        return freshRoot ? writtenRegions(location.root, freshRoot, definition) : [];
      } catch (error) {
        // Without a reference render every written region counts, so the author is still asked.
        logger.error(`Could not compare block "${instanceId}" with its defaults`, error);
        return [
          ...(definition.fields ?? []).filter((f) => f.type === "richText").map((f) => f.id),
          ...(definition.slots ?? []),
        ];
      }
    },
    updateBlock: (view, instanceId, changed, nextPreset) => {
      const location = editableBlock(core, view, instanceId);
      const definition = location ? core.templates.get(location.templateId) : undefined;
      if (!location || !definition) return false;
      // Never rebuild a block with a template of another version: its markup would be lost (spec §46, §47).
      if (blockVersionState(location.root, definition) !== "current") {
        ui.notifications.warn("LOREFRAME.Error.BlockVersion", { localize: true });
        return false;
      }
      try {
        // Re-read the block now: the author may have edited it while the inspector was open.
        const values = { ...readBlockValues(location.root, definition), ...changed };
        const preset = nextPreset ?? getHtmlAttribute(location.root, DATA_ATTR.preset) ?? null;
        const html = core.renderer.render(definition.id, { instanceId, values, preset });
        const fresh = ProseMirror.dom.parseString(html).firstChild;
        if (!fresh) throw new Error("Rendered block is empty");
        const tr = rebuildBlockTransaction(view.state, location, fresh, definition, ProseMirror.state);
        view.dispatch(tr.scrollIntoView());
        view.focus();
        const moved = movedOutOfBlock(tr);
        if (moved) {
          ui.notifications.info("LOREFRAME.Inspector.MovedOut", { format: { count: String(moved) } });
        }
        return true;
      } catch (error) {
        logger.error(`Updating block "${instanceId}" failed`, error);
        ui.notifications.error("LOREFRAME.Error.UpdateFailed", { localize: true });
        return false;
      }
    },
    duplicateBlock: (view, instanceId) => {
      const location = editableBlock(core, view, instanceId);
      if (!location) return false;
      view.dispatch(duplicateBlockTransaction(view.state, location, newInstanceId).scrollIntoView());
      view.focus();
      return true;
    },
    deleteBlock: (view, instanceId) => {
      const location = editableBlock(core, view, instanceId);
      if (!location) return false;
      view.dispatch(deleteBlockTransaction(view.state, location, ProseMirror.state).scrollIntoView());
      view.focus();
      return true;
    },
    renderPreview: (id, preset) => {
      try {
        const template = userTemplates.get(id);
        const templateId = template?.base ?? id;
        return core.renderer.render(templateId, {
          instanceId: "preview",
          ...(template ? { values: template.values } : {}),
          ...(preset ? { preset } : {}),
        });
      } catch (error) {
        logger.error(`Preview of template "${id}" failed`, error);
        return null;
      }
    },
  };
}
