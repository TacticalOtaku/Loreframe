import { describe, expect, it } from "vitest";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";

function parse(html: string): Element {
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = template.content.firstElementChild;
  if (!root) throw new Error("no root");
  return root;
}

describe("TemplateRenderer", () => {
  it("wraps renderer output in durable root attributes", () => {
    const core = testCore();
    const root = parse(core.renderer.render("note", { instanceId: "abc" }));
    expect(root.tagName).toBe("ASIDE");
    expect([...root.classList]).toEqual([
      "loreframe-block",
      "loreframe-note",
      "loreframe-callout",
      "loreframe-callout--note",
    ]);
    expect(root.getAttribute("data-loreframe-template")).toBe("note");
    expect(root.getAttribute("data-loreframe-version")).toBe("1");
    expect(root.getAttribute("data-loreframe-instance")).toBe("abc");
    expect(root.hasAttribute("data-loreframe-preset")).toBe(false);
  });

  it("renders localized defaults and explicit values", () => {
    const core = testCore();
    const root = parse(
      core.renderer.render("lore", { instanceId: "a", values: { body: "First\n\nSecond" } }),
    );
    expect(root.querySelector('[data-loreframe-field="title"]')?.textContent).toBe("Lore");
    expect([...root.querySelectorAll('[data-loreframe-field="body"] > p')].map((p) => p.textContent)).toEqual(
      ["First", "Second"],
    );
  });

  it("keeps callout labels out of the page ToC but not heading titles", () => {
    const core = testCore();
    const note = parse(core.renderer.render("note", { instanceId: "a" }));
    const heading = parse(core.renderer.render("heading", { instanceId: "b" }));
    expect(note.querySelector("h4")?.hasAttribute("data-no-toc")).toBe(true);
    expect(heading.querySelector("h2")?.hasAttribute("data-no-toc")).toBe(false);
  });

  it("applies presets as a root class and attribute", () => {
    const core = testCore();
    core.presets.register({ id: "parchment", name: "P", values: { title: "From preset" } });
    const note = core.templates.get("note");
    if (!note) throw new Error("note missing");
    core.templates.register({ ...note, id: "styled-note", presets: ["parchment"] });
    const root = parse(core.renderer.render("styled-note", { instanceId: "a" }));
    expect(root.classList.contains("loreframe-preset--parchment")).toBe(true);
    expect(root.getAttribute("data-loreframe-preset")).toBe("parchment");
    expect(root.querySelector("h4")?.textContent).toBe("From preset");
    expect(() => core.renderer.render("note", { instanceId: "a", preset: "parchment" })).toThrow(/preset/);
    expect(
      parse(core.renderer.render("styled-note", { instanceId: "a", preset: null })).className,
    ).not.toContain("preset");
  });

  it("rejects unknown templates and unsafe instance ids", () => {
    const core = testCore();
    expect(() => core.renderer.render("nope", { instanceId: "a" })).toThrow(/Unknown template/);
    expect(() => core.renderer.render("note", { instanceId: 'a" onclick="x' })).toThrow(/instance/);
  });

  it("does not let renderers override root semantics", () => {
    const core = testCore({
      extraRenderers: {
        evil: () => ({ tag: "div", attrs: { "data-loreframe-template": "other" } }),
        "inline-root": () => ({ tag: "p", children: ["x"] }),
      },
    });
    core.templates.register({
      id: "evil",
      version: 1,
      name: "n",
      category: "blocks",
      type: "block",
      renderer: "evil",
    });
    core.templates.register({
      id: "inline-root",
      version: 1,
      name: "n",
      category: "blocks",
      type: "block",
      renderer: "inline-root",
    });
    expect(() => core.renderer.render("evil", { instanceId: "a" })).toThrow(/may not set/);
    expect(() => core.renderer.render("inline-root", { instanceId: "a" })).toThrow(/root/);
  });

  it("gives every new render a fresh instance id", () => {
    const core = testCore();
    const ids = [core.renderNew("note"), core.renderNew("note")].map((html) =>
      parse(html).getAttribute("data-loreframe-instance"),
    );
    expect(ids).toEqual(["id1", "id2"]);
  });

  it.each(["heading", "note", "lore", "warning", "divider"])(
    "built-in %s survives the ProseMirror schema round trip",
    (id) => {
      const html = testCore().renderer.render(id, { instanceId: "x1" });
      const doc = parseString(html);
      expect(doc.childCount).toBe(1);
      expect(doc.firstChild?.attrs._preserve["data-loreframe-template"]).toBe(id);
      const once = serializeString(doc);
      expect(serializeString(parseString(once))).toBe(once);
      expect(once).toContain('data-loreframe-instance="x1"');
    },
  );
});

