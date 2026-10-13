import { describe, expect, it } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import {
  blockAt,
  blockVersionState,
  deleteBlockTransaction,
  duplicateBlockTransaction,
  locateBlock,
  movedOutOfBlock,
  readBlockValues,
  rebuildBlockTransaction,
} from "../src/editor/block-document";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

const core = testCore();
const def = (id: string) => core.templates.get(id)!;

function stateOf(html: string): EditorState {
  return EditorState.create({ doc: parseString(html) });
}

function textPos(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text);
  });
  return found;
}

function freshHost(templateId: string, instanceId: string, values: Record<string, unknown>): PMNode {
  return parseString(core.renderer.render(templateId, { instanceId, values })).firstChild!;
}

describe("locating blocks", () => {
  const html = `<p>Intro</p><section class="secret" id="secret-keep">${core.renderer
    .render("gm-note", {
      instanceId: "gm",
      values: { title: "GM", body: "Hidden" },
    })
    .replace(
      /^<section class="secret">|<\/section>$/g,
      "",
    )}</section>${core.renderer.render("two-columns", { instanceId: "cols" })}`;
  const state = stateOf(html);

  it("finds a block by instance id, including its secret wrapper", () => {
    const location = locateBlock(state.doc, "gm")!;
    expect(location.templateId).toBe("gm-note");
    expect(location.host.type.name).toBe("secret");
    expect(location.root.type.name).toBe("aside");
    expect(state.doc.nodeAt(location.hostPos)).toBe(location.host);
    expect(state.doc.nodeAt(location.rootPos)).toBe(location.root);
    expect(locateBlock(state.doc, "missing")).toBeNull();
  });

  it("finds the block around a position, even inside a slot", () => {
    expect(blockAt(state.doc.resolve(textPos(state.doc, "Hidden") + 1))?.instanceId).toBe("gm");
    expect(blockAt(state.doc.resolve(textPos(state.doc, "Intro") + 1))).toBeNull();
    const inSlot = blockAt(state.doc.resolve(textPos(state.doc, "Layout") + 1));
    expect(inSlot?.instanceId).toBe("cols");
    expect(inSlot?.host).toBe(inSlot?.root);
  });
});

describe("readBlockValues", () => {
  it("reads text, image, alt binding and options", () => {
    const state = stateOf(
      core.renderer.render("image-text", {
        instanceId: "it",
        values: { image: "worlds/map.webp", alt: "Old map", side: "right", text: "Body" },
      }),
    );
    const { root } = locateBlock(state.doc, "it")!;
    expect(readBlockValues(root, def("image-text"))).toEqual({
      image: "worlds/map.webp",
      alt: "Old map",
      side: "right",
    });
  });

  it("reads placeholder images as empty and text fields as plain text", () => {
    const state = stateOf(
      core.renderer.render("hero-image", { instanceId: "h", values: { caption: "Dawn" } }),
    );
    const values = readBlockValues(locateBlock(state.doc, "h")!.root, def("hero-image"));
    expect(values.image).toBe("");
    expect(values.caption).toBe("Dawn");
  });

  it("reads an omitted text field as empty, so a cleared value does not fall back to its placeholder", () => {
    const state = stateOf(core.renderer.render("hero-image", { instanceId: "h", values: { caption: "" } }));
    expect(readBlockValues(locateBlock(state.doc, "h")!.root, def("hero-image")).caption).toBe("");
  });

  it("reads gallery items in document order", () => {
    const items = [
      { src: "a.webp", alt: "A", caption: "First" },
      { src: "b.webp", alt: "B", caption: "" },
    ];
    const state = stateOf(
      core.renderer.render("gallery", { instanceId: "g", values: { items, mode: "feature" } }),
    );
    expect(readBlockValues(locateBlock(state.doc, "g")!.root, def("gallery"))).toEqual({
      items,
      mode: "feature",
    });
  });

  it("ignores fields that belong to nested blocks", () => {
    const inner = core.renderer.render("note", { instanceId: "inner", values: { title: "Inner title" } });
    const layout = core.renderer.render("hero-content", { instanceId: "hero", values: { title: "Outer" } });
    const nested = layout.replace(/(data-loreframe-slot="content">)/, `$1${inner}`);
    const state = stateOf(nested);
    expect(readBlockValues(locateBlock(state.doc, "hero")!.root, def("hero-content")).title).toBe("Outer");
  });
});

