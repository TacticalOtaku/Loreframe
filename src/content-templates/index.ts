import type { LoreframeCore } from "../core/loreframe-core";
import type { LoreframeTemplateDefinition, TemplateRendererFn } from "../types";
import {
  CALLOUT_RENDERER,
  calloutRenderer,
  gmNoteDefinition,
  loreDefinition,
  noteDefinition,
  readAloudDefinition,
  secretDefinition,
  warningDefinition,
} from "./basic/callout";
import {
  KEY_VALUE_RENDERER,
  keyValueDefinition,
  keyValueRenderer,
  STATS_RENDERER,
  statsRenderer,
  statsRowDefinition,
  TAGS_RENDERER,
  tagsDefinition,
  tagsRenderer,
} from "./basic/data-blocks";
import { DIVIDER_RENDERER, dividerDefinition, dividerRenderer } from "./basic/divider";
import { HEADING_RENDERER, headingDefinition, headingRenderer } from "./basic/heading";
import {
  HERO_IMAGE_RENDERER,
  heroImageDefinition,
  heroImageRenderer,
  imageTextDefinition,
  MEDIA_RENDERER,
  mediaContentDefinition,
  mediaRenderer,
} from "./basic/media-blocks";
import { GALLERY_RENDERER, galleryDefinition, galleryRenderer } from "./gallery/gallery";
import { LOCATION_RENDERER, locationDefinition, locationRenderer } from "./location/location";
import { WIKI_RENDERER, wikiDefinition, wikiRenderer } from "./wiki/wiki";
import { NPC_RENDERER, npcCardDefinition, npcDossierDefinition, npcRenderer } from "./npc/npc";
import { BUILT_IN_PRESETS } from "./presets";
import {
  QUOTE_RENDERER,
  quoteDefinition,
  quoteRenderer,
  SUBTITLE_RENDERER,
  subtitleDefinition,
  subtitleRenderer,
} from "./basic/text-blocks";
import {
  CARD_GRID_RENDERER,
  cardGridDefinition,
  cardGridRenderer,
  columnDefinitions,
  COLUMNS_RENDERER,
  columnsRenderer,
  HERO_CONTENT_RENDERER,
  heroContentDefinition,
  heroContentRenderer,
} from "./layouts/layouts";

const RENDERERS: [string, TemplateRendererFn][] = [
  [HEADING_RENDERER, headingRenderer],
  [SUBTITLE_RENDERER, subtitleRenderer],
  [DIVIDER_RENDERER, dividerRenderer],
  [QUOTE_RENDERER, quoteRenderer],
  [CALLOUT_RENDERER, calloutRenderer],
  [MEDIA_RENDERER, mediaRenderer],
  [HERO_IMAGE_RENDERER, heroImageRenderer],
  [KEY_VALUE_RENDERER, keyValueRenderer],
  [TAGS_RENDERER, tagsRenderer],
  [STATS_RENDERER, statsRenderer],
  [GALLERY_RENDERER, galleryRenderer],
  [COLUMNS_RENDERER, columnsRenderer],
  [HERO_CONTENT_RENDERER, heroContentRenderer],
  [CARD_GRID_RENDERER, cardGridRenderer],
  [NPC_RENDERER, npcRenderer],
  [LOCATION_RENDERER, locationRenderer],
  [WIKI_RENDERER, wikiRenderer],
];

/** Built-in templates in the order spec §17 lists them; menus and the library follow this order. */
export const BUILT_IN_TEMPLATES: LoreframeTemplateDefinition[] = [
  headingDefinition,
  subtitleDefinition,
  dividerDefinition,
  quoteDefinition,
  readAloudDefinition,
  noteDefinition,
  warningDefinition,
  loreDefinition,
  gmNoteDefinition,
  secretDefinition,
  imageTextDefinition,
  heroImageDefinition,
  keyValueDefinition,
  tagsDefinition,
  statsRowDefinition,
  galleryDefinition,
  ...columnDefinitions,
  heroContentDefinition,
  mediaContentDefinition,
  cardGridDefinition,
  npcCardDefinition,
  npcDossierDefinition,
  locationDefinition,
  wikiDefinition,
];

/** Register Loreframe's own renderers, presets and templates (templates validate both). */
export function registerBuiltIns(core: Pick<LoreframeCore, "renderers" | "presets" | "templates">): void {
  for (const [id, renderer] of RENDERERS) core.renderers.register(id, renderer);
  for (const preset of BUILT_IN_PRESETS) core.presets.register(preset);
  for (const definition of BUILT_IN_TEMPLATES) core.templates.register(definition);
}
