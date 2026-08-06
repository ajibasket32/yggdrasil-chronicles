import type { InventoryStack } from "../shared/types";
import { addItem, inventoryQuantity, removeItem } from "./inventory";

/**
 * Trail remedies: field crafting over the existing inventory.
 *
 * The system unlocks mid-campaign (first arrival in Emberwake — see the
 * integration layer), which is the first time any *system* joins the game
 * after the opening fifteen minutes. The engine's part is pure arithmetic:
 * recipes in, inventory out, no randomness and no state of its own.
 */
export interface RecipeInput {
  readonly itemId: string;
  readonly quantity: number;
}

export interface RecipeDefinition {
  readonly id: string;
  readonly name: string;
  /** One sentence of flavour, shown beside the ledger line. */
  readonly description: string;
  readonly inputs: readonly RecipeInput[];
  readonly outputItemId: string;
  readonly outputQuantity: number;
}

export function canCraft(inventory: readonly InventoryStack[], recipe: RecipeDefinition): boolean {
  return recipe.inputs.every((input) => inventoryQuantity(inventory, input.itemId) >= input.quantity);
}

/**
 * Consumes the inputs and adds the output, or returns the inventory unchanged
 * when an input is short — callers report, they do not throw.
 */
export function craftRecipe(
  inventory: readonly InventoryStack[],
  recipe: RecipeDefinition
): { inventory: InventoryStack[]; crafted: boolean } {
  if (!canCraft(inventory, recipe)) {
    return { inventory: [...inventory], crafted: false };
  }
  let next = [...inventory];
  for (const input of recipe.inputs) {
    next = removeItem(next, input.itemId, input.quantity);
  }
  next = addItem(next, recipe.outputItemId, recipe.outputQuantity);
  return { inventory: next, crafted: true };
}