describe("rebuildBlockTransaction", () => {
  it("applies new property values but keeps the author's rich text and instance id", () => {
    const state = stateOf(
      `<p>a</p>${core.renderer.render("note", { instanceId: "n1", values: { title: "Old", body: "x" } })}<p>b</p>`,
    );
    // The author writes rich content into the body after insertion.
    const withBody = state.apply(state.tr.insertText(" and more", textPos(state.doc, "x") + 1));
    const location = locateBlock(withBody.doc, "n1")!;
    const next = withBody.apply(
      rebuildBlockTransaction(
        withBody,
        location,
        freshHost("note", "n1", { title: "New title" }),
        def("note"),
        pmState,
      ),
    );
    const html = serializeString(next.doc);
    expect(html).toContain(">New title</h4>");
    expect(html).toContain("x and more");
    expect(html).toContain('data-loreframe-instance="n1"');
    expect(html.match(/data-loreframe-template/g)).toHaveLength(1);
  });

  it("keeps slot contents, including nested blocks, when layout options change", () => {
    const inner = core.renderer.render("note", { instanceId: "inner", values: { title: "Kept" } });
    const media = core.renderer
      .render("media-content", { instanceId: "m", values: { side: "left" } })
      .replace(/(data-loreframe-slot="content">)<p>[^<]*<\/p>/, `$1${inner}`);
    const state = stateOf(media);
    const location = locateBlock(state.doc, "m")!;
    const next = state.apply(
      rebuildBlockTransaction(
        state,
        location,
        freshHost("media-content", "m", { side: "right" }),
        def("media-content"),
        pmState,
      ),
    );
    const html = serializeString(next.doc);
    expect(html).toContain('data-loreframe-opt-side="right"');
    expect(html).toContain("loreframe-media--right");
    expect(html).toContain('data-loreframe-instance="inner"');
    expect(html).toContain(">Kept</h4>");
  });

  it("keeps the Foundry secret id and revealed state", () => {
    const gm = core.renderer
      .render("gm-note", { instanceId: "gm", values: { title: "GM" } })
      .replace('<section class="secret">', '<section class="secret revealed" id="secret-keep">');
    const state = stateOf(gm);
    const location = locateBlock(state.doc, "gm")!;
    const next = state.apply(
      rebuildBlockTransaction(
        state,
        location,
        freshHost("gm-note", "gm", { title: "Renamed" }),
        def("gm-note"),
        pmState,
      ),
    );
    const secret = next.doc.firstChild!;
    expect(secret.attrs).toMatchObject({ id: "secret-keep", revealed: true });
    expect(serializeString(next.doc)).toContain(">Renamed</h4>");
  });

  it("replaces gallery items", () => {
    const state = stateOf(core.renderer.render("gallery", { instanceId: "g" }));
    const location = locateBlock(state.doc, "g")!;
    const items = [{ src: "new.webp", alt: "New", caption: "Only" }];
    const next = state.apply(
      rebuildBlockTransaction(state, location, freshHost("gallery", "g", { items }), def("gallery"), pmState),
    );
    expect(readBlockValues(locateBlock(next.doc, "g")!.root, def("gallery")).items).toEqual(items);
  });
});

describe("duplicate and delete", () => {
  it("duplicates a block right after itself with fresh identities", () => {
    const gm = core.renderer
      .render("gm-note", { instanceId: "gm" })
      .replace('<section class="secret">', '<section class="secret" id="secret-a">');
    const state = stateOf(`${gm}<p>After</p>`);
    let n = 0;
    const next = state.apply(
      duplicateBlockTransaction(state, locateBlock(state.doc, "gm")!, () => `copy${++n}`),
    );
    const secrets: string[] = [];
    const ids: string[] = [];
    next.doc.forEach((node) => {
      if (node.type.name === "secret") {
        secrets.push(node.attrs.id as string);
        ids.push(node.firstChild!.attrs._preserve["data-loreframe-instance"] as string);
      }
    });
    expect(secrets).toEqual(["secret-a", "secret-copy1"]);
    expect(ids).toEqual(["gm", "copy2"]);
    expect(next.doc.lastChild!.textContent).toBe("After");
  });

  it("deletes a block with its secret wrapper", () => {
    const gm = core.renderer.render("gm-note", { instanceId: "gm" });
    const state = stateOf(`<p>Before</p>${gm}<p>After</p>`);
    const next = state.apply(deleteBlockTransaction(state, locateBlock(state.doc, "gm")!, pmState));
    expect(serializeString(next.doc)).toBe("<p>Before</p><p>After</p>");
  });

  it("leaves an empty paragraph when the only block is deleted", () => {
    const state = stateOf(core.renderer.render("divider", { instanceId: "d" }));
    const next = state.apply(deleteBlockTransaction(state, locateBlock(state.doc, "d")!, pmState));
    expect(serializeString(next.doc)).toBe("<p></p>");
    expect(() => next.doc.check()).not.toThrow();
    expect(next.selection).toBeInstanceOf(TextSelection);
  });
});

