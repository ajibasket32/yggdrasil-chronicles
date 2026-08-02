import { describe, expect, it } from "vitest";
import { items, recruitProfiles, vendorProfiles } from "../../src/content";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

const CAMP_SUPPLY = "item.trail-rations";

function createBridge(seed = "economy-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

describe("a companion joins at the party's own standing", () => {
  it("scales a recruit to the party instead of level one", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");

    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => grantExperience(member, totalExperienceForLevel(11)).character),
      quests: state.quests.map((quest) =>
        quest.questId === profile.recruitmentQuestId
          ? { ...quest, state: "completed" as const, currentStep: 3 }
          : quest)
    });
    await bridge.continueGame();
    const partyLevel = bridge.getSnapshot().party[0]?.level ?? 0;
    expect(partyLevel).toBeGreaterThanOrEqual(11);

    await bridge.interactNpc(profile.npcId);

    const recruit = bridge.getSnapshot().party.find(({ id }) => id !== "party.protagonist");
    expect(recruit, "the companion joined").toBeDefined();
    // Joining nine levels behind made recruiting a penalty: the newcomer could
    // not survive the content they were recruited into and diluted the party's
    // experience share.
    expect(recruit?.level).toBe(partyLevel);
    // Levels were granted through the real progression path, so stats grew too.
    expect(recruit?.maxHp ?? 0).toBeGreaterThan(72);
  });

  it("still joins at level one for a level-one party", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");

    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        quest.questId === profile.recruitmentQuestId
          ? { ...quest, state: "completed" as const, currentStep: 3 }
          : quest)
    });
    await bridge.continueGame();
    await bridge.interactNpc(profile.npcId);

    const recruit = bridge.getSnapshot().party.find(({ id }) => id !== "party.protagonist");
    expect(recruit?.level).toBe(bridge.getSnapshot().party[0]?.level);
  });
});

describe("resting costs something", () => {
  it("charges for lodging in a settlement and clears conditions", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => ({
        ...member,
        hp: 1,
        statuses: [{ id: "poison" as const, remainingTurns: 3, potency: 4 }]
      })),
      world: { ...state.world, flags: { ...state.world.flags, currency: 400 } }
    });
    await bridge.continueGame();

    const before = bridge.getSnapshot().currency;
    const result = await bridge.rest();
    expect(result.success, result.message).toBe(true);
    expect(bridge.getSnapshot().currency).toBeLessThan(before);

    const rested = await saves.load("autosave");
    expect(rested?.party[0]?.statuses).toEqual([]);
  });

  it("camps on a supply outside a settlement, leaving conditions in place", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.travel("location.mossroad");
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => ({
        ...member,
        hp: 1,
        mp: 0,
        statuses: [{ id: "poison" as const, remainingTurns: 3, potency: 4 }]
      })),
      inventory: [...state.inventory, { itemId: CAMP_SUPPLY, quantity: 2 }],
      world: { ...state.world, flags: { ...state.world.flags, currency: 0 } }
    });
    await bridge.continueGame();

    const result = await bridge.rest();
    expect(result.success, result.message).toBe(true);

    const camped = await saves.load("autosave");
    expect(camped?.party[0]?.hp).toBe(camped?.party[0]?.stats.maxHp);
    // A field camp restores body but not affliction — which is exactly what
    // gives a status cure something to do.
    expect(camped?.party[0]?.statuses.length).toBe(1);
    expect(camped?.inventory.find(({ itemId }) => itemId === CAMP_SUPPLY)?.quantity).toBe(1);
  });

  it("refuses to camp with no supply, and says why", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    await bridge.travel("location.mossroad");
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      inventory: state.inventory.filter(({ itemId }) => itemId !== CAMP_SUPPLY)
    });
    await bridge.continueGame();

    const result = await bridge.rest();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/rations/i);
  });
});

describe("the camp supply is always reachable", () => {
  it("is authored and stocked by every vendor", () => {
    const supply = items.find(({ id }) => id === CAMP_SUPPLY);
    expect(supply, "the camp supply exists").toBeDefined();
    expect(supply?.kind).toBe("consumable");

    // Town-only rest risks stranding a party deep in a dungeon with no coin, so
    // the field alternative must be buyable wherever the player has been.
    expect(vendorProfiles.length).toBeGreaterThan(0);
    for (const vendor of vendorProfiles) {
      expect(vendor.catalogItemIds, vendor.id).toContain(CAMP_SUPPLY);
    }
  });

  it("can actually be bought", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, currency: 500 } }
    });
    await bridge.continueGame();

    const vendor = vendorProfiles.find(({ catalogItemIds }) => catalogItemIds.includes(CAMP_SUPPLY));
    if (!vendor) throw new Error("expected a vendor stocking the camp supply");
    await bridge.interactNpc(vendor.npcId);

    const before = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === CAMP_SUPPLY)?.quantity ?? 0;
    const result = await bridge.buyItem(CAMP_SUPPLY);
    expect(result.success, result.message).toBe(true);
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === CAMP_SUPPLY)?.quantity ?? 0)
      .toBe(before + 1);
  });
});
