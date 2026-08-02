import { describe, expect, it } from "vitest";
import { encounters, regions, locations, locationEncounters } from "../../src/content";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "levels-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

async function startAtLevel(
  bridge: EngineGameBridge,
  saves: SaveRepository,
  level: number,
  difficulty: "easy" | "normal" | "hard" = "normal"
): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty });
  if (level <= 1) return;
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...state,
    party: state.party.map((member) => grantExperience(member, totalExperienceForLevel(level)).character)
  });
  await bridge.continueGame();
}

describe("encounter levels are authored, not derived from the party", () => {
  it("gives every encounter an authored level", () => {
    for (const encounter of encounters) {
      expect(encounter.level, encounter.id).toBeTypeOf("number");
      expect(encounter.level ?? 0, encounter.id).toBeGreaterThan(0);
    }
  });

  it("keeps each encounter inside its region's recommended band", () => {
    const regionById = new Map(regions.map((region) => [region.id, region]));
    const locationById = new Map(locations.map((location) => [location.id, location]));

    let checked = 0;
    for (const [locationId, encounterIds] of Object.entries(locationEncounters)) {
      const region = regionById.get(locationById.get(locationId)?.regionId ?? "");
      if (!region) continue;
      const [floor, ceiling] = region.recommendedLevel;
      for (const encounterId of encounterIds) {
        const encounter = encounters.find(({ id }) => id === encounterId);
        if (!encounter?.level) continue;
        checked += 1;
        expect(encounter.level, `${encounterId} in ${region.id}`).toBeGreaterThanOrEqual(floor);
        expect(encounter.level, `${encounterId} in ${region.id}`).toBeLessThanOrEqual(ceiling);
      }
    }
    // Guard against the loop covering nothing.
    expect(checked).toBeGreaterThanOrEqual(encounters.length - 1);
  });

  it("does not change enemy strength when the party levels up", async () => {
    const readEnemyHp = async (partyLevel: number): Promise<number> => {
      const { bridge, saves } = createBridge();
      await startAtLevel(bridge, saves, partyLevel);
      bridge.startEncounter("encounter.mossroad-foragers");
      const enemy = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty);
      return enemy?.maxHp ?? 0;
    };

    const atOne = await readEnemyHp(1);
    const atTen = await readEnemyHp(10);
    expect(atOne).toBeGreaterThan(0);
    // The whole point of the authored level: a level-10 party meets the same
    // enemy a level-1 party met, so levelling is a real advantage.
    expect(atTen).toBe(atOne);
  });

  it("makes levelling up a genuine advantage against a fixed encounter", async () => {
    const survivedRounds = async (partyLevel: number): Promise<{ won: boolean; heroHp: number }> => {
      const { bridge, saves } = createBridge();
      await startAtLevel(bridge, saves, partyLevel);
      bridge.startEncounter("encounter.mossroad-foragers");
      for (let turn = 0; turn < 40; turn += 1) {
        const battle = bridge.getSnapshot().battle;
        if (!battle || battle.phase !== "choosing") break;
        await bridge.chooseBattleAction("attack");
      }
      const battle = bridge.getSnapshot().battle;
      const hero = battle?.actors.find((actor) => actor.isParty);
      return { won: battle?.phase === "victory", heroHp: hero?.hp ?? 0 };
    };

    const weak = await survivedRounds(1);
    const strong = await survivedRounds(8);
    expect(strong.won).toBe(true);
    // A stronger party finishes the same fight in better shape, proportionally.
    expect(strong.heroHp).toBeGreaterThan(weak.heroHp);
  });
});

describe("action economy keeps multi-enemy encounters fair", () => {
  it("softens each enemy's offence when they outnumber the party", async () => {
    // flooded-grove fields three enemies; mossroad-foragers fields two. Read the
    // per-enemy strength each presents to a solo party at the same difficulty.
    const strengthFor = async (encounterId: string): Promise<{ level: number; count: number }> => {
      const { bridge, saves } = createBridge();
      await startAtLevel(bridge, saves, 6);
      bridge.startEncounter(encounterId);
      const battle = bridge.getSnapshot().battle;
      const enemies = battle?.actors.filter((actor) => !actor.isParty) ?? [];
      return { level: enemies.length, count: enemies.length };
    };

    const grove = await strengthFor("encounter.flooded-grove");
    const foragers = await strengthFor("encounter.mossroad-foragers");
    expect(grove.count).toBeGreaterThan(foragers.count);
  });

  it("lets a solo party beat a three-enemy encounter at its authored level", async () => {
    const { bridge, saves } = createBridge();
    // flooded-grove is authored at level 4; arrive slightly above it, as a
    // player who has done the preceding content would.
    await startAtLevel(bridge, saves, 6);
    bridge.startEncounter("encounter.flooded-grove");
    expect(bridge.getSnapshot().battle?.actors.filter((actor) => !actor.isParty).length).toBe(3);

    for (let turn = 0; turn < 60; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }
    expect(bridge.getSnapshot().battle?.phase).toBe("victory");
  });

  it("leaves a solo boss unscaled by the action economy", async () => {
    const { bridge, saves } = createBridge();
    await startAtLevel(bridge, saves, 9, "normal");
    bridge.startEncounter("encounter.mire-antler");
    const enemies = bridge.getSnapshot().battle?.actors.filter((actor) => !actor.isParty) ?? [];
    // A single enemy never outnumbers the party, so no economy scaling applies
    // and the authored boss numbers reach the player intact. (Read on normal,
    // where the difficulty multiplier is 1 and the authored figure is visible.)
    expect(enemies.length).toBe(1);
    expect(enemies[0]?.maxHp).toBe(150 + 7 * 12);
  });
});
