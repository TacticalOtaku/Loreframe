import type { EditorView } from "prosemirror-view";
import type { LoreframeCore } from "./core/loreframe-core";
import type { IntegrationManager } from "./integrations/integration-manager";
import type { LoreframeSystemAdapter } from "./integrations/types";
import type { LoreframePresetDefinition, LoreframeTemplateDefinition } from "./types";

/**
 * Public extension API, exposed as `game.modules.get("loreframe").api` (spec §37).
 * Templates are data: they must reference one of Loreframe's built-in renderers.
 */
export interface LoreframeApi {
  readonly version: string;
  openTemplateLibrary(): void;
  /** Insert a template into the most recently focused editable editor. Returns false if none is available. */
  insertTemplate(templateId: string, options?: { preset?: string }): boolean;
  registerTemplate(definition: LoreframeTemplateDefinition): void;
  unregisterTemplate(id: string): boolean;
  registerPreset(preset: LoreframePresetDefinition): void;
  /** Add a game-system adapter (spec §34); it is used only while its system is active. */
  registerSystemAdapter(adapter: LoreframeSystemAdapter): void;
}

export interface ApiDeps {
  core: LoreframeCore;
  version: string;
  openLibrary(): void;
  activeEditor(): EditorView | null;
  insert(view: EditorView, templateId: string, options: { preset?: string }): boolean;
  integrations: Pick<IntegrationManager, "register">;
}

export function createApi({
  core,
  version,
  openLibrary,
  activeEditor,
  insert,
  integrations,
}: ApiDeps): LoreframeApi {
  return Object.freeze({
    version,
    openTemplateLibrary: () => openLibrary(),
    insertTemplate: (templateId: string, options: { preset?: string } = {}) => {
      if (!core.templates.has(templateId)) throw new Error(`Unknown template "${templateId}"`);
      const view = activeEditor();
      return view
        ? insert(view, templateId, { ...(options.preset ? { preset: options.preset } : {}) })
        : false;
    },
    registerTemplate: (definition: LoreframeTemplateDefinition) => core.templates.register(definition),
    unregisterTemplate: (id: string) => core.templates.unregister(id),
    registerPreset: (preset: LoreframePresetDefinition) => core.presets.register(preset),
    registerSystemAdapter: (adapter: LoreframeSystemAdapter) => integrations.register(adapter),
  });
}
