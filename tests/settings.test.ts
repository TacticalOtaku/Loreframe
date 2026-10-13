import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSettings, getSetting } from "../src/core/settings";
import { MODULE_ID, SETTINGS } from "../src/constants";

interface RegisteredSetting {
  scope: string;
  config: boolean;
  type: unknown;
  default: unknown;
}

describe("settings", () => {
  const registered = new Map<string, RegisteredSetting>();
  const register = vi.fn((namespace: string, key: string, data: RegisteredSetting) => {
    registered.set(`${namespace}.${key}`, data);
  });
  const get = vi.fn((namespace: string, key: string) => registered.get(`${namespace}.${key}`)?.default);

  beforeEach(() => {
    registered.clear();
    vi.stubGlobal("game", { settings: { register, get } });
  });

  it("registers every Loreframe setting with the expected scope", () => {
    registerSettings();
    const scopes = Object.fromEntries(
      [...registered].map(([key, data]) => [key.replace(`${MODULE_ID}.`, ""), data.scope]),
    );
    expect(scopes).toEqual({
      [SETTINGS.debug]: "client",
      [SETTINGS.favorites]: "client",
      [SETTINGS.recent]: "client",
      [SETTINGS.enableIntegrations]: "world",
      [SETTINGS.userTemplates]: "user",
    });
  });

  it("hides preference storage from the settings UI", () => {
    registerSettings();
    expect(registered.get(`${MODULE_ID}.${SETTINGS.favorites}`)?.config).toBe(false);
    expect(registered.get(`${MODULE_ID}.${SETTINGS.recent}`)?.config).toBe(false);
    expect(registered.get(`${MODULE_ID}.${SETTINGS.debug}`)?.config).toBe(true);
  });

  it("reads values through game.settings", () => {
    registerSettings();
    expect(getSetting(SETTINGS.favorites)).toEqual([]);
    expect(getSetting(SETTINGS.enableIntegrations)).toBe(true);
  });
});
