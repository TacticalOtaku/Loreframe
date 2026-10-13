import { describe, expect, it, vi } from "vitest";
import { collectContents, enhanceArticleContents } from "../src/view/article-contents";

function page(article: string, extra = ""): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <article data-loreframe-template="wiki">
      <nav data-loreframe-contents=""><h4 data-no-toc="">Contents</h4></nav>
      <div data-loreframe-slot="article">${article}</div>
    </article>${extra}`;
  document.body.append(root);
  return root;
}

const localize = (key: string) => `‹${key.split(".").at(-1)}›`;

describe("collectContents", () => {
  it("lists article headings the way Foundry's ToC does, relative to the top level", () => {
    const root = page(`
      <h2>History</h2><p>x</p>
      <h3>Founding</h3>
      <h4>Too deep</h4>
      <h3 data-no-toc="">Label</h3>
      <div><h2>Geography</h2></div>
      <h3>   </h3>`);
    const article = root.querySelector<HTMLElement>("[data-loreframe-slot=article]")!;
    expect(collectContents(article).map((e) => [e.text, e.depth])).toEqual([
      ["History", 0],
      ["Founding", 1],
      ["Geography", 0],
    ]);
    root.remove();
  });
});

describe("enhanceArticleContents", () => {
  it("fills each contents box with buttons that scroll to their heading", () => {
    const root = page("<h3>Early days</h3><p>a</p><h3>Now</h3>");
    enhanceArticleContents(root, localize);
    const nav = root.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("‹Label›");
    const buttons = [...nav.querySelectorAll<HTMLButtonElement>("ol > li > button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Early days", "Now"]);
    const target = root.querySelectorAll("h3")[1]!;
    target.scrollIntoView = vi.fn();
    buttons[1]!.click();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    root.remove();
  });

  it("is idempotent and removes an empty contents box", () => {
    const root = page("<h3>One</h3>");
    enhanceArticleContents(root, localize);
    enhanceArticleContents(root, localize);
    expect(root.querySelectorAll("nav ol")).toHaveLength(1);

    const empty = page("<p>No headings</p>");
    enhanceArticleContents(empty, localize);
    expect(empty.querySelector("nav")!.hidden).toBe(true);
    root.remove();
    empty.remove();
  });

  it("only reads the article of its own block", () => {
    const root = page(
      "<h3>Mine</h3>",
      `<article data-loreframe-template="wiki"><div data-loreframe-slot="article"><h3>Other</h3></div></article>`,
    );
    enhanceArticleContents(root, localize);
    expect([...root.querySelectorAll("nav button")].map((b) => b.textContent)).toEqual(["Mine"]);
    root.remove();
  });
});
