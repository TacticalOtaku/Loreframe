import { DATA_ATTR } from "../constants";
import type { EmbedOptions, TemplateValues, TreeElement } from "../types";
import { serializeTree } from "./element-tree";
import type { PresetRegistry } from "./preset-registry";
import { resolveValues } from "./preset-registry";
import type { RendererRegistry } from "./renderer-registry";
import type { TemplateRegistry } from "./template-registry";

export const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const EMBED_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
/** Blocks may embed blocks, but a template cannot (indirectly) embed itself forever. */
const MAX_EMBED_DEPTH = 4;

/** Tags a block root may use: containers the Foundry schema preserves. */
const ROOT_TAGS = new Set(["aside", "div", "section", "article", "header", "footer"]);
const RESERVED_ROOT_ATTRS = new Set<string>([
  DATA_ATTR.template,
  DATA_ATTR.version,
  DATA_ATTR.instance,
  DATA_ATTR.preset,
]);

export interface RenderOptions {
  instanceId: string;
  /** Preset id; defaults to the template's first listed preset. */
  preset?: string | null;
  values?: Readonly<Record<string, unknown>>;
}

export interface TemplateRendererDeps {
  templates: TemplateRegistry;
  presets: PresetRegistry;
  renderers: RendererRegistry;
  localize(key: string): string;
}

/** Renders a registered template into durable semantic HTML (spec §10). */
export class TemplateRenderer {
  readonly #deps: TemplateRendererDeps;

  constructor(deps: TemplateRendererDeps) {
    this.#deps = deps;
  }

  render(templateId: string, options: RenderOptions): string {
    return serializeTree(this.renderTree(templateId, options));
  }

  /** The block as an element tree: its root, or a bare Foundry secret around it for GM-only templates. */
  renderTree(templateId: string, options: RenderOptions, depth = 0): TreeElement {
    if (depth > MAX_EMBED_DEPTH) throw new Error(`Template "${templateId}" is nested too deeply`);
    const { templates, presets, renderers, localize } = this.#deps;
    const definition = templates.get(templateId);
    if (!definition) throw new Error(`Unknown template "${templateId}"`);
    if (!INSTANCE_ID_PATTERN.test(options.instanceId)) {
      throw new Error(`Invalid instance id "${options.instanceId}"`);
    }

    const presetId = options.preset === undefined ? (definition.presets?.[0] ?? null) : options.preset;
    if (presetId !== null && !definition.presets?.includes(presetId)) {
      throw new Error(`Template "${templateId}" does not support preset "${presetId}"`);
    }
    const preset = presetId === null ? null : (presets.get(presetId) ?? null);
    const values: TemplateValues = resolveValues(definition, preset, options.values ?? {}, localize);

    const renderer = renderers.get(definition.renderer);
    if (!renderer) throw new Error(`Renderer "${definition.renderer}" is not available`);
    const embed = (childId: string, embedOptions: EmbedOptions): TreeElement => {
      if (!EMBED_KEY_PATTERN.test(embedOptions.key))
        throw new Error(`Invalid embed key "${embedOptions.key}"`);
      return this.renderTree(
        childId,
        {
          instanceId: `${options.instanceId}-${embedOptions.key}`,
          values: embedOptions.values,
          ...(embedOptions.preset === undefined ? {} : { preset: embedOptions.preset }),
        },
        depth + 1,
      );
    };
    const tree = renderer({ definition, values, preset: presetId, localize, embed });

    if (!ROOT_TAGS.has(tree.tag))
      throw new Error(`Renderer "${definition.renderer}" produced root <${tree.tag}>`);
    for (const name of Object.keys(tree.attrs ?? {})) {
      if (RESERVED_ROOT_ATTRS.has(name) || name.startsWith(DATA_ATTR.optionPrefix)) {
        throw new Error(`Renderer may not set ${name}`);
      }
    }

    const rootAttrs: Record<string, string> = {
      [DATA_ATTR.template]: definition.id,
      [DATA_ATTR.version]: String(definition.version),
      [DATA_ATTR.instance]: options.instanceId,
    };
    if (presetId !== null) rootAttrs[DATA_ATTR.preset] = presetId;
    // Option values live on the root so the inspector can read them back (spec §10: data-* for semantics).
    for (const field of definition.fields ?? []) {
      const value = values[field.id];
      if ((field.type === "select" || field.type === "boolean") && value !== undefined) {
        rootAttrs[`${DATA_ATTR.optionPrefix}${field.id}`] = String(value);
      }
    }

    const root: TreeElement = {
      ...tree,
      classes: [
        ...new Set([
          "loreframe-block",
          `loreframe-${definition.id}`,
          ...(presetId === null ? [] : [`loreframe-preset--${presetId}`]),
          ...(tree.classes ?? []),
        ]),
      ],
      attrs: { ...rootAttrs, ...tree.attrs },
    };
    // Foundry's reveal toggle (client/applications/elements/secret-block.mjs) rewrites the secret's opening tag,
    // so the secret is a bare wrapper outside the block root. ProseMirror assigns its id while parsing.
    return definition.secret ? { tag: "section", secret: true, children: [root] } : root;
  }
}