describe("block versions", () => {
  const versioned = () => {
    const c = testCore();
    c.templates.register({
      id: "legacy-note",
      version: 2,
      name: "Legacy",
      category: "blocks",
      type: "block",
      renderer: "callout",
      rendererOptions: { tone: "note" },
      fields: [
        { id: "title", type: "text", label: "t", default: "Title" },
        { id: "body", type: "richText", label: "b", default: "Body" },
      ],
    });
    return c;
  };
  const withVersion = (c: ReturnType<typeof testCore>, version: string) =>
    c.renderer
      .render("legacy-note", { instanceId: "v" })
      .replace('data-loreframe-version="2"', `data-loreframe-version="${version}"`);

  it("tells current, outdated, newer and invalid blocks apart", () => {
    const c = versioned();
    const state = (version: string) =>
      blockVersionState(
        locateBlock(parseString(withVersion(c, version)), "v")!.root,
        c.templates.get("legacy-note")!,
      );
    expect(state("2")).toBe("current");
    expect(state("1")).toBe("outdated");
    expect(state("3")).toBe("newer");
    expect(state("x")).toBe("invalid");
    expect(state("0")).toBe("invalid");
  });

});

describe("rebuild keeps the author's writing (0.1.1)", () => {
  const rebuild = (html: string, id: string, templateId: string, changed: Record<string, unknown> = {}) => {
    const definition = def(templateId);
    const state = stateOf(html);
    const location = locateBlock(state.doc, id)!;
    const values = { ...readBlockValues(location.root, definition), ...changed };
    const tr = rebuildBlockTransaction(
      state,
      location,
      freshHost(templateId, id, values),
      definition,
      pmState,
    );
    return { html: serializeString(state.apply(tr).doc), moved: movedOutOfBlock(tr) };
  };

  it("keeps inline formatting of properties the edit did not change", () => {
    const html = core.renderer
      .render("npc-card", { instanceId: "c", values: { name: "Mira Vell", ancestry: "Elf" } })
      .replace(">Mira Vell</h3>", "><strong>Mira</strong> <em>Vell</em></h3>");
    const out = rebuild(html, "c", "npc-card", { ancestry: "Half-elf", density: "compact" }).html;
    expect(out).toContain("<strong>Mira</strong> <em>Vell</em>");
    expect(out).toContain(">Half-elf</p>");
  });

  it("uses the new plain text when the property itself changed", () => {
    const html = core.renderer
      .render("npc-card", { instanceId: "c", values: { name: "Mira" } })
      .replace(">Mira</h3>", "><strong>Mira</strong></h3>");
    expect(rebuild(html, "c", "npc-card", { name: "Ilmara" }).html).toContain(">Ilmara</h3>");
  });

  it("moves writing that sits outside any field below the block instead of dropping it", () => {
    const html = `<p>Before</p>${core.renderer
      .render("note", { instanceId: "n", values: { title: "Title", body: "Body" } })
      .replace(
        "</h4>",
        "</h4><p>Written after the title</p><ul><li><p>and a list</p></li></ul>",
      )}<p>After</p>`;
    const { html: out, moved } = rebuild(html, "n", "note", { title: "Renamed" });
    expect(moved).toBe(2);
    const block = out.indexOf("</aside>");
    expect(out.indexOf("Written after the title")).toBeGreaterThan(block);
    expect(out.indexOf("and a list")).toBeGreaterThan(block);
    expect(out.indexOf("After")).toBeGreaterThan(out.indexOf("and a list"));
    expect(out).toContain(">Renamed</h4>");
  });

  it("never reports template markup as the author's writing", () => {
    for (const definition of core.templates.list()) {
      const html = core.renderer.render(definition.id, { instanceId: "x" });
      expect(rebuild(html, "x", definition.id).moved, definition.id).toBe(0);
    }
  });

  it("joins a text field the author split in two, so neither half is lost", () => {
    const html = core.renderer
      .render("npc-dossier", { instanceId: "d", values: { role: "Keeper" } })
      .replace(
        /(<p [^>]*data-loreframe-field="role"[^>]*>)Keeper<\/p>/,
        '$1Keeper of</p><p data-loreframe-field="role" class="loreframe-npc__role">the bells</p>',
      );
    const state = stateOf(html);
    expect(readBlockValues(locateBlock(state.doc, "d")!.root, def("npc-dossier")).role).toBe(
      "Keeper of the bells",
    );
    expect(rebuild(html, "d", "npc-dossier", { density: "compact" }).html).toContain(
      ">Keeper of the bells</p>",
    );
  });

  it("keeps link lists with extra structure while the list is unchanged", () => {
    const html = core.renderer
      .render("location", {
        instanceId: "l",
        values: { poi: [{ uuid: "Scene.s", label: "Dock", note: "n" }] },
      })
      .replace(
        '<p class="loreframe-links__note">n</p>',
        '<p class="loreframe-links__note">n</p><ul><li><p>sub item</p></li></ul>',
      );
    const out = rebuild(html, "l", "location", { "info-side": "left" }).html;
    expect(out).toContain("<p>sub item</p>");
  });
});
