import { describe, expect, it } from "vitest";
import { Plugin, PluginKey } from "prosemirror-state";
import { isChatEditor } from "../src/editor/editor-kind";

describe("isChatEditor", () => {
  const chatKey = new PluginKey("ChatInputPlugin");

  it("does not mistake Foundry's placeholder chatInput slot for the chat input", () => {
    expect(isChatEditor({ chatInput: new Plugin({}), menu: new Plugin({}) }, chatKey)).toBe(false);
  });

  it("recognizes the real chat input plugin by its key", () => {
    expect(isChatEditor({ chatInput: new Plugin({ key: chatKey }) }, chatKey)).toBe(true);
  });

  it("handles editors without the slot", () => {
    expect(isChatEditor({}, chatKey)).toBe(false);
    expect(isChatEditor({ chatInput: new Plugin({ key: new PluginKey("Other") }) }, chatKey)).toBe(false);
  });
});