describe("TemplateRenderer secret templates", () => {
  function secretCore() {
    const core = testCore();
    const note = core.templates.get("note")!;
    core.templates.register({ ...note, id: "private-note", secret: true });
    return core;
  }

  it("wraps the block in a bare Foundry secret section", () => {
    const html = secretCore().renderer.render("private-note", { instanceId: "p1" });
    const template = document.createElement("template");
    template.innerHTML = html;
    const wrapper = template.content.firstElementChild!;
    expect(template.content.childElementCount).toBe(1);
    expect(wrapper.tagName).toBe("SECTION");
    // Foundry's reveal toggle rewrites the opening tag and matches /<section[^i]+id=/: nothing else may live there.
    expect([...wrapper.attributes].map((a) => `${a.name}=${a.value}`)).toEqual(["class=secret"]);
    expect(wrapper.children).toHaveLength(1);
    expect(wrapper.firstElementChild?.getAttribute("data-loreframe-instance")).toBe("p1");
  });

  it("parses into a Foundry secret node that contains the block root", () => {
    const doc = parseString(secretCore().renderer.render("private-note", { instanceId: "p1" }));
    const secret = doc.firstChild!;
    expect(secret.type.name).toBe("secret");
    expect(secret.attrs.id).toMatch(/^secret-/);
    expect(secret.childCount).toBe(1);
    expect(secret.firstChild?.attrs._preserve["data-loreframe-template"]).toBe("private-note");
    expect(serializeString(doc)).toMatch(/^<section id="secret-[^"]+" class="secret"><aside /);
  });

  it("gives renderers a localize function", () => {
    const core = testCore({
      localize: (key) => `«${key}»`,
      extraRenderers: {
        loc: ({ localize }) => ({
          tag: "div",
          children: [{ tag: "p", children: [localize("LOREFRAME.X")] }],
        }),
      },
    });
    core.templates.register({
      id: "loc",
      version: 1,
      name: "n",
      category: "blocks",
      type: "block",
      renderer: "loc",
    });
    expect(core.renderer.render("loc", { instanceId: "a" })).toContain("<p>«LOREFRAME.X»</p>");
  });
});

describe("TemplateRenderer options", () => {
  it("stores select and boolean values on the root as data-loreframe-opt-*", () => {
    const core = testCore();
    const root = parse(core.renderer.render("image-text", { instanceId: "a", values: { side: "right" } }));
    expect(root.getAttribute("data-loreframe-opt-side")).toBe("right");
    expect(root.classList.contains("loreframe-media--right")).toBe(true);
    const divider = parse(core.renderer.render("divider", { instanceId: "b" }));
    expect(divider.getAttribute("data-loreframe-opt-style")).toBe("ornament");
  });
});

describe("TemplateRenderer composition", () => {
  function coreWithWrapper(embedded: string, extra: Record<string, unknown> = {}) {
    const core = testCore({
      extraRenderers: {
        wrapper: ({ embed }) => ({
          tag: "div",
          classes: ["loreframe-wrapper"],
          children: [{ tag: "div", slot: "inner", children: [embed(embedded, { key: "inner", ...extra })] }],
        }),
      },
    });
    core.templates.register({
      id: "wrapper",
      version: 1,
      name: "W",
      category: "layouts",
      type: "layout",
      renderer: "wrapper",
      slots: ["inner"],
    });
    return core;
  }

  it("embeds another template as a complete nested block with a derived instance id", () => {
    const core = coreWithWrapper("gallery", { values: { mode: "feature" } });
    const root = parse(core.renderer.render("wrapper", { instanceId: "outer" }));
    const inner = root.querySelector("[data-loreframe-slot=inner] > [data-loreframe-template]")!;
    expect(inner.getAttribute("data-loreframe-template")).toBe("gallery");
    expect(inner.getAttribute("data-loreframe-instance")).toBe("outer-inner");
    expect(inner.getAttribute("data-loreframe-opt-mode")).toBe("feature");
    expect(inner.classList).toContain("loreframe-block");
    expect(
      [...(root.parentNode as DocumentFragment).querySelectorAll("[data-loreframe-template]")].map((el) =>
        el.getAttribute("data-loreframe-template"),
      ),
    ).toEqual(["wrapper", "gallery"]);
  });

  it("wraps embedded GM-only blocks in their own Foundry secret", () => {
    const core = coreWithWrapper("gm-note");
    const html = core.renderer.render("wrapper", { instanceId: "outer" });
    expect(html).toContain('data-loreframe-slot="inner"><section class="secret"><aside');
    expect(serializeString(parseString(html))).toContain('data-loreframe-instance="outer-inner"');
  });

  it("rejects unknown templates, invalid keys and runaway nesting", () => {
    expect(() => coreWithWrapper("missing").renderer.render("wrapper", { instanceId: "o" })).toThrow(
      /missing/,
    );
    const badKey = testCore({
      extraRenderers: { bad: ({ embed }) => embed("note", { key: "Bad Key" }) },
    });
    badKey.templates.register({
      id: "bad",
      version: 1,
      name: "B",
      category: "blocks",
      type: "block",
      renderer: "bad",
    });
    expect(() => badKey.renderer.render("bad", { instanceId: "o" })).toThrow(/key/);

    const loop = coreWithWrapper("wrapper");
    expect(() => loop.renderer.render("wrapper", { instanceId: "o" })).toThrow(/nest/);
  });
});
