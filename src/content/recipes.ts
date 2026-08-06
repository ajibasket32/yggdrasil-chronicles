import type { RecipeDefinition } from "../engine/crafting";

/**
 * The trail-remedy ledger, taught by Emberwake's delvers on first arrival.
 *
 * Every input and output is an existing consumable, so the system deepens the
 * economy rather than widening the catalog. Recipes trade a little market
 * value for reach: crafting never beats simply buying from a shop, but the
 * shop is not always where you are.
 */
export const recipes: readonly RecipeDefinition[] = [
  {
    id: "recipe.steeped-tonic",
    name: "Steep a Root Tonic",
    description: "Two bitter leaves, steeped slow over a camp flame.",
    inputs: [{ itemId: "item.vesleaf", quantity: 2 }],
    outputItemId: "item.root-tonic",
    outputQuantity: 1
  },
  {
    id: "recipe.bound-rations",
    name: "Bind Trail Rations",
    description: "Smoked root and tonic-soaked bread, packed for the road.",
    inputs: [
      { itemId: "item.vesleaf", quantity: 1 },
      { itemId: "item.root-tonic", quantity: 1 }
    ],
    outputItemId: "item.trail-rations",
    outputQuantity: 2
  },
  {
    id: "recipe.tempered-spice",
    name: "Temper Ash Spice",
    description: "A leaf smoked over a cold ember until it bites back.",
    inputs: [
      { itemId: "item.cold-ember", quantity: 1 },
      { itemId: "item.vesleaf", quantity: 1 }
    ],
    outputItemId: "item.ash-spice",
    outputQuantity: 2
  },
  {
    id: "recipe.frost-draught",
    name: "Blend Frost Resin",
    description: "Aether cut with crushed leaf until it sets cold.",
    inputs: [
      { itemId: "item.aether-drop", quantity: 1 },
      { itemId: "item.vesleaf", quantity: 1 }
    ],
    outputItemId: "item.frost-resin",
    outputQuantity: 1
  }
];

/** World flag marking that the delvers have taught the party the ledger. */
export const TRAIL_REMEDIES_FLAG = "progression.system.trail-remedies";
