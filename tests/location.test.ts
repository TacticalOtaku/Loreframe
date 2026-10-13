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
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const core = testCore();
const def = () => core.templates.get("location")!;

function dom(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const field = (root: ParentNode, name: string) =>
  root.querySelector(`[data-loreframe-template=location] [data-loreframe-field="${name}"]`);

const render = (values: Record<string, unknown> = {}) =>
  core.renderer.render("location", { instanceId: "loc", values });

describe("Location template", () => {
  it("is a page structure with presets, a gallery slot and the name as focus", () => {
    expect(def()).toMatchObject({
      category: "locations",
      type: "page",
      focusField: "name",
      slots: ["gallery"],
      presets: ["editorial", "minimal", "arcane"],
    });
  });

  it("renders the spec §21 structure in order", () => {
    const root = dom(render());
    const own = [...root.querySelectorAll("[data-loreframe-field], [data-loreframe-slot]")]
      .filter(
        (el) =>
          el.closest("[data-loreframe-template]")?.getAttribute("data-loreframe-template") === "location",
      )
      .map(
        (el) => el.getAttribute("data-loreframe-field") ?? `slot:${el.getAttribute("data-loreframe-slot")}`,
      );
    expect(own).toEqual([
      "image",
      "name",
      "kind",
      "region",
      "summary",
      "type",
      "population",
      "government",
      "climate",
      "danger",
      "description",
      "map",
      "poi",
      "npcs",
      "factions",
      "rumours",
      "secrets",
      "slot:gallery",
    ]);
    expect(field(root, "name")!.tagName).toBe("H2");
    expect(root.querySelector("section:not(.secret)")).toBeNull();
  });

  it("composes a real Gallery block inside its gallery slot", () => {
    const root = dom(render());
    const gallery = root.querySelector("[data-loreframe-slot=gallery] > [data-loreframe-template=gallery]")!;
    expect(gallery.getAttribute("data-loreframe-instance")).toBe("loc-gallery");
    const doc = parseString(render());
    expect(locateBlock(doc, "loc-gallery")?.templateId).toBe("gallery");
  });

  it("writes Foundry content links with notes, omitting empty notes", () => {
    const root = dom(
      render({
        poi: [
          { uuid: "Scene.s1", label: "Old Harbour", note: "Smugglers dock at night" },
          { uuid: "", label: "Lighthouse", note: "" },
        ],
      }),
    );
    const items = [...field(root, "poi")!.querySelectorAll("li")].map((li) =>
      [...li.querySelectorAll("p")].map((p) => p.textContent),
    );
    expect(items).toEqual([["@UUID[Scene.s1]{Old Harbour}", "Smugglers dock at night"], ["Lighthouse"]]);
  });

  it("shows sample entries in new pages and drops empty lists and info rows", () => {
    expect(field(dom(render()), "npcs")!.querySelectorAll("li")).toHaveLength(1);
    const root = dom(render({ npcs: [], factions: [], population: "", climate: "" }));
    expect(field(root, "npcs")).toBeNull();
    expect(root.querySelector(".loreframe-location__section--npcs")).toBeNull();
    expect(field(root, "population")).toBeNull();
    expect(field(root, "type")).not.toBeNull();
    const noInfo = dom(render({ type: "", population: "", government: "", climate: "", danger: "" }));
    expect(noInfo.querySelector(".loreframe-location__info")).toBeNull();
  });

  it("places the info block right, left or full width", () => {
    for (const side of ["right", "left", "full"]) {
      const root = dom(render({ "info-side": side })).firstElementChild!;
      expect(root.classList).toContain(`loreframe-location--info-${side}`);
    }
  });

  it("drops switched-off regions only, including the gallery slot", () => {
    const root = dom(
      render({
        "show-summary": false,
        "show-map": false,
        "show-rumours": false,
        "show-secrets": false,
        "show-gallery": false,
      }),
    );
    for (const id of ["summary", "map", "rumours", "secrets"]) expect(field(root, id), id).toBeNull();
    expect(root.querySelector("[data-loreframe-slot=gallery]")).toBeNull();
    expect(root.querySelector("[data-loreframe-template=gallery]")).toBeNull();
    expect(root.querySelector("section.secret")).toBeNull();
    const toggles = def()
      .fields!.filter((f) => f.type === "boolean")
      .map((f) => f.id);
    expect(toggles).toEqual(["show-summary", "show-map", "show-rumours", "show-secrets", "show-gallery"]);
  });
});

describe("Location values", () => {
  it("reads links back from the document, and an absent list as empty", () => {
    const poi = [{ uuid: "Scene.s1", label: "Old Harbour", note: "Dock" }];
    const doc = parseString(render({ poi, npcs: [] }));
    const values = readBlockValues(locateBlock(doc, "loc")!.root, def());
    expect(values.poi).toEqual(poi);
    expect(values.npcs).toEqual([]);
    expect(values.factions).toHaveLength(1);
  });

  it("reads links the author typed directly in the Journal", () => {
    const html = render({ poi: [{ uuid: "", label: "A", note: "" }] }).replace(
      /(<li class="loreframe-links__item">)<p class="loreframe-links__link">A<\/p>/,
      '$1<p class="loreframe-links__link">@UUID[JournalEntry.j1]{Archive}</p><p>Dusty</p>',
    );
    const values = readBlockValues(locateBlock(parseString(html), "loc")!.root, def());
    expect(values.poi).toEqual([{ uuid: "JournalEntry.j1", label: "Archive", note: "Dusty" }]);
  });

  it("keeps the embedded gallery and written text when options change", () => {
    const html = render().replace(
      /(data-loreframe-field="rumours"[^>]*>)<p>[^<]*<\/p>/,
      "$1<p>Ghost ships</p>",
    );
    const state = EditorState.create({ doc: parseString(html) });
    const withImage = state.apply(
      state.tr.setNodeMarkup(imagePos(state.doc), undefined, { src: "worlds/a.webp", alt: "A" }),
    );
    const location = locateBlock(withImage.doc, "loc")!;
    const values: TemplateValues = { ...readBlockValues(location.root, def()), "info-side": "left" };
    const fresh = parseString(core.renderer.render("location", { instanceId: "loc", values })).firstChild!;
    const next = withImage.apply(rebuildBlockTransaction(withImage, location, fresh, def(), pmState));
    const out = serializeString(next.doc);
    expect(out).toContain("loreframe-location--info-left");
    expect(out).toContain("Ghost ships");
    expect(out).toContain('src="worlds/a.webp"');
  });

  it("detects written regions structurally: text, replaced images, not fresh secrets or untouched galleries", () => {
    const fresh = locateBlock(parseString(render()), "loc")!.root;
    const untouched = locateBlock(parseString(render()), "loc")!.root;
    expect(writtenRegions(untouched, fresh, def())).toEqual([]);

    const state = EditorState.create({ doc: parseString(render()) });
    const edited = state.apply(
      state.tr.setNodeMarkup(imagePos(state.doc), undefined, { src: "w/b.webp", alt: "" }),
    );
    expect(writtenRegions(locateBlock(edited.doc, "loc")!.root, fresh, def())).toEqual(["gallery"]);

    const mapPos = imagePos(state.doc, "map");
    const map = state.apply(state.tr.setNodeMarkup(mapPos, undefined, { src: "w/map.webp", alt: "" }));
    expect(writtenRegions(locateBlock(map.doc, "loc")!.root, fresh, def())).toEqual(["map"]);

    const cleared = render().replace(/(data-loreframe-field="rumours"[^>]*>)<p>[^<]*<\/p>/, "$1<p></p>");
    expect(writtenRegions(locateBlock(parseString(cleared), "loc")!.root, fresh, def())).toEqual([]);
  });
});

/** Position of the first image inside the named field (default: the embedded gallery). */
function imagePos(doc: ReturnType<typeof parseString>, fieldName?: string): number {
  let found = -1;
  let inside = false;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    const attrs = node.attrs._preserve as Record<string, string> | undefined;
    if (fieldName && attrs?.["data-loreframe-field"] === fieldName) inside = true;
    if (!fieldName && attrs?.["data-loreframe-template"] === "gallery") inside = true;
    if (inside && node.type.name === "image") found = pos;
    return true;
  });
  return found;
}
