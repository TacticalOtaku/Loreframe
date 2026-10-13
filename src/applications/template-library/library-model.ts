import type {
  LoreframePresetDefinition,
  LoreframeTemplateCategory,
  LoreframeTemplateDefinition,
} from "../../types";

export type LibraryCategoryId = "all" | "favorites" | "recent" | "mine" | LoreframeTemplateCategory;

export interface LibraryState {
  category: LibraryCategoryId;
  query: string;
  selectedId: string | null;
  /** Preset chosen in the preview; kept across templates that offer it. */
  preset: string | null;
}

export interface LibraryCategory {
  id: LibraryCategoryId;
  /** Localization key. */
  label: string;
  icon: string;
  count: number;
  active: boolean;
}

export interface LibraryCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Optional preview image path from the definition. */
  thumbnail: string | null;
  favorite: boolean;
  systemBadge: string | null;
  selected: boolean;
  /** Normalized text the search matches against. */
  searchText: string;
  /** Rendered template markup; only filled for the selected card. */
  previewHtml: string;
  previewError: boolean;
  /** A user template ("My Templates"). */
  mine: boolean;
  /** Localized name of the template the card inserts. */
  baseName: string;
}

/** A user template as the library shows it (see core/user-templates.ts). */
export interface LibraryUserTemplate {
  id: string;
  name: string;
  description: string;
  base: LoreframeTemplateDefinition;
  preset: string | null;
}

interface Entry {
  id: string;
  definition: LoreframeTemplateDefinition;
  name: string;
  description: string;
  mine: boolean;
  preset: string | null | undefined;
}

export type LibraryEmptyState = "favorites" | "recent" | "mine" | "category";
const EMPTY_STATES = new Set<LibraryCategoryId>(["favorites", "recent", "mine"]);

export interface LibraryModel {
  categories: LibraryCategory[];
  cards: LibraryCard[];
  selected: LibraryCard | null;
  empty: LibraryEmptyState | null;
  canInsert: boolean;
  /** Preset select for the selected template, or null when it has fewer than two presets. */
  presets: { value: string; options: { value: string; label: string }[] } | null;
  /** The preset the selected template previews and inserts with (null: none). */
  preset: string | null;
}

export interface LibraryModelInput {
  /** Templates available in this world (already filtered by game system). */
  templates: readonly LoreframeTemplateDefinition[];
  favorites: readonly string[];
  recent: readonly string[];
  state: LibraryState;
  localize(key: string): string;
  /** Rendered preview markup, or null when rendering failed (the caller logs the failure). */
  renderPreview(templateId: string, preset?: string): string | null;
  /** Presets a template supports, in display order. */
  presetsFor(definition: LoreframeTemplateDefinition): readonly LoreframePresetDefinition[];
  /** Whether an editable editor is available as insertion target. */
  canInsert: boolean;
  /** "My Templates", already filtered to those whose base template is available. */
  userTemplates?: readonly LibraryUserTemplate[];
}

const FIXED_CATEGORIES: Omit<LibraryCategory, "count" | "active">[] = [
  { id: "all", label: "LOREFRAME.Library.Category.All", icon: "fa-solid fa-border-all" },
  { id: "favorites", label: "LOREFRAME.Library.Category.Favorites", icon: "fa-solid fa-star" },
  { id: "recent", label: "LOREFRAME.Library.Category.Recent", icon: "fa-solid fa-clock-rotate-left" },
  { id: "mine", label: "LOREFRAME.Library.Category.Mine", icon: "fa-solid fa-user-pen" },
];

const TEMPLATE_CATEGORIES: Record<LoreframeTemplateCategory, { label: string; icon: string }> = {
  blocks: { label: "LOREFRAME.Library.Category.Blocks", icon: "fa-solid fa-square" },
  layouts: { label: "LOREFRAME.Library.Category.Layouts", icon: "fa-solid fa-table-columns" },
  npc: { label: "LOREFRAME.Library.Category.NPC", icon: "fa-solid fa-user" },
  locations: { label: "LOREFRAME.Library.Category.Locations", icon: "fa-solid fa-map-location-dot" },
  wiki: { label: "LOREFRAME.Library.Category.Wiki", icon: "fa-solid fa-book-open" },
  gallery: { label: "LOREFRAME.Library.Category.Gallery", icon: "fa-solid fa-images" },
  campaign: { label: "LOREFRAME.Library.Category.Campaign", icon: "fa-solid fa-flag" },
  system: { label: "LOREFRAME.Library.Category.System", icon: "fa-solid fa-dice-d20" },
};

