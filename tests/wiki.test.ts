import { describe, expect, it } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState } from "prosemirror-state";
import {
  locateBlock,
  readBlockValues,
  rebuildBlockTransaction,
  writtenRegions,
} from "../src/editor/block-document";
import type { TemplateValues } from "../src/types";
import { enhanceArticleContents } from "../src/view/article-contents";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const core = testCore();
const def = () => core.templates.get("wiki-article")!;
const render = (values: Record<string, unknown> = {}) =>
  core.renderer.render("wiki-article", { instanceId: "w", values });

function dom(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const field = (root: ParentNode, name: string) => root.querySelector(`[data-loreframe-field="${name}"]`);

describe("Wiki article template", () => {
  it("is a page structure with an article slot, presets and the title as focus", () => {
    expect(def()).toMatchObject({
      category: "wiki",
      type: "page",
      focusField: "title",
      slots: ["article"],
      presets: ["editorial", "minimal", "arcane"],
    });
  });

  it("renders the spec §19 structure in order", () => {
    const root = dom(render());
    const order = [
      ...root.querySelectorAll("[data-loreframe-field], [data-loreframe-slot], [data-loreframe-contents]"),
    ].map(
      (el) =>
        el.getAttribute("data-loreframe-field") ??
        (el.hasAttribute("data-loreframe-contents")
          ? "contents"
          : `slot:${el.getAttribute("data-loreframe-slot")}`),
    );
    expect(order).toEqual([
      "title",
      "subtitle",
      "image",
      "type",
      "region",
      "alignment",
      "population",
      "facts",
      "intro",
      "contents",
      "slot:article",
      "related",
    ]);
    expect(field(root, "title")!.tagName).toBe("H2");
    const nav = root.querySelector("nav")!;
    expect(nav.querySelector("h4")?.hasAttribute("data-no-toc")).toBe(true);
    // Only the label is content; the editor hint lives in an attribute.
    expect(nav.children).toHaveLength(1);
    expect(nav.getAttribute("data-loreframe-hint")).toBe("Contents");
    expect(root.querySelector("section")).toBeNull();
  });

  it("starts the article with sample sections that feed the contents box", () => {
    const root = dom(render());
    const article = root.querySelector<HTMLElement>("[data-loreframe-slot=article]")!;
    expect([...article.querySelectorAll("h3")].map((h) => h.hasAttribute("data-no-toc"))).toEqual([
      false,
      false,
    ]);
    document.body.append(root);
    enhanceArticleContents(root, (k) => k);
    expect(root.querySelectorAll("nav button")).toHaveLength(2);
    root.remove();
  });

  it("keeps custom infobox rows in an editable table and omits empty fixed rows", () => {
    const root = dom(render({ alignment: "", population: "" }));
    expect(field(root, "facts")!.tagName).toBe("TABLE");
    expect(field(root, "alignment")).toBeNull();
    expect(field(root, "type")).not.toBeNull();
    const none = dom(render({ type: "", region: "", alignment: "", population: "" }));
    expect(none.querySelector(".loreframe-wiki__rows")).toBeNull();
    expect(field(none, "facts")).not.toBeNull();
  });

  it("places the infobox right, left, full width or hidden — hidden keeps it in the document", () => {
    for (const placement of ["right", "left", "full", "hidden"]) {
      const root = dom(render({ infobox: placement }));
      expect(root.firstElementChild!.classList).toContain(`loreframe-wiki--infobox-${placement}`);
      expect(root.querySelector(".loreframe-wiki__infobox")).not.toBeNull();
    }
  });

  it("switches off the intro and the contents box, and drops empty related entries", () => {
    const root = dom(render({ "show-intro": false, "show-contents": false, related: [] }));
    expect(field(root, "intro")).toBeNull();
    expect(root.querySelector("[data-loreframe-contents]")).toBeNull();
    expect(root.querySelector(".loreframe-wiki__related")).toBeNull();
    expect(root.querySelector("[data-loreframe-slot=article]")).not.toBeNull();
  });

  it("round-trips related links and keeps the article when options change", () => {
    const related = [{ uuid: "JournalEntry.j1", label: "The Old Mill", note: "" }];
    const html = render({ related }).replace(
      /(data-loreframe-slot="article"[^>]*>)/,
      "$1<h3>Written section</h3><p>Long text</p>",
    );
    const state = EditorState.create({ doc: parseString(html) });
    const location = locateBlock(state.doc, "w")!;
    const values: TemplateValues = { ...readBlockValues(location.root, def()), infobox: "left" };
    expect(values.related).toEqual(related);
    const fresh = parseString(core.renderer.render("wiki-article", { instanceId: "w", values })).firstChild!;
    const next = state.apply(rebuildBlockTransaction(state, location, fresh, def(), pmState));
    const out = serializeString(next.doc);
    expect(out).toContain("loreframe-wiki--infobox-left");
    expect(out).toContain("<h3>Written section</h3>");
    expect(
      writtenRegions(locateBlock(next.doc, "w")!.root, locateBlock(parseString(render()), "w")!.root, def()),
    ).toEqual(["article"]);
  });
});
