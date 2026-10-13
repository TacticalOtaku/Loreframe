import { describe, expect, it } from "vitest";
import manifest from "../module.json";
import en from "../lang/en.json";
import ru from "../lang/ru.json";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("module manifest", () => {
  it("targets Foundry VTT 14.367", () => {
    expect(manifest.id).toBe("loreframe");
    expect(manifest.compatibility).toEqual({ minimum: "14", verified: "14.367", maximum: "14" });
    expect(manifest.esmodules).toEqual(["scripts/loreframe.js"]);
    expect(manifest.styles).toEqual(["styles/loreframe.css"]);
  });
});

describe("localisation", () => {
  it("has the same keys in English and Russian", () => {
    expect(flattenKeys(ru).sort()).toEqual(flattenKeys(en).sort());
  });

  it("has no empty strings", () => {
    const values = [en, ru].flatMap((lang) =>
      flattenKeys(lang).map((key) =>
        key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang),
      ),
    );
    expect(values.every((v) => typeof v === "string" && v.trim().length > 0)).toBe(true);
  });
});
