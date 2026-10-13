/** A new identifier for an inserted Loreframe block instance. */
export function newInstanceId(): string {
  return foundry.utils.randomID(16);
}
