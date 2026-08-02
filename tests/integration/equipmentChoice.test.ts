import { describe, expect, it } from "vitest";
import { items, regions, vendorProfiles } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";
import type { ItemDefinition, Stats } from "../../src/shared/types";

const SLOTS = ["weapon", "armor", "accessory"] as const;

function createBridge(seed = "gear-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

const equipment = (): ItemDefinition[] =>
  items.filter((item) => (SLOTS as readonly string[]).includes(item.kind));

/** Rough tier by the level gate each piece carries. */
function tierOf(item: ItemDefinition): number {
  const level = item.requiredLevel ?? 1;
  if (level >= 14) return 3;
  if (level >= 7) return 2;
  return 1;
}

describe("equipment offers choices, not just a ladder", () => {
  it("gives every slot at least three options per tier band", () => {
    for (const slot of SLOTS) {
      for (const tier of [1, 2, 3]) {
        const matching = equipment().filter((item) => item.kind === slot && tierOf(item) === tier);
        // Two per slot made every choice a strict upgrade: you simply wore the
        // newest thing you owned, so equipping was never a decision.
        expect(matching.length, `${slot} tier ${tier}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("includes a genuine tradeoff, not only strict upgrades", () => {
    // A sidegrade lowers at least one stat while raising another, which is what
    // makes a choice against the fight ahead meaningful.
    const tradeoffs = equipment().filter((item) => {
      const values = Object.values(item.modifiers ?? {}) as number[];
      return values.some((value) => value < 0) && values.some((value) => value > 0);
    });
    expect(tradeoffs.length).toBeGreaterThan(0);
  });

  it("keeps every authored piece inside a level band the campaign reaches", () => {
    const ceiling = regions.at(-1)?.recommendedLevel[1] ?? 22;
    for (const item of equipment()) {
      expect(item.requiredLevel ?? 1, item.id).toBeLessThanOrEqual(ceiling);
    }
  });

  it("keeps the highest boss-dropped tier out of the shops", () => {
    const stocked = new Set(vendorProfiles.flatMap(({ catalogItemIds }) => catalogItemIds));
    // Equipment progression should still require beating the final boss.
    for (const id of ["item.rootbound-edge", "item.canopy-ward", "item.starlit-signet"]) {
      expect(stocked.has(id), `${id} must not be purchasable`).toBe(false);
    }
  });
});

describe("the shop says what a purchase would do", () => {
  it("reports a stat delta against what the character already wears", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, currency: 900 } }
    });
    await bridge.continueGame();

    const vendor = vendorProfiles[0];
    if (!vendor) throw new Error("expected a vendor");
    await bridge.interactNpc(vendor.npcId);

    const catalog = bridge.getSnapshot().shop?.catalog ?? [];
    expect(catalog.length).toBeGreaterThan(0);

    const gear = catalog.filter((entry) => entry.kind !== "consumable");
    expect(gear.length).toBeGreaterThan(0);
    // Every equippable entry either shows what it would change, or says why the
    // character cannot use it. Silence would leave the player guessing.
    for (const entry of gear) {
      const explained = (entry.statDelta?.length ?? 0) > 0 || entry.unusableReason !== undefined;
      expect(explained, `${entry.itemId} explains itself`).toBe(true);
    }
  });

  it("reports the delta against the equipped piece, not against nothing", async () => {
    const { bridge, saves } = createBridge();
    // The Vanguard starts wearing the resin vest (maxHp +14, vitality +3).
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    expect(state.party[0]?.equipment.armor).toBe("item.resin-vest");
    await saves.save("autosave", {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, currency: 900 } }
    });
    await bridge.continueGame();

    const vendor = vendorProfiles.find(({ catalogItemIds }) => catalogItemIds.includes("item.orchard-wrap"));
    if (!vendor) throw new Error("expected a vendor stocking the sidegrade");
    await bridge.interactNpc(vendor.npcId);

    const wrap = bridge.getSnapshot().shop?.catalog.find(({ itemId }) => itemId === "item.orchard-wrap");
    expect(wrap?.statDelta, "the sidegrade reports a delta").toBeDefined();

    const vest = items.find(({ id }) => id === "item.resin-vest")?.modifiers as Partial<Stats> | undefined;
    const wrapMods = items.find(({ id }) => id === "item.orchard-wrap")?.modifiers as Partial<Stats> | undefined;
    const expectedHp = (wrapMods?.maxHp ?? 0) - (vest?.maxHp ?? 0);
    const reportedHp = wrap?.statDelta?.find(({ stat }) => stat === "maxHp")?.delta ?? 0;
    // Trading down on health is the point of a sidegrade; the delta must show it.
    expect(reportedHp).toBe(expectedHp);
    expect(reportedHp).toBeLessThan(0);
  });

  it("marks gear the character cannot use rather than showing a misleading delta", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, currency: 900 } }
    });
    await bridge.continueGame();

    const vendor = vendorProfiles.find(({ catalogItemIds }) => catalogItemIds.includes("item.hearthsteel-blade"));
    if (!vendor) throw new Error("expected a vendor stocking level-gated gear");
    await bridge.interactNpc(vendor.npcId);

    // A level-1 Vanguard cannot wear a level-7 blade.
    const gated = bridge.getSnapshot().shop?.catalog.find(({ itemId }) => itemId === "item.hearthsteel-blade");
    expect(gated?.unusableReason).toBeDefined();
    expect(gated?.statDelta).toBeUndefined();
  });
});
