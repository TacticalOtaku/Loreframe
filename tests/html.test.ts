import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/utils/html";

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("returns an empty string for nullish values", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("stringifies numbers", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});
