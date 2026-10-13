import { registerBuiltIns } from "../content-templates";
import type { ParsedBlock } from "../types";
import { PresetRegistry } from "./preset-registry";
import { RendererRegistry } from "./renderer-registry";
import { TemplateRegistry } from "./template-registry";
import { parseBlocks } from "./template-parser";
import { TemplateRenderer, type RenderOptions } from "./template-renderer";

export interface CoreOptions {
  localize(key: string): string;
  newInstanceId(): string;
}

export interface LoreframeCore {
  readonly templates: TemplateRegistry;
  readonly presets: PresetRegistry;
  readonly renderers: RendererRegistry;
  readonly renderer: TemplateRenderer;
  /** Render a template as a new instance. */
  renderNew(templateId: string, options?: Omit<RenderOptions, "instanceId">): string;
  /** Identify Loreframe blocks in rendered or stored HTML. */
  parse(root: Element | DocumentFragment): ParsedBlock[];
}

/** Wire the template engine. Foundry-independent: runtime and tests inject localization and id generation. */
export function createCore(options: CoreOptions): LoreframeCore {
  const renderers = new RendererRegistry();
  const presets = new PresetRegistry();
  const templates = new TemplateRegistry({
    hasRenderer: (id) => renderers.has(id),
    hasPreset: (id) => presets.has(id),
  });
  const renderer = new TemplateRenderer({ templates, presets, renderers, localize: options.localize });

  const core: LoreframeCore = {
    templates,
    presets,
    renderers,
    renderer,
    parse: (root) => parseBlocks(root, templates),
    renderNew: (templateId, renderOptions = {}) =>
      renderer.render(templateId, { ...renderOptions, instanceId: options.newInstanceId() }),
  };
  registerBuiltIns(core);
  return core;
}
