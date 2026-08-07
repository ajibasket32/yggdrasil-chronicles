import { describe, expect, it } from "vitest";
import { calculateBattleReward } from "../../src/engine/combat";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

/**
 * The engine is required to be deterministic and seeded — it is the reason the
 * offline campaign simulation is trustworthy and the reason a bug can be
 * reproduced from a seed. `rng.test.ts` proves the primitive replays; nothing
 * proved the property that actually matters, which is that the same seed and
 * the same actions produce the same game.
 */

const DRAFT = { name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" } as const;

function createBridge(seed: string, atMillis = 1_700_000_000_000): {
  bridge: EngineGameBridge;
  saves: SaveRepository;
} {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed, () => atMillis), saves };
}

/** Fights `encounterId` with a fixed action script and returns everything observable. */
async function fightToEnd(bridge: EngineGameBridge, encounterId: string): Promise<{
  log: string[];
  actors: string[];
  phase: string | undefined;
  round: number | undefined;
}> {
  bridge.startEncounter(encounterId);
  for (let turn = 0; turn < 40; turn += 1) {
    const battle = bridge.getSnapshot().battle;
    if (!battle || battle.phase !== "choosing") break;
    await bridge.chooseBattleAction("attack");
  }
  const battle = bridge.getSnapshot().battle;
  return {
    log: [...(battle?.log ?? [])],
    actors: (battle?.actors ?? []).map((actor) =>
      `${actor.id}:${actor.hp}/${actor.maxHp}:${actor.mp}/${actor.maxMp}:${actor.alive}`),
    phase: battle?.phase,
    round: battle?.round
  };
}

describe("the same seed and the same actions produce the same game", () => {
  it("replays a whole battle identically across two independent chronicles", async () => {
    const first = createBridge("determinism-seed");
    const second = createBridge("determinism-seed");
    await first.bridge.newGame(DRAFT);
    await second.bridge.newGame(DRAFT);

    const left = await fightToEnd(first.bridge, "encounter.mossroad-foragers");
    const right = await fightToEnd(second.bridge, "encounter.mossroad-foragers");

    expect(left.log.length).toBeGreaterThan(2);
    expect(left.log).toEqual(right.log);
    expect(left.actors).toEqual(right.actors);
    expect(left.phase).toBe(right.phase);
    expect(left.round).toBe(right.round);
  });

  it("diverges when the seed differs, so the comparison above is not vacuous", async () => {
    const first = createBridge("seed-alpha");
    const second = createBridge("seed-beta");
    await first.bridge.newGame(DRAFT);
    await second.bridge.newGame(DRAFT);

    const left = await fightToEnd(first.bridge, "encounter.mossroad-foragers");
    const right = await fightToEnd(second.bridge, "encounter.mossroad-foragers");
    expect(left.log).not.toEqual(right.log);
  });

  it("is not perturbed by a save and reload in between", async () => {
    // Straight through.
    const direct = createBridge("round-trip-seed");
    await direct.bridge.newGame(DRAFT);
    const withoutReload = await fightToEnd(direct.bridge, "encounter.mossroad-foragers");

    // The same chronicle, written to storage and read back before the fight.
    const original = createBridge("round-trip-seed");
    await original.bridge.newGame(DRAFT);
    const reloaded = new EngineGameBridge(original.saves, () => "round-trip-seed", () => 1_700_000_000_000);
    await reloaded.initialize();
    await reloaded.continueGame();
    const afterReload = await fightToEnd(reloaded, "encounter.mossroad-foragers");

    // Persistence must be lossless where the rules are concerned: a chronicle
    // resumed from disk has to play out exactly as one that never stopped.
    expect(afterReload.log).toEqual(withoutReload.log);
    expect(afterReload.actors).toEqual(withoutReload.actors);
  });

  it("pays an identical reward for identical inputs", () => {
    for (const tier of ["minor", "standard", "major", "boss"] as const) {
      for (const level of [1, 7, 18]) {
        const left = calculateBattleReward(tier, level, "reward-seed");
        const right = calculateBattleReward(tier, level, "reward-seed");
        expect(left).toEqual(right);
      }
    }
  });
});

describe("a repeatable encounter is not the same lottery every time", () => {
  it("records and increments an engagement count that survives the save", async () => {
    const { bridge, saves } = createBridge("engagement-seed");
    await bridge.newGame(DRAFT);

    // Two engagements; a third is refused while the party is in no state to
    // fight, which is its own correct behaviour and not what this asserts.
    for (let fight = 0; fight < 2; fight += 1) {
      await fightToEnd(bridge, "encounter.mossroad-foragers");
      await bridge.leaveBattle();
    }

    const stored = await saves.load("autosave");
    expect(stored?.world.flags["progress.encounter.encounter.mossroad-foragers"]).toBe(2);
  });

  it("varies the reward roll across engagements of the same encounter", () => {
    // The reward seed was `${chronicle}:${encounter}` and nothing else, so
    // `itemRoll` was fixed for the life of a chronicle: a repeatable encounter
    // always dropped, or never did. The engagement count is what moves it.
    const rolls = new Set(
      [1, 2, 3, 4, 5, 6].map((engagement) =>
        calculateBattleReward("standard", 4, `chronicle:encounter.mossroad-foragers:${engagement}`).itemRoll)
    );
    expect(rolls.size).toBeGreaterThan(1);
  });

  it("still pays the same reward for the same engagement, so a reload is not a reroll", () => {
    const first = calculateBattleReward("standard", 4, "chronicle:encounter.mossroad-foragers:2");
    const second = calculateBattleReward("standard", 4, "chronicle:encounter.mossroad-foragers:2");
    expect(first).toEqual(second);
  });
});
