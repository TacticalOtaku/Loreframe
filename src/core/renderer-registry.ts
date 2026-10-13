import type { TemplateRendererFn } from "../types";

/**
 * Built-in renderers, addressed by id from template definitions. Not exposed through the public API:
 * third-party templates are data that reuse these renderers (spec §9, §33).
 */
export class RendererRegistry {
  readonly #renderers = new Map<string, TemplateRendererFn>();

  register(id: string, renderer: TemplateRendererFn): void {
    if (this.#renderers.has(id)) throw new Error(`Renderer "${id}" is already registered`);
    this.#renderers.set(id, renderer);
  }

  has(id: string): boolean {
    return this.#renderers.has(id);
  }

  get(id: string): TemplateRendererFn | undefined {
    return this.#renderers.get(id);
  }
}
