import { describe, expect, it } from "vitest";
import { jobs, levelUpSkills, levelUpSkillsFor, skillsLearnedBetween } from "../../src/content";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "levelup-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

describe("levelling teaches new forms", () => {
  it("authors grants for every starting calling", () => {
    for (const job of jobs) {
      const grants = levelUpSkills.filter((grant) => grant.jobId === job.id);
      expect(grants.length, job.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("spreads grants across the campaign rather than clustering them early", () => {
    const levels = [...new Set(levelUpSkills.map(({ level }) => level))].sort((a, b) => a - b);
    expect(Math.min(...levels)).toBeGreaterThan(1);
    // The campaign's final region band starts at 14, so something must land after it.
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(14);
  });

  it("only grants skills that exist in the combat catalog", async () => {
    // Any unknown id is silently dropped by the bridge, so a typo here would be
    // invisible; check it against a real character's usable forms instead.
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const expected = levelUpSkillsFor("vanguard", 20);
    expect(expected.length).toBeGreaterThan(0);
    await saves.save("autosave", {
      ...state,
      party: [{
        ...grantExperience(hero, totalExperienceForLevel(20)).character,
        skills: [...hero.skills, ...expected]
      }]
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    const offered = bridge.getSnapshot().battle?.activeSkills.map(({ id }) => id) ?? [];
    for (const skillId of expected) {
      expect(offered, `${skillId} is not a usable form`).toContain(skillId);
    }
  });

  it("reports only the forms crossed between two levels", () => {
    const all = levelUpSkillsFor("vanguard", 20);
    const crossed = skillsLearnedBetween("vanguard", 6, 12);
    expect(all.length).toBeGreaterThan(crossed.length);
    expect(skillsLearnedBetween("vanguard", 20, 20)).toEqual([]);
  });

  it("teaches a form on the level-up and announces it", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "easy" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const grant = levelUpSkills.find(({ jobId }) => jobId === "vanguard");
    if (!grant) throw new Error("expected a vanguard grant");

    // One experience point short of the level that teaches the form.
    await saves.save("autosave", {
      ...state,
      party: [{
        ...grantExperience(hero, totalExperienceForLevel(grant.level) - 1).character,
        experience: totalExperienceForLevel(grant.level) - 1
      }]
    });
    await bridge.continueGame();
    expect(bridge.getSnapshot().party[0]?.level).toBe(grant.level - 1);

    bridge.startEncounter("encounter.mossroad-foragers");
    for (let turn = 0; turn < 40; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }
    expect(bridge.getSnapshot().battle?.phase).toBe("victory");

    const log = bridge.getSnapshot().battle?.log.join(" ") ?? "";
    expect(log).toMatch(/reaches level \d+/);
    expect(bridge.getSnapshot().party[0]?.level).toBeGreaterThanOrEqual(grant.level);
  });
});

describe("experience progress is visible", () => {
  it("reports progress into the current level and the cost of the next", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const member = bridge.getSnapshot().party[0];
    expect(member?.experienceIntoLevel).toBe(0);
    expect(member?.experienceForNextLevel).toBe(totalExperienceForLevel(2) - totalExperienceForLevel(1));
  });

  it("advances that progress after a victory", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "easy" });
    bridge.startEncounter("encounter.mossroad-foragers");
    for (let turn = 0; turn < 40; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }
    await bridge.leaveBattle();

    const member = bridge.getSnapshot().party[0];
    // Either experience accrued into the level, or it was enough to level up.
    expect((member?.experienceIntoLevel ?? 0) > 0 || (member?.level ?? 1) > 1).toBe(true);
  });
});
