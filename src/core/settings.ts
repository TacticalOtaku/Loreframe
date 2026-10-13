import { MODULE_ID, SETTINGS } from "../constants";
import { setDebugLogging } from "../utils/logger";

interface SettingValues {
  [SETTINGS.debug]: boolean;
  [SETTINGS.favorites]: string[];
  [SETTINGS.recent]: string[];
  [SETTINGS.enableIntegrations]: boolean;
  [SETTINGS.userTemplates]: unknown[];
}

export type SettingKey = keyof SettingValues;

const DEFINITIONS: { [K in SettingKey]: SettingRegistration & { default: SettingValues[K] } } = {
  [SETTINGS.debug]: {
    name: "LOREFRAME.Settings.Debug.Name",
    hint: "LOREFRAME.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (enabled: boolean) => setDebugLogging(enabled),
  },
  [SETTINGS.favorites]: {
    scope: "client",
    config: false,
    type: Array,
    default: [],
  },
  [SETTINGS.recent]: {
    scope: "client",
    config: false,
    type: Array,
    default: [],
  },
  // "My Templates" belong to the Foundry user and follow them across devices; validated on every read.
  [SETTINGS.userTemplates]: {
    scope: "user",
    config: false,
    type: Array,
    default: [],
  },
  [SETTINGS.enableIntegrations]: {
    name: "LOREFRAME.Settings.EnableIntegrations.Name",
    hint: "LOREFRAME.Settings.EnableIntegrations.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  },
};

export function registerSettings(): void {
  for (const [key, data] of Object.entries(DEFINITIONS)) {
    game.settings.register(MODULE_ID, key, data);
  }
  setDebugLogging(getSetting(SETTINGS.debug));
}

export function getSetting<K extends SettingKey>(key: K): SettingValues[K] {
  // Boundary cast: game.settings.get is untyped; values are constrained by DEFINITIONS above.
  return game.settings.get(MODULE_ID, key) as SettingValues[K];
}
