import type { IntegrationManager } from "../integration-manager";
import { createDnd5eAdapter } from "./dnd5e-adapter";

/** Register the built-in dnd5e adapter; the manager only uses it while dnd5e is the active system. */
export function registerDnd5eIntegration(
  integrations: Pick<IntegrationManager, "register">,
  format: (key: string, data: Record<string, string>) => string,
): void {
  integrations.register(
    createDnd5eAdapter({
      formatCR: (cr) => globalThis.dnd5e?.utils?.formatCR?.(cr) ?? String(cr),
      format,
    }),
  );
}
