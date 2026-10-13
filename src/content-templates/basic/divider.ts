import type { LoreframeTemplateDefinition, TemplateRendererFn } from "../../types";

export const DIVIDER_RENDERER = "divider";
const DIVIDER_STYLES = ["ornament", "line"];

/** Section divider. The ornament is drawn by CSS on the wrapper, so the content stays a plain <hr>. */
export const dividerRenderer: TemplateRendererFn = ({ values }) => {
  const style =
    typeof values.style === "string" && DIVIDER_STYLES.includes(values.style) ? values.style : "ornament";
  return {
    tag: "div",
    classes: ["loreframe-divider", `loreframe-divider--${style}`],
    attrs: { role: "separator" },
    children: [{ tag: "hr", classes: ["loreframe-divider__rule"] }],
  };
};

export const dividerDefinition: LoreframeTemplateDefinition = {
  id: "divider",
  version: 1,
  name: "LOREFRAME.Template.Divider.Name",
  description: "LOREFRAME.Template.Divider.Description",
  category: "blocks",
  type: "block",
  icon: "fa-solid fa-horizontal-rule",
  renderer: DIVIDER_RENDERER,
  fields: [
    {
      id: "style",
      type: "select",
      label: "LOREFRAME.Field.Style",
      options: DIVIDER_STYLES,
      default: "ornament",
    },
  ],
  tags: ["separator", "rule", "break"],
};
