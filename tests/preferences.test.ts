import { describe, expect, it, vi } from "vitest";
import {
  Preferences,
  RECENT_LIMIT,
  type PreferenceKey,
  type PreferenceStorage,
} from "../src/core/preferences";

function memoryStorage(initial: { favorites?: string[]; recent?: string[] } = {}) {
  const data = { favorites: initial.favorites ?? [], recent: initial.recent ?? [] };
  const storage: PreferenceStorage = {
    get: (key) => data[key],
    set: vi.fn(async (key: PreferenceKey, value: string[]) => {
      data[key] = value;
    }),
  };
  return { data, storage };
}

describe("Preferences", () => {
  it("toggles favorites and reports the new state", async () => {
    const { data, storage } = memoryStorage({ favorites: ["note"] });
    const prefs = new Preferences(storage);
    expect(await prefs.toggleFavorite("heading")).toBe(true);
    expect(data.favorites).toEqual(["note", "heading"]);
    expect(prefs.isFavorite("heading")).toBe(true);
    expect(await prefs.toggleFavorite("note")).toBe(false);
    expect(prefs.favorites()).toEqual(["heading"]);
  });

  it("keeps recent templates newest first, unique and capped", async () => {
    const { data, storage } = memoryStorage({ recent: ["a", "b"] });
    const prefs = new Preferences(storage);
    await prefs.recordUse("b");
    expect(data.recent).toEqual(["b", "a"]);
    for (let i = 0; i < RECENT_LIMIT + 5; i++) await prefs.recordUse(`t${i}`);
    expect(prefs.recent()).toHaveLength(RECENT_LIMIT);
    expect(prefs.recent()[0]).toBe(`t${RECENT_LIMIT + 4}`);
  });

  it("does not write when using the template that is already most recent", async () => {
    const { storage } = memoryStorage({ recent: ["a"] });
    await new Preferences(storage).recordUse("a");
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("returns copies and tolerates malformed stored values", () => {
    const storage: PreferenceStorage = {
      get: (key) =>
        key === "favorites" ? (["ok", 5, null] as unknown as string[]) : (null as unknown as string[]),
      set: async () => undefined,
    };
    const prefs = new Preferences(storage);
    const favorites = prefs.favorites();
    expect(favorites).toEqual(["ok"]);
    favorites.push("mutated");
    expect(prefs.favorites()).toEqual(["ok"]);
    expect(prefs.recent()).toEqual([]);
  });

  it("propagates storage failures", async () => {
    const storage: PreferenceStorage = {
      get: () => [],
      set: async () => {
        throw new Error("disk full");
      },
    };
    await expect(new Preferences(storage).toggleFavorite("x")).rejects.toThrow("disk full");
  });
});

describe("Preferences.forget (0.1.1)", () => {
  it("removes an id from favorites and recent", async () => {
    const data: Record<string, string[]> = { favorites: ["a", "b"], recent: ["b", "c"] };
    const prefs = new Preferences({
      get: (key) => data[key] ?? [],
      set: async (key, value) => {
        data[key] = value;
      },
    });
    await prefs.forget("b");
    expect(data).toEqual({ favorites: ["a"], recent: ["c"] });
    await prefs.forget("missing");
    expect(data).toEqual({ favorites: ["a"], recent: ["c"] });
  });
});
