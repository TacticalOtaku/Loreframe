import { createCore, type CoreOptions, type LoreframeCore } from "../../src/core/loreframe-core";

/** A core with identity localization and sequential instance ids (`id1`, `id2`, …). */
export function testCore(options: Partial<CoreOptions> = {}): LoreframeCore {
  let next = 0;
  return createCore({
    localize: (key) => key.split(".").at(-2) ?? key,
    newInstanceId: () => `id${++next}`,
    ...options,
  });
}
