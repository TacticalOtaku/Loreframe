/** How many recently used templates are remembered (spec §16: roughly 10–20). */
export const RECENT_LIMIT = 15;

export type PreferenceKey = "favorites" | "recent";

/** Client-scoped storage (Foundry: the module's `favorites` / `recent` client settings). */
export interface PreferenceStorage {
  get(key: PreferenceKey): string[];
  set(key: PreferenceKey, value: string[]): Promise<unknown>;
}

/** Per-user template favorites and recent use (spec §16). */
export class Preferences {
  readonly #storage: PreferenceStorage;

  constructor(storage: PreferenceStorage) {
    this.#storage = storage;
  }

  favorites(): string[] {
    return this.#read("favorites");
  }

  isFavorite(templateId: string): boolean {
    return this.favorites().includes(templateId);
  }

  /** Add or remove a favorite; resolves to whether it is now a favorite. */
  async toggleFavorite(templateId: string): Promise<boolean> {
    const favorites = this.favorites();
    const isFavorite = favorites.includes(templateId);
    const next = isFavorite ? favorites.filter((id) => id !== templateId) : [...favorites, templateId];
    await this.#storage.set("favorites", next);
    return !isFavorite;
  }

  /** Most recently used first. */
  recent(): string[] {
    return this.#read("recent");
  }

  async recordUse(templateId: string): Promise<void> {
    const recent = this.recent();
    if (recent[0] === templateId) return;
    const next = [templateId, ...recent.filter((id) => id !== templateId)].slice(0, RECENT_LIMIT);
    await this.#storage.set("recent", next);
  }

  /** Drop an id that no longer exists (e.g. a deleted user template) from favorites and recent. */
  async forget(templateId: string): Promise<void> {
    for (const key of ["favorites", "recent"] as const) {
      const list = this.#read(key);
      if (list.includes(templateId))
        await this.#storage.set(
          key,
          list.filter((id) => id !== templateId),
        );
    }
  }

  #read(key: PreferenceKey): string[] {
    const value: unknown = this.#storage.get(key);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  }
}
