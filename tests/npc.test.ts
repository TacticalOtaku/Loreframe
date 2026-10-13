import { describe, expect, it } from "vitest";
import * as pmState from "prosemirror-state";
import { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import {
  locateBlock,
  readBlockValues,
  rebuildBlockTransaction,
  writtenRegions,
} from "../src/editor/block-document";
import { parseString, serializeString } from "./helpers/schema";
import { testCore } from "./helpers/core";
import type { TemplateValues } from "../src/types";

const core = testCore();
const def = (id: string) => core.templates.get(id)!;
const PRESETS = ["editorial", "minimal", "arcane", "bestiary"];

function dom(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const field = (root: ParentNode, name: string) => root.querySelector(`[data-loreframe-field="${name}"]`);

function secretIdOf(doc: PMNode): string {
  let id = "";
  doc.descendants((node) => {
    if (node.type.name === "secret") id = node.attrs.id as string;
  });
  return id;
}

describe("NPC templates", () => {
  it("register a compact card block and a dossier structure with the built-in presets", () => {
    expect(def("npc-card")).toMatchObject({ category: "npc", type: "block", focusField: "name" });
    expect(def("npc-dossier")).toMatchObject({ category: "npc", type: "page", focusField: "name" });
    for (const id of ["npc-card", "npc-dossier"]) {
      expect(def(id).presets).toEqual(PRESETS);
      expect(core.presets.listFor(def(id)).map((p) => p.id)).toEqual(PRESETS);
    }
  });

  it("render the same structure with any preset: only the root class changes", () => {
    const render = (preset: string) =>
      core.renderer.render("npc-dossier", { instanceId: "n", preset }).replace(/preset(--|=")[a-z]+/g, "");
    const editorial = render("editorial");
    for (const preset of PRESETS) expect(render(preset)).toBe(editorial);
    expect(core.renderer.render("npc-card", { instanceId: "n" })).toContain("loreframe-preset--editorial");
  });
});

describe("NPC compact card", () => {
  const render = (values: Record<string, unknown> = {}) =>
    dom(core.renderer.render("npc-card", { instanceId: "c", values }));

  it("has portrait, identity, summary, facts and notes by default", () => {
    const root = render().firstElementChild!;
    expect(root.tagName).toBe("ARTICLE");
    expect(root.classList).toContain("loreframe-npc--card");
    expect(root.classList).toContain("loreframe-npc--portrait-left");
    expect(root.classList).toContain("loreframe-npc--density-comfortable");
    expect(field(root, "image")?.querySelector("img")?.getAttribute("alt")).toBe("PortraitAlt");
    const name = field(root, "name")!;
    expect(name.tagName).toBe("H3");
    expect(name.hasAttribute("data-no-toc")).toBe(false);
    for (const id of ["ancestry", "occupation", "summary", "personality", "goal", "location", "notes"]) {
      expect(field(root, id), id).not.toBeNull();
    }
    for (const label of root.querySelectorAll("h4")) expect(label.hasAttribute("data-no-toc")).toBe(true);
  });

  it("omits empty facts and meta items, and the whole row when nothing is left", () => {
    const partial = render({ goal: "", ancestry: "" });
    expect(field(partial, "goal")).toBeNull();
    expect(field(partial, "ancestry")).toBeNull();
    expect(field(partial, "personality")).not.toBeNull();

    const empty = render({ personality: "", goal: "", location: "", ancestry: "", occupation: "" });
    expect(empty.querySelector(".loreframe-npc__facts")).toBeNull();
    expect(empty.querySelector(".loreframe-npc__meta")).toBeNull();
  });

  it("drops optional sections that are switched off", () => {
    const root = render({ "show-notes": false });
    expect(field(root, "notes")).toBeNull();
    expect(root.querySelector(".loreframe-npc__facts")).not.toBeNull();
    // Facts are text properties: they disappear when cleared, so switching them off could never lose them.
    expect(
      def("npc-card")
        .fields!.filter((f) => f.type === "boolean")
        .map((f) => f.id),
    ).toEqual(["show-notes"]);
    expect(root.firstElementChild!.getAttribute("data-loreframe-opt-show-notes")).toBe("false");
  });

  it("supports portrait positions and density, and always keeps the portrait field", () => {
    const top = render({ portrait: "top", density: "compact" }).firstElementChild!;
    expect(top.classList).toContain("loreframe-npc--portrait-top");
    expect(top.classList).toContain("loreframe-npc--density-compact");
    // No portrait = no image chosen: the placeholder stays editable and is hidden outside the editor by CSS,
    // so a portrait is never dropped from the document by an option change.
    const empty = render({ image: "" });
    expect(field(empty, "image")?.querySelector("img")?.getAttribute("src")).toMatch(
      /placeholders\/image\.svg$/,
    );
    expect(render({ portrait: "none" }).firstElementChild!.classList).toContain(
      "loreframe-npc--portrait-left",
    );
  });

  it("escapes long names and keeps them as one text field", () => {
    const name = "Арканнис <Вель> из Дома Безмолвных Колоколов и Тринадцати Туманных Мостов";
    const root = render({ name });
    expect(field(root, "name")!.textContent).toBe(name);
  });
});

describe("NPC dossier", () => {
  const html = core.renderer.render("npc-dossier", { instanceId: "d" });
  const SECTIONS = [
    "appearance",
    "personality",
    "voice",
    "motivation",
    "goals",
    "fears",
    "relationships",
    "knowledge",
    "rumours",
  ];

  it("lists every spec section in order, each with a labelled rich-text region", () => {
    const root = dom(html);
    const order = [...root.querySelectorAll("[data-loreframe-field]")].map((el) =>
      el.getAttribute("data-loreframe-field"),
    );
    expect(order).toEqual([
      "image",
      "name",
      "role",
      "ancestry",
      "occupation",
      "summary",
      ...SECTIONS,
      "secrets",
    ]);
    const name = field(root, "name")!;
    expect(name.tagName).toBe("H2");
    for (const id of SECTIONS) {
      const section = field(root, id)!.closest(".loreframe-npc__section")!;
      expect(section.querySelector("h4[data-no-toc]")?.textContent, id).toBeTruthy();
    }
    expect(root.querySelector("section:not(.secret)")).toBeNull();
  });

  it("keeps GM secrets in a nested Foundry secret that players never receive", () => {
    const doc = parseString(html);
    const secrets = locateBlock(doc, "d")!;
    expect(secrets.host).toBe(secrets.root);
    const host = dom(serializeString(doc));
    const secret = field(host, "secrets")!.querySelector(":scope > section.secret")!;
    expect(secret.id).toMatch(/^secret-/);
    expect(secret.querySelector("h4")?.textContent).toBe("Secrets");
    // TextEditor.enrichHTML({secrets: false}) removes unrevealed secrets.
    host.querySelectorAll("section.secret:not(.revealed)").forEach((el) => el.remove());
    expect(host.textContent).not.toContain("Secrets");
  });

  it("lets Foundry's reveal regex rewrite only the secret tag", () => {
    const stored = serializeString(parseString(html));
    const id = /<section id="([^"]+)" class="secret"/.exec(stored)![1]!;
    // client/applications/elements/secret-block.mjs toggleRevealed
    const regex = new RegExp(`<section[^i]+id="${id}"[^>]*>`);
    const revealed = stored.replace(regex, () => `<section class="secret revealed" id="${id}">`);
    expect(revealed).not.toBe(stored);
    expect(
      revealed.replace(`<section class="secret revealed" id="${id}">`, `<section id="${id}" class="secret">`),
    ).toBe(stored);
  });

  it("drops switched-off sections and empty groups", () => {
    const root = dom(
      core.renderer.render("npc-dossier", {
        instanceId: "d",
        values: {
          "show-appearance": false,
          "show-knowledge": false,
          "show-rumours": false,
          "show-secrets": false,
          "show-summary": false,
          role: "",
        },
      }),
    );
    for (const id of ["appearance", "knowledge", "rumours", "secrets", "summary", "role"]) {
      expect(field(root, id), id).toBeNull();
    }
    expect(root.querySelector(".loreframe-npc__group--lore")).toBeNull();
    expect(root.querySelector("section.secret")).toBeNull();
    expect(field(root, "personality")).not.toBeNull();
  });

  it("toggles sections without losing written text or the revealed secret", () => {
    const stored = serializeString(parseString(html)).replace('class="secret"', 'class="secret revealed"');
    const withText = stored.replace(/(data-loreframe-field="voice"[^>]*>)<p>[^<]*<\/p>/, "$1<p>Gravelly</p>");
    const state = EditorState.create({ doc: parseString(withText) });
    const id = secretIdOf(state.doc);
    const location = locateBlock(state.doc, "d")!;
    const values: TemplateValues = {
      ...readBlockValues(location.root, def("npc-dossier")),
      "show-fears": false,
    };
    expect(values["show-voice"]).toBe(true);
    const fresh = parseString(core.renderer.render("npc-dossier", { instanceId: "d", values })).firstChild!;
    const next = state.apply(rebuildBlockTransaction(state, location, fresh, def("npc-dossier"), pmState));
    const out = dom(serializeString(next.doc));
    expect(field(out, "fears")).toBeNull();
    expect(field(out, "voice")!.textContent).toBe("Gravelly");
    expect(out.querySelector("section.secret")?.id).toBe(id);
    expect(out.querySelector("section.secret")?.classList).toContain("revealed");
  });

  it("reports which rich-text regions the author has written in", () => {
    const written = html.replace(/(data-loreframe-field="goals"[^>]*>)<p>[^<]*<\/p>/, "$1<p>Revenge</p>");
    const root = locateBlock(parseString(written), "d")!.root;
    const fresh = locateBlock(parseString(html), "d")!.root;
    expect(writtenRegions(root, fresh, def("npc-dossier"))).toEqual(["goals"]);
    const cleared = html.replace(/(data-loreframe-field="fears"[^>]*>)<p>[^<]*<\/p>/, "$1<p></p>");
    expect(writtenRegions(locateBlock(parseString(cleared), "d")!.root, fresh, def("npc-dossier"))).toEqual(
      [],
    );
  });
});
