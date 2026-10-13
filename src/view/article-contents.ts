import { DATA_ATTR } from "../constants";

/**
 * In-page contents for Wiki articles (spec §19). The document stores only an empty `nav[data-loreframe-contents]`;
 * it is filled when the page is displayed, so it never goes stale and shows nothing without Loreframe.
 */
const CONTENTS_ATTR = DATA_ATTR.contents;
const ARTICLE_SLOT = "article";
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

export interface ContentsEntry {
  text: string;
  /** 0 for the article's top heading level, 1 for the level below it. */
  depth: number;
  heading: HTMLElement;
}

/** Article headings as Foundry's ToC sees them (no `data-no-toc`), limited to two levels. */
export function collectContents(article: HTMLElement): ContentsEntry[] {
  const headings = [...article.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")].filter(
    (heading) => HEADINGS.has(heading.tagName) && !("noToc" in heading.dataset) && heading.textContent.trim(),
  );
  const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
  const top = Math.min(...levels);
  return headings.flatMap((heading, i) => {
    const depth = (levels[i] ?? top) - top;
    return depth < 2 ? [{ text: heading.textContent.trim(), depth, heading }] : [];
  });
}

/** Fill every contents box inside `root` from the article of the same block. */
export function enhanceArticleContents(root: HTMLElement, localize: (key: string) => string): void {
  for (const nav of root.querySelectorAll<HTMLElement>(`[${CONTENTS_ATTR}]`)) {
    const block = nav.closest(`[${DATA_ATTR.template}]`);
    const article = [
      ...(block?.querySelectorAll<HTMLElement>(`[${DATA_ATTR.slot}="${ARTICLE_SLOT}"]`) ?? []),
    ].find((slot) => slot.closest(`[${DATA_ATTR.template}]`) === block);
    const entries = article ? collectContents(article) : [];
    nav.querySelector(":scope > ol")?.remove();
    nav.hidden = entries.length === 0;
    if (!entries.length) continue;
    nav.setAttribute("aria-label", localize("LOREFRAME.Wiki.Contents.Label"));
    nav.append(buildList(entries));
  }
}

function buildList(entries: ContentsEntry[]): HTMLOListElement {
  const list = document.createElement("ol");
  list.className = "loreframe-wiki__contents-list";
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  for (const { text, depth, heading } of entries) {
    const item = document.createElement("li");
    item.className = `loreframe-wiki__contents-item loreframe-wiki__contents-item--depth-${depth}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "loreframe-wiki__contents-link";
    button.textContent = text;
    button.addEventListener("click", () =>
      heading.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }),
    );
    item.append(button);
    list.append(item);
  }
  return list;
}
