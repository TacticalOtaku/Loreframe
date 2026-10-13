import { logger } from "../utils/logger";
import type { LoreframeNpcData, LoreframeSystemAdapter } from "./types";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export interface IntegrationManagerDeps {
  /** Active game system id. */
  systemId(): string;
  /** World setting: system integrations enabled. */
  enabled(): boolean;
}

/** Chooses the adapter for a document (spec §34). The only place that compares game system ids. */
export class IntegrationManager {
  readonly #adapters = new Map<string, LoreframeSystemAdapter>();
  readonly #deps: IntegrationManagerDeps;

  constructor(deps: IntegrationManagerDeps) {
    this.#deps = deps;
  }

  register(adapter: LoreframeSystemAdapter): void {
    if (typeof adapter.id !== "string" || !ID_PATTERN.test(adapter.id)) {
      throw new Error(`Invalid adapter id "${String(adapter.id)}"`);
    }
    if (typeof adapter.systemId !== "string" || !adapter.systemId) {
      throw new Error(`Adapter "${adapter.id}" needs a systemId`);
    }
    if (typeof adapter.canHandle !== "function") throw new Error(`Adapter "${adapter.id}" needs canHandle`);
    if (!Array.isArray(adapter.documentTypes)) throw new Error(`Adapter "${adapter.id}" needs documentTypes`);
    if (this.#adapters.has(adapter.id)) throw new Error(`Adapter "${adapter.id}" is already registered`);
    this.#adapters.set(adapter.id, Object.freeze({ ...adapter, documentTypes: [...adapter.documentTypes] }));
  }

  /** Whether an active adapter can turn documents of this type into NPC data. */
  handles(documentType: string): boolean {
    return this.#active().some((a) => a.getNpcData && a.documentTypes.includes(documentType));
  }

  npcData(document: unknown): LoreframeNpcData | null {
    for (const adapter of this.#active()) {
      if (!adapter.getNpcData) continue;
      try {
        if (!adapter.canHandle(document)) continue;
        const data = adapter.getNpcData(document);
        if (data) return data;
      } catch (error) {
        logger.error(`System adapter "${adapter.id}" failed`, error);
      }
    }
    return null;
  }

  #active(): LoreframeSystemAdapter[] {
    if (!this.#deps.enabled()) return [];
    const systemId = this.#deps.systemId();
    return [...this.#adapters.values()].filter((adapter) => adapter.systemId === systemId);
  }
}
