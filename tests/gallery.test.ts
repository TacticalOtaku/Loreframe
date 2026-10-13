import { describe, expect, it } from "vitest";
import { GALLERY_MODES } from "../src/content-templates/gallery/gallery";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

function root(html: string): Element {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild!;
}

const items = [
  { src: "worlds/a.webp", alt: "Harbour at dawn", caption: "The harbour" },
  { src: "worlds/b.webp", alt: "Lighthouse", caption: "" },
];

describe("gallery template", () => {
  it("renders every item as a figure with image, alt text and optional caption", () => {
    const core = testCore();
    const el = root(core.renderer.render("gallery", { instanceId: "g1", values: { items } }));
    const figures = [...el.querySelectorAll('[data-loreframe-field="items"] > figure')];
    expect(figures).toHaveLength(2);
    expect(figures[0]!.querySelector("img")?.getAttribute("src")).toBe("worlds/a.webp");
    expect(figures[0]!.querySelector("img")?.getAttribute("alt")).toBe("Harbour at dawn");
    expect(figures[0]!.querySelector("figcaption")?.textContent).toBe("The harbour");
    // figcaption is inline+ in Foundry's schema: an empty caption is omitted, not rendered empty.
    expect(figures[1]!.querySelector("figcaption")).toBeNull();
  });

  it("stores the mode as an option and a class", () => {
    const core = testCore();
    for (const mode of GALLERY_MODES) {
      const el = root(core.renderer.render("gallery", { instanceId: "g1", values: { mode } }));
      expect(el.getAttribute("data-loreframe-opt-mode")).toBe(mode);
      expect(el.classList.contains(`loreframe-gallery--${mode}`)).toBe(true);
    }
  });

  it("starts with localized placeholder images", () => {
    const core = testCore({ localize: (key) => `‹${key}›` });
    const el = root(core.renderer.render("gallery", { instanceId: "g1" }));
    const images = [...el.querySelectorAll("img")];
    expect(images.length).toBeGreaterThanOrEqual(3);
    expect(images.every((img) => img.getAttribute("src")?.endsWith("placeholders/image.svg"))).toBe(true);
    expect(images[0]!.getAttribute("alt")).toBe("‹LOREFRAME.Template.Gallery.PlaceholderAlt›");
  });

  it("keeps items, captions and alt text through the ProseMirror schema", () => {
    const core = testCore();
    const html = core.renderer.render("gallery", { instanceId: "g1", values: { items, mode: "feature" } });
    const once = serializeString(parseString(html));
    expect(serializeString(parseString(once))).toBe(once);
    expect(once).toContain('<img src="worlds/a.webp" alt="Harbour at dawn"><figcaption');
    expect(once).toContain(">The harbour</figcaption>");
    expect(once).toContain('data-loreframe-opt-mode="feature"');
  });
});
