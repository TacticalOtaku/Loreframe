import type { LoreframePresetDefinition } from "../types";

/**
 * Built-in visual presets (spec §8). A preset only adds `loreframe-preset--<id>` to the block root; the styles
 * decide what it means, so any structure that lists a preset renders unchanged with another one.
 */
export const BUILT_IN_PRESETS: LoreframePresetDefinition[] = [
  { id: "editorial", name: "LOREFRAME.Preset.Editorial" },
  { id: "minimal", name: "LOREFRAME.Preset.Minimal" },
  { id: "arcane", name: "LOREFRAME.Preset.Arcane" },
  { id: "bestiary", name: "LOREFRAME.Preset.Bestiary" },
];

export const BUILT_IN_PRESET_IDS = BUILT_IN_PRESETS.map((preset) => preset.id);
