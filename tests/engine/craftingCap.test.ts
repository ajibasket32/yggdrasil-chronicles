import { describe, expect, it } from "vitest";
import { canCraft, craftRecipe, type RecipeDefinition } from "../../src/engine/crafting";
import { MAX_STACK_QUANTITY } from "../../src/engine/inventory";

const tonic: RecipeDefinition = {
  id: "recipe.tonic",
  name: "Root Tonic",
  description: "test recipe",
  inputs: [{ itemId: "item.root", quantity: 2 }],
  outputItemId: "item.tonic",
  outputQuantity: 1
};

describe("crafting respects the output stack cap", () => {
  it("reports a full output stack as uncraftable instead of throwing", () => {
    const inventory = [
      { itemId: "item.root", quantity: 10 },
      { itemId: "item.tonic", quantity: MAX_STACK_QUANTITY }
    ];
    expect(canCraft(inventory, tonic)).toBe(false);
    expect(() => craftRecipe(inventory, tonic)).not.toThrow();
    expect(craftRecipe(inventory, tonic).crafted).toBe(false);
  });

  it("still crafts when the output has exactly one slot of room left", () => {
    const inventory = [
      { itemId: "item.root", quantity: 10 },
      { itemId: "item.tonic", quantity: MAX_STACK_QUANTITY - 1 }
    ];
    expect(canCraft(inventory, tonic)).toBe(true);
    expect(craftRecipe(inventory, tonic).crafted).toBe(true);
  });

  it("discounts an input that is also the output, which frees its own room", () => {
    const refine: RecipeDefinition = {
      id: "recipe.refine",
      name: "Refine",
      description: "consumes and returns the same item",
      inputs: [{ itemId: "item.tonic", quantity: 3 }],
      outputItemId: "item.tonic",
      outputQuantity: 1
    };
    const inventory = [{ itemId: "item.tonic", quantity: MAX_STACK_QUANTITY }];
    expect(canCraft(inventory, refine)).toBe(true);
    const result = craftRecipe(inventory, refine);
    expect(result.crafted).toBe(true);
    expect(result.inventory.find((stack) => stack.itemId === "item.tonic")?.quantity)
      .toBe(MAX_STACK_QUANTITY - 2);
  });
});
