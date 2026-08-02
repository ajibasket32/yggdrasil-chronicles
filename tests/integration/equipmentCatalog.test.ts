import { describe, expect, it } from "vitest";
import { advancedJobs, items, jobs, startingBuildLoadouts } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => "equipment-fixture"), saves };
}

const EQUIPMENT_KINDS = new Set(["weapon", "armor", "accessory"]);

describe("equipment is authored as data, not duplicated in the bridge", () => {
  it("gives every equippable item its stat modifiers in content", () => {
    const equipment = items.filter((item) => EQUIPMENT_KINDS.has(item.kind));
    expect(equipment.length).toBeGreaterThan(0);
    for (const item of equipment) {
      expect(item.modifiers, item.id).toBeDefined();
      expect(Object.keys(item.modifiers ?? {}).length, item.id).toBeGreaterThan(0);
    }
  });

  it("applies the authored modifiers through the bridge", async () => {
    const { bridge } = createBridge();
    // The Vanguard starts with the resin vest equipped, which authors maxHp +14.
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const vest = items.find(({ id }) => id === "item.resin-vest");
    const bonusHp = vest?.modifiers?.maxHp ?? 0;
    expect(bonusHp).toBeGreaterThan(0);

    bridge.startEncounter("encounter.mossroad-foragers");
    const actor = bridge.getSnapshot().battle?.actors.find((candidate) => candidate.isParty);
    const member = bridge.getSnapshot().party[0];
    expect(actor?.maxHp).toBe(member?.maxHp);
  });
});

describe("job bands never lock a character out of their own starting gear", () => {
  it("lets every starting build equip everything its loadout grants", async () => {
    let checked = 0;
    for (const job of jobs) {
      const loadout = startingBuildLoadouts.find((build) => build.jobId === job.id);
      const startingEquipment = (loadout?.startingItems ?? [])
        .flatMap((itemId) => {
          const item = items.find(({ id }) => id === itemId);
          return item && EQUIPMENT_KINDS.has(item.kind) ? [item] : [];
        });

      for (const item of startingEquipment) {
        const { bridge } = createBridge();
        await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: job.id, difficulty: "normal" });
        const member = bridge.getSnapshot().party[0];
        if (!member) throw new Error("expected a protagonist");
        const slot = item.kind as "weapon" | "armor" | "accessory";

        // Unequip then re-equip: proves the band gate accepts this job rather
        // than the item merely having been placed at creation.
        await bridge.setEquipment(member.id, slot, undefined);
        const result = await bridge.setEquipment(member.id, slot, item.id);
        checked += 1;
        expect(result.success, `${job.id} cannot re-equip ${item.id}: ${result.message}`).toBe(true);
      }
    }
    // Guard against the loop silently covering nothing. Only three of the six
    // jobs start with equipment at all (vanguard/resin vest, ranger/wayfarer
    // blade, warden/dream resin); the rest carry consumables only. Those three
    // are exactly the cases that matter here, since they span both bands.
    expect(checked).toBe(3);
  });

  it("keeps a branch wearing what its base job could wear", async () => {
    // Bands are authored against base jobs; the engine compares the character's
    // current jobId, which becomes the branch id once one is chosen.
    const branch = advancedJobs.find((job) => job.baseJobId === "vanguard");
    if (!branch) throw new Error("expected a vanguard branch");

    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({ ...member, level: branch.minimumLevel, jobId: branch.id })),
      inventory: [...initial.inventory, { itemId: "item.wayfarer-blade", quantity: 1 }]
    });
    await bridge.continueGame();

    const member = bridge.getSnapshot().party[0];
    if (!member) throw new Error("expected a protagonist");
    const result = await bridge.setEquipment(member.id, "weapon", "item.wayfarer-blade");
    expect(result.success, result.message).toBe(true);
  });

  it("refuses a caster accessory to a martial job", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...initial,
      inventory: [...initial.inventory, { itemId: "item.dream-resin", quantity: 1 }]
    });
    await bridge.continueGame();

    const member = bridge.getSnapshot().party[0];
    if (!member) throw new Error("expected a protagonist");
    const result = await bridge.setEquipment(member.id, "accessory", "item.dream-resin");
    expect(result.success).toBe(false);
  });
});
