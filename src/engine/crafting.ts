import type { InventoryStack } from "../shared/types";
import { addItem, inventoryQuantity, MAX_STACK_QUANTITY, removeItem } from "./inventory";

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
  const hasInputs = recipe.inputs.every((input) => inventoryQuantity(inventory, input.itemId) >= input.quantity);
  return hasInputs && outputFits(inventory, recipe);
}

/**
 * Whether the result has room in the pack once the inputs are consumed.
 *
 * `craftRecipe` finishes with `addItem`, which throws when a stack would pass
 * its limit — so a recipe whose output the player already holds 99 of was
 * offered as craftable and then threw out of what the contract above promises
 * is a plain `crafted: false`. An input that is also the output frees its own
 * room first, so it is discounted here rather than counted against the cap.
 */
function outputFits(inventory: readonly InventoryStack[], recipe: RecipeDefinition): boolean {
  const consumedFromOutput = recipe.inputs
    .filter((input) => input.itemId === recipe.outputItemId)
    .reduce((total, input) => total + input.quantity, 0);
  const heldAfterInputs = inventoryQuantity(inventory, recipe.outputItemId) - consumedFromOutput;
  return heldAfterInputs + recipe.outputQuantity <= MAX_STACK_QUANTITY;
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
