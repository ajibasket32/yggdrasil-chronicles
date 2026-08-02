import { describe, expect, it } from "vitest";
import { encounters, jobs } from "../../src/content";
import { ENEMY_HEALTH_CURVE, enemyMaxHealth } from "../../src/engine/combat";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

/** Plays a fight to its conclusion, preferring an affordable offensive form. */
async function playOut(bridge: EngineGameBridge, maxTurns = 60): Promise<{ phase: string; rounds: number }> {
  let rounds = 0;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const battle = bridge.getSnapshot().battle;
    if (!battle) break;
    rounds = Math.max(rounds, battle.round);
    if (battle.phase !== "choosing") return { phase: battle.phase, rounds };
    const skill = battle.activeSkills.find((option) => option.affordable && option.target === "enemy");
    await bridge.chooseBattleAction(skill ? "skill" : "attack", skill?.id);
  }
  return { phase: bridge.getSnapshot().battle?.phase ?? "unresolved", rounds };
}

async function startAt(
  jobId: string,
  level: number,
  difficulty: "easy" | "normal" | "hard",
  seed: string
): Promise<EngineGameBridge> {
  const saves = new SaveRepository(new MemorySaveStorage());
  const bridge = new EngineGameBridge(saves, () => seed);
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId, difficulty });
  if (level > 1) {
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => grantExperience(member, totalExperienceForLevel(level)).character)
    });
    await bridge.continueGame();
  }
  return bridge;
}

describe("a form is worth choosing over a free attack", () => {
  it("beats the basic attack by a wide enough margin to be worth its MP", async () => {
    const bridge = await startAt("vanguard", 5, "normal", "margin-fixture");
    bridge.startEncounter("encounter.flooded-grove");
    const skills = bridge.getSnapshot().battle?.activeSkills ?? [];
    expect(skills.length).toBeGreaterThan(0);
    // The basic attack is power 12. A form costing MP must clear it decisively;
    // at the previous 14-24 range a skill was worth 3-18% over a free swing,
    // which made the whole resource layer close to pointless.
    for (const skill of skills) {
      expect(skill.power, skill.id).toBeGreaterThanOrEqual(24);
    }
  });
});

describe("bosses last long enough to show their authored phases", () => {
  it("scales boss health with the number of attackers", () => {
    const solo = enemyMaxHealth(10, true, 1);
    const four = enemyMaxHealth(10, true, 4);
    expect(four).toBe(solo * 4);
    // Trash health does not scale this way: a group already scales by count.
    expect(enemyMaxHealth(10, false, 4)).toBe(enemyMaxHealth(10, false, 1));
  });

  it("keeps every named boss above the trash curve", () => {
    for (const encounter of encounters.filter(({ boss }) => boss)) {
      const level = encounter.level ?? 1;
      expect(enemyMaxHealth(level, true, 1), encounter.id)
        .toBeGreaterThan(enemyMaxHealth(level, false, 1));
    }
  });

  it("reaches the second phase of a named boss instead of ending first", async () => {
    // mire-antler's second phase begins at 50% health. Under the old curve the
    // fight ended in about two rounds and the threshold was skipped entirely.
    const bridge = await startAt("vanguard", 9, "easy", "phase-fixture");
    bridge.startEncounter("encounter.mire-antler");

    // Watch for the threshold as it happens: the battle log keeps only the
    // last eight lines, so by the end of a long fight the telegraph has
    // scrolled away even though it fired.
    let reachedSecondPhase = false;
    let rounds = 0;
    for (let turn = 0; turn < 80; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle) break;
      rounds = Math.max(rounds, battle.round);
      if (battle.bossPhase === "Rooted Panic") reachedSecondPhase = true;
      if (battle.phase !== "choosing") break;
      const skill = battle.activeSkills.find((option) => option.affordable && option.target === "enemy");
      await bridge.chooseBattleAction(skill ? "skill" : "attack", skill?.id);
    }

    expect(bridge.getSnapshot().battle?.phase).toBe("victory");
    expect(rounds).toBeGreaterThanOrEqual(4);
    expect(reachedSecondPhase, "the 50%-health phase never activated").toBe(true);
  });
});

describe("every starting build can clear a three-enemy encounter at its authored level", () => {
  it("wins encounter.flooded-grove on normal with any calling", async () => {
    const grove = encounters.find(({ id }) => id === "encounter.flooded-grove");
    expect(grove?.enemyIds.length).toBe(3);

    for (const job of jobs) {
      const bridge = await startAt(job.id, 5, "normal", `grove-${job.id}`);
      bridge.startEncounter("encounter.flooded-grove");
      const result = await playOut(bridge);
      // A solo party at one level above the encounter should not lose to it —
      // this is the action-economy guarantee, checked per build rather than
      // for one convenient class.
      expect(result.phase, `${job.id} lost encounter.flooded-grove on normal`).toBe("victory");
    }
  }, 120_000);

  it("stays comfortable on easy for every calling", async () => {
    for (const job of jobs) {
      const bridge = await startAt(job.id, 5, "easy", `grove-easy-${job.id}`);
      bridge.startEncounter("encounter.flooded-grove");
      const result = await playOut(bridge);
      expect(result.phase, `${job.id} lost encounter.flooded-grove on easy`).toBe("victory");
    }
  }, 120_000);
});

describe("the health curve is authored in one place", () => {
  it("exposes both tiers as data", () => {
    expect(ENEMY_HEALTH_CURVE.trash.base).toBeGreaterThan(0);
    expect(ENEMY_HEALTH_CURVE.boss.base).toBeGreaterThan(ENEMY_HEALTH_CURVE.trash.base);
    expect(ENEMY_HEALTH_CURVE.boss.perLevel).toBeGreaterThan(ENEMY_HEALTH_CURVE.trash.perLevel);
  });
});
