import { BUILT_IN_PRESETS, BUILT_IN_RENDERERS, BUILT_IN_TEMPLATES } from "../content-templates";
import type { TemplateRendererFn } from "../types";
import { PresetRegistry } from "./preset-registry";
import { TemplateRegistry } from "./template-registry";
import { TemplateRenderer, type RenderOptions } from "./template-renderer";

export interface CoreOptions {
  localize(key: string): string;
  newInstanceId(): string;
  /** Additional renderers keyed by renderer id (primarily for tests). */
  extraRenderers?: Readonly<Record<string, TemplateRendererFn>>;
}

export interface LoreframeCore {
  readonly templates: TemplateRegistry;
  readonly presets: PresetRegistry;
  readonly renderer: TemplateRenderer;
  /** Render a template as a new instance. */
  renderNew(templateId: string, options?: Omit<RenderOptions, "instanceId">): string;
}

/** Wire the template engine. Foundry-independent: runtime and tests inject localization and id generation. */
export function createCore(options: CoreOptions): LoreframeCore {
  const renderers = new Map<string, TemplateRendererFn>(BUILT_IN_RENDERERS);
  if (options.extraRenderers) {
    for (const [id, fn] of Object.entries(options.extraRenderers)) renderers.set(id, fn);
  }
  const presets = new PresetRegistry();
  const templates = new TemplateRegistry({
    hasRenderer: (id) => renderers.has(id),
    hasPreset: (id) => presets.has(id),
  });
  const renderer = new TemplateRenderer({
    templates,
    presets,
    getRenderer: (id) => renderers.get(id),
    localize: options.localize,
  });

  for (const preset of BUILT_IN_PRESETS) presets.register(preset);
  for (const definition of BUILT_IN_TEMPLATES) templates.register(definition);

  return {
    templates,
    presets,
    renderer,
    renderNew: (templateId, renderOptions = {}) =>
      renderer.render(templateId, { ...renderOptions, instanceId: options.newInstanceId() }),
  };
}
