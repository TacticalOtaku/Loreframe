import { describe, expect, it } from "vitest";
import { formatLink, isLinkItem, parseLink } from "../src/core/links";
import { resolveValues } from "../src/core/preset-registry";
import type { LoreframeTemplateDefinition } from "../src/types";

describe("formatLink", () => {
  it("writes Foundry's content-link text", () => {
    expect(formatLink({ uuid: "Scene.abc123", label: "Old Harbour" })).toBe(
      "@UUID[Scene.abc123]{Old Harbour}",
    );
    expect(formatLink({ uuid: "Compendium.dnd5e.monsters.Actor.x1", label: "" })).toBe(
      "@UUID[Compendium.dnd5e.monsters.Actor.x1]",
    );
  });

  it("drops a closing brace from linked labels", () => {
    expect(formatLink({ uuid: "JournalEntry.j1", label: "Mill}" })).toBe("@UUID[JournalEntry.j1]{Mill}");
  });

  it("falls back to the plain label when the uuid is missing or malformed", () => {
    expect(formatLink({ uuid: "", label: "Unlinked place" })).toBe("Unlinked place");
    expect(formatLink({ uuid: "Scene.a]{x", label: "Broken" })).toBe("Broken");
    expect(formatLink({ uuid: "Scene a", label: "Spaced" })).toBe("Spaced");
  });
});

describe("parseLink", () => {
  it("reads links with and without labels, and plain text as a label", () => {
    expect(parseLink("@UUID[Scene.abc123]{Old Harbour}")).toEqual({
      uuid: "Scene.abc123",
      label: "Old Harbour",
    });
    expect(parseLink("  @UUID[Actor.a1]  ")).toEqual({ uuid: "Actor.a1", label: "" });
    expect(parseLink("Just a name")).toEqual({ uuid: "", label: "Just a name" });
  });

  it("round-trips formatted links", () => {
    for (const item of [
      { uuid: "Scene.abc", label: "Harbour" },
      { uuid: "JournalEntry.j.JournalEntryPage.p", label: "" },
      { uuid: "", label: "Plain" },
    ]) {
      expect(parseLink(formatLink(item))).toEqual(item);
    }
  });
});

describe("links values", () => {
  const definition: LoreframeTemplateDefinition = {
    id: "place",
    version: 1,
    name: "n",
    category: "locations",
    type: "page",
    renderer: "r",
    fields: [
      {
        id: "poi",
        type: "links",
        label: "l",
        default: [{ uuid: "", label: "Default", note: "" }],
      },
    ],
  };

  it("validates link items", () => {
    expect(isLinkItem({ uuid: "Scene.a", label: "A", note: "" })).toBe(true);
    expect(isLinkItem({ uuid: "Scene.a", label: "A" })).toBe(false);
    expect(isLinkItem({ src: "a.webp", alt: "", caption: "" })).toBe(false);
  });

  it("accepts link lists and copies them; falls back to the default otherwise", () => {
    const poi = [{ uuid: "Scene.a", label: "A", note: "Dock" }];
    const values = resolveValues(definition, null, { poi }, (k) => k);
    expect(values.poi).toEqual(poi);
    expect(values.poi).not.toBe(poi);
    expect(resolveValues(definition, null, { poi: [{ label: "x" }] }, (k) => k).poi).toEqual([
      { uuid: "", label: "Default", note: "" },
    ]);
  });
});

describe("links keep the author's text (0.1.1)", () => {
  it("leaves text that is not a single link exactly as written", () => {
    for (const text of [
      "@UUID[Actor.a1]{Mira} and her [[/r 1d6]] {x}",
      "See [[/check dex]] first",
      "Tom {the} [Brave]",
    ]) {
      expect(formatLink(parseLink(text))).toBe(text);
    }
  });

  it("reads links to a heading of a page", () => {
    expect(parseLink("@UUID[JournalEntry.j.JournalEntryPage.p#old-mill$1]{Mill}")).toEqual({
      uuid: "JournalEntry.j.JournalEntryPage.p#old-mill$1",
      label: "Mill",
    });
  });

  it("only removes the closing brace, which would end a link label early", () => {
    expect(formatLink({ uuid: "Actor.a", label: "The [Old] {Mill}" })).toBe(
      "@UUID[Actor.a]{The [Old] {Mill}",
    );
  });
});
