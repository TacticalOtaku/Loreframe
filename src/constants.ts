export const MODULE_ID = "loreframe";

/** Prefix for every Loreframe log line. */
export const LOG_PREFIX = "Loreframe |";

export const SETTINGS = {
  debug: "debug",
  favorites: "favorites",
  recent: "recent",
  enableIntegrations: "enableIntegrations",
  userTemplates: "userTemplates",
} as const;

/** Data attributes that carry Loreframe semantics in Journal HTML (spec §10). */
export const DATA_ATTR = {
  template: "data-loreframe-template",
  version: "data-loreframe-version",
  instance: "data-loreframe-instance",
  field: "data-loreframe-field",
  preset: "data-loreframe-preset",
  /** Region of a block that accepts other blocks (e.g. a layout column). */
  slot: "data-loreframe-slot",
  /** Prefix of root attributes that store select/boolean field values, e.g. data-loreframe-opt-side. */
  optionPrefix: "data-loreframe-opt-",
  /** Empty contents box that view mode fills from an article's headings. */
  contents: "data-loreframe-contents",
} as const;
