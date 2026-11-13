import type { EditorView } from "prosemirror-view";
import type { TemplateCatalog } from "../core/template-catalog";
import type { LoreframeTemplateDefinition, LoreframeTemplateType } from "../types";
import { escapeHtml } from "../utils/html";

/** Key of the Loreframe entry in the `menus` record passed to `getProseMirrorMenuDropDowns`. */
export const DROPDOWN_KEY = "loreframe";
/** Shortcut groups stay short; the Template Library holds the full catalogue (spec §13). */
export const MENU_SHORTCUT_LIMIT = 8;

/** Menu groups by template type. */
const TYPE_GROUPS: { type: LoreframeTemplateType; title: string }[] = [
  { type: "block", title: "LOREFRAME.Editor.QuickBlocks" },
  { type: "layout", title: "LOREFRAME.Editor.Layouts" },
  { type: "page", title: "LOREFRAME.Editor.Structures" },
];

export type MenuCatalog = Pick<
  TemplateCatalog,
  "availableTemplates" | "availableUserTemplates" | "favorites" | "recent"
>;

export interface MenuDeps {
  catalog: MenuCatalog;
  /** Insert a template or a user template by id. */
  insert(view: EditorView, templateId: string): boolean;
  /** Open the Template Library targeting this editor. */
  openLibrary(view: EditorView): void;
}

interface MenuItem {
  id: string;
  title: string;
}

/**
 * Build the single Loreframe editor dropdown (spec §13): Favorites, Recent, template groups, library.
 * Foundry resolves actions across all dropdowns, so every action is prefixed with `loreframe-`.
 * Foundry builds dropdowns once per editor, so shortcut groups reflect catalog state at editor creation.
 */
export function buildLoreframeDropdown(deps: MenuDeps): ProseMirrorDropDownConfig {
  const available = deps.catalog.availableTemplates();
  // Foundry renders entry titles as HTML (common/prosemirror/dropdown.mjs): user-given names are escaped; template
  // names are localization keys.
  const shortcuts = new Map<string, MenuItem>([
    ...available.map((t): [string, MenuItem] => [t.id, { id: t.id, title: t.name }]),
    ...deps.catalog
      .availableUserTemplates()
      .map((t): [string, MenuItem] => [t.id, { id: t.id, title: escapeHtml(t.name) }]),
  ]);
  const pick = (ids: readonly string[]) =>
    ids.flatMap((id) => shortcuts.get(id) ?? []).slice(0, MENU_SHORTCUT_LIMIT);
  const asItem = (definition: LoreframeTemplateDefinition): MenuItem => ({
    id: definition.id,
    title: definition.name,
  });

  const entry = (prefix: string, item: MenuItem): ProseMirrorDropDownEntry => ({
    action: `loreframe-${prefix}-${item.id}`,
    title: item.title,
    cmd: (_state, _dispatch, view) => deps.insert(view, item.id),
  });

  const group = (
    action: string,
    title: string,
    groupIndex: number,
    prefix: string,
    templates: MenuItem[],
  ): ProseMirrorDropDownEntry[] =>
    templates.length
      ? [{ action, title, group: groupIndex, children: templates.map((t) => entry(prefix, t)) }]
      : [];

  return {
    title: "LOREFRAME.Editor.Menu",
    cssClass: DROPDOWN_KEY,
    icon: '<i class="fa-solid fa-scroll fa-fw"></i>',
    entries: [
      ...group(
        "loreframe-group-favorites",
        "LOREFRAME.Editor.Favorites",
        0,
        "favorite",
        pick(deps.catalog.favorites()),
      ),
      ...group("loreframe-group-recent", "LOREFRAME.Editor.Recent", 0, "recent", pick(deps.catalog.recent())),
      ...TYPE_GROUPS.flatMap(({ type, title }) =>
        group(
          `loreframe-group-${type}`,
          title,
          1,
          "insert",
          available.filter((t) => t.type === type).map(asItem),
        ),
      ),
      {
        action: "loreframe-open-library",
        title: "LOREFRAME.Editor.OpenLibrary",
        group: 2,
        cmd: (_state, _dispatch, view) => {
          deps.openLibrary(view);
          return true;
        },
      },
    ],
  };
}
