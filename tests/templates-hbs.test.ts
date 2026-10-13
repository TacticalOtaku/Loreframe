import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";

// Foundry compiles these at runtime; a syntax error only shows up when a window opens. Parse them here instead.
const DIR = join(__dirname, "..", "templates", "applications");
const files = readdirSync(DIR).filter((name) => name.endsWith(".hbs"));

describe("Handlebars templates", () => {
  it.each(files)("%s parses", (name) => {
    expect(() => Handlebars.parse(readFileSync(join(DIR, name), "utf8"))).not.toThrow();
  });

  it("reference partials that exist", () => {
    for (const name of files) {
      const source = readFileSync(join(DIR, name), "utf8");
      for (const [, partial] of source.matchAll(
        /\{\{>\s*"modules\/loreframe\/templates\/applications\/([^"]+)"/g,
      )) {
        expect(files, `${name} → ${partial}`).toContain(partial);
      }
    }
  });
});