const DEFAULT_ICON = "fa-solid fa-shapes";

export function buildLibraryModel(input: LibraryModelInput): LibraryModel {
  const { templates, state, localize } = input;
  const favorites = new Set(input.favorites);

  // One entry per card: a registered template, or a user variant of one.
  const builtIn = templates.map((definition): Entry => ({
    id: definition.id,
    definition,
    name: localize(definition.name),
    description: definition.description ? localize(definition.description) : "",
    mine: false,
    preset: undefined,
  }));
  const mine = (input.userTemplates ?? []).map((template): Entry => {
    const baseName = localize(template.base.name);
    return {
      id: template.id,
      definition: template.base,
      name: template.name,
      description: template.description || baseName,
      mine: true,
      preset: template.preset,
    };
  });
  const all = [...builtIn, ...mine];
  const byId = new Map(all.map((entry) => [entry.id, entry]));

  const members: Record<string, readonly Entry[]> = {
    all,
    favorites: all.filter((entry) => favorites.has(entry.id)),
    recent: input.recent.flatMap((id) => byId.get(id) ?? []),
    mine,
  };
  for (const category of Object.keys(TEMPLATE_CATEGORIES)) {
    members[category] = builtIn.filter((entry) => entry.definition.category === category);
  }

  const categories: LibraryCategory[] = [
    ...FIXED_CATEGORIES,
    ...Object.entries(TEMPLATE_CATEGORIES)
      .filter(([id]) => members[id]?.length)
      .map(([id, meta]) => ({ id: id as LoreframeTemplateCategory, ...meta })),
  ].map((category) => ({
    ...category,
    count: members[category.id]?.length ?? 0,
    active: category.id === state.category,
  }));

  const cards = (members[state.category] ?? []).map((entry): LibraryCard => {
    const { definition } = entry;
    const baseName = localize(definition.name);
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      icon: definition.icon ?? DEFAULT_ICON,
      thumbnail: definition.thumbnail ?? null,
      favorite: favorites.has(entry.id),
      systemBadge: definition.system ?? null,
      selected: false,
      mine: entry.mine,
      baseName,
      searchText: normalize(
        [
          entry.name,
          entry.description,
          baseName,
          definition.description ? localize(definition.description) : "",
          ...(definition.tags ?? []),
          ...(definition.aliases ?? []),
          definition.id,
          localize(TEMPLATE_CATEGORIES[definition.category].label),
        ].join(" "),
      ),
      previewHtml: "",
      previewError: false,
    };
  });

  // Selection is always a card the user can see: it must match the current query.
  const matching = cards.filter((card) => matchesQuery(card.searchText, state.query));
  const selected = matching.find((card) => card.id === state.selectedId) ?? matching[0] ?? null;
  const entry = selected ? byId.get(selected.id) : undefined;
  // A user variant brings its own preset; built-in templates offer a choice.
  const available = entry && !entry.mine ? input.presetsFor(entry.definition) : [];
  const preset = entry?.mine
    ? (entry.preset ?? null)
    : (available.find((p) => p.id === state.preset)?.id ?? available[0]?.id ?? null);
  if (selected) {
    selected.selected = true;
    const html = input.renderPreview(selected.id, preset ?? undefined);
    selected.previewHtml = html ?? "";
    selected.previewError = html === null;
  }

  let empty: LibraryEmptyState | null = null;
  if (!cards.length)
    empty = EMPTY_STATES.has(state.category) ? (state.category as LibraryEmptyState) : "category";

  return {
    categories,
    cards,
    selected,
    empty,
    canInsert: input.canInsert,
    presets:
      available.length > 1 && preset !== null
        ? { value: preset, options: available.map((p) => ({ value: p.id, label: p.name })) }
        : null,
    preset,
  };
}

/** Whether every whitespace-separated term of `query` occurs in `searchText`. */
export function matchesQuery(searchText: string, query: string): boolean {
  const haystack = normalize(searchText);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
