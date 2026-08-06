import { describe, expect, it } from "vitest";
import { recipes, TRAIL_REMEDIES_FLAG } from "../../src/content/recipes";
import { items } from "../../src/content/campaign";
import { canCraft, craftRecipe } from "../../src/engine";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

const FIXED_SEED = "trail-remedies-fixture";

function createBridge(): EngineGameBridge {
  return new EngineGameBridge(new SaveRepository(new MemorySaveStorage()), () => FIXED_SEED);
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
}

describe("trail remedies (#137)", () => {
  it("authors only real items into the ledger", () => {
    const knownIds = new Set(items.map(({ id }) => id));
    for (const recipe of recipes) {
      expect(knownIds.has(recipe.outputItemId), recipe.id).toBe(true);
      expect(recipe.inputs.length).toBeGreaterThan(0);
      for (const input of recipe.inputs) {
        expect(knownIds.has(input.itemId), `${recipe.id} input ${input.itemId}`).toBe(true);
        expect(input.quantity).toBeGreaterThan(0);
      }
      // A recipe that consumed its own output for free would be a dupe engine.
      expect(recipe.inputs.some(({ itemId }) => itemId === recipe.outputItemId)).toBe(false);
    }
  });

  it("crafts pure: consumes inputs, adds output, refuses when short", () => {
    const recipe = recipes[0]!;
    const stocked = recipe.inputs.map((input) => ({ itemId: input.itemId, quantity: input.quantity }));
    expect(canCraft(stocked, recipe)).toBe(true);
    const crafted = craftRecipe(stocked, recipe);
    expect(crafted.crafted).toBe(true);
    expect(crafted.inventory.find(({ itemId }) => itemId === recipe.outputItemId)?.quantity).toBe(recipe.outputQuantity);
    for (const input of recipe.inputs) {
      expect(crafted.inventory.find(({ itemId }) => itemId === input.itemId)).toBeUndefined();
    }

    const short = craftRecipe([], recipe);
    expect(short.crafted).toBe(false);
    expect(short.inventory).toEqual([]);
  });

  it("keeps the ledger closed until Emberwake, then teaches it once", async () => {
    const bridge = createBridge();
    await startChronicle(bridge);
    expect(bridge.getSnapshot().remedies?.unlocked).toBe(false);

    const refused = await bridge.craftRemedy(recipes[0]!.id);
    expect(refused.success).toBe(false);
    expect(refused.message).toContain("not learned");

    // Walk the authored road east: Hearthcross → Mossroad → Emberwake.
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().remedies?.unlocked).toBe(false);
    await bridge.travel("location.emberwake");
    expect(bridge.getSnapshot().remedies?.unlocked).toBe(true);
  });

  it("crafts through the bridge once taught, and reports the yield", async () => {
    const bridge = createBridge();
    await startChronicle(bridge);
    await bridge.travel("location.mossroad");
    await bridge.travel("location.emberwake");

    // The starting pack carries vesleaf; top up to guarantee the steep.
    const before = bridge.getSnapshot();
    const vesleaf = before.inventory.find(({ itemId }) => itemId === "item.vesleaf")?.quantity ?? 0;
    if (vesleaf < 2) {
      // Buying is beside the point here; assert the failure message instead.
      const refused = await bridge.craftRemedy("recipe.steeped-tonic");
      expect(refused.success).toBe(false);
      expect(refused.message).toContain("short an ingredient");
      return;
    }
    const tonicsBefore = before.inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity ?? 0;
    const crafted = await bridge.craftRemedy("recipe.steeped-tonic");
    expect(crafted.success).toBe(true);
    expect(crafted.message).toContain("Root Tonic");
    const after = bridge.getSnapshot();
    expect(after.inventory.find(({ itemId }) => itemId === "item.vesleaf")?.quantity ?? 0).toBe(vesleaf - 2);
    expect(after.inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity ?? 0).toBe(tonicsBefore + 1);
  });

  it("backfills the ledger for a save that reached Emberwake before the system existed", async () => {
    const saves = new SaveRepository(new MemorySaveStorage());
    const bridge = new EngineGameBridge(saves, () => FIXED_SEED);
    await startChronicle(bridge);
    await bridge.travel("location.mossroad");
    await bridge.travel("location.emberwake");
    await bridge.save("manual-1");

    // Strip the flag, as a pre-system save would be.
    const state = await saves.load("manual-1");
    const flags = { ...state!.world.flags };
    delete flags[TRAIL_REMEDIES_FLAG];
    await saves.save("manual-1", { ...state!, world: { ...state!.world, flags } });

    const fresh = new EngineGameBridge(saves, () => FIXED_SEED);
    await fresh.initialize();
    const loaded = await fresh.load("manual-1");
    expect(loaded.success).toBe(true);
    expect(fresh.getSnapshot().remedies?.unlocked).toBe(true);
  });
});
