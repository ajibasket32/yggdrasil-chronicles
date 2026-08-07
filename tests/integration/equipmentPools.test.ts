import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

const FIXED_SEED = "equipment-pool-fixture";

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => FIXED_SEED), saves };
}

/**
 * The Slagplate Harness is the one authored piece that moves both maxima at
 * once — +34 maximum health, -4 maximum MP — so a single fixture exercises
 * both directions of the battle-to-stored carry-back.
 */
async function menderWearingTheHarness(
  bridge: EngineGameBridge,
  saves: SaveRepository
): Promise<void> {
  await bridge.newGame({ name: "Vale", ancestryId: "sylvan", jobId: "mender", difficulty: "normal" });
  const initial = await saves.load("autosave");
  if (!initial) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...initial,
    party: initial.party.map((member, index) => index === 0 ? { ...member, level: 8 } : member),
    inventory: [...initial.inventory, { itemId: "item.slagplate-harness", quantity: 1 }]
  });
  await bridge.continueGame();
  const memberId = bridge.getSnapshot().party[0]?.id ?? "";
  const equipped = await bridge.setEquipment(memberId, "armor", "item.slagplate-harness");
  expect(equipped.success, equipped.message).toBe(true);
}

async function escapeOneBattle(bridge: EngineGameBridge): Promise<void> {
  bridge.startEncounter("encounter.mossroad-foragers");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (bridge.getSnapshot().battle?.phase === "escaped") break;
    await bridge.chooseBattleAction("escape");
  }
  await bridge.leaveBattle();
}

describe("equipment that lowers a maximum does not mint the difference back", () => {
  it("keeps stored MP within the maximum the character actually has", async () => {
    const { bridge, saves } = createBridge();
    await menderWearingTheHarness(bridge, saves);

    const effectiveMaxMp = bridge.getSnapshot().party[0]?.maxMp ?? 0;
    expect(effectiveMaxMp).toBeGreaterThan(0);

    // Fight and flee repeatedly. Each round-trip used to measure the shortfall
    // against the harness-reduced ceiling and then refund it against the
    // unmodified base pool, so stored MP climbed past the ceiling for free.
    for (let battle = 0; battle < 6; battle += 1) {
      await escapeOneBattle(bridge);
      const stored = (await saves.load("autosave"))?.party[0]?.mp ?? 0;
      expect(stored, `after battle ${battle + 1}`).toBeLessThanOrEqual(effectiveMaxMp);
    }
  });

  it("still spends the bonus pool first when equipment raises a maximum", async () => {
    const { bridge, saves } = createBridge();
    await menderWearingTheHarness(bridge, saves);

    const view = bridge.getSnapshot().party[0];
    const baseMaxHp = (await saves.load("autosave"))?.party[0]?.stats.maxHp ?? 0;
    // The harness grants +34 maximum health, so the battle ceiling is above base.
    expect(view?.maxHp ?? 0).toBeGreaterThan(baseMaxHp);

    await escapeOneBattle(bridge);
    const stored = (await saves.load("autosave"))?.party[0];
    // Damage taken comes out of the granted pool before the base one, and the
    // stored value never exceeds the base maximum it is recorded against.
    expect(stored?.hp ?? 0).toBeLessThanOrEqual(baseMaxHp);
    expect(stored?.hp ?? 0).toBeGreaterThan(0);
  });
});
