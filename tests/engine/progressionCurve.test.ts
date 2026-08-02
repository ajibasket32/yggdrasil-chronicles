import { describe, expect, it } from "vitest";
import { calculateBattleReward } from "../../src/engine/combat";
import { levelForExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { quests, regions } from "../../src/content";

const FINAL_BAND = regions.at(-1)?.recommendedLevel ?? [14, 22];

/**
 * Walks a completionist run: every authored quest, then the encounters the
 * quest objectives require. Deliberately conservative — it counts no optional
 * grinding at all, so a real player lands at or above this.
 */
function simulateCompletionistLevel(): { afterQuests: number; final: number } {
  let experience = 0;
  let level = 1;
  const grant = (tier: Parameters<typeof calculateBattleReward>[0], atLevel: number): void => {
    experience += calculateBattleReward(tier, atLevel, `curve:${tier}:${atLevel}`).experience;
    level = levelForExperience(experience);
  };

  for (const quest of quests) grant(quest.rewardTier, level);
  const afterQuests = level;

  // The encounters a playthrough must actually fight, at their authored levels.
  for (let i = 0; i < 12; i += 1) grant("standard", 4);
  for (let i = 0; i < 6; i += 1) grant("major", 12);
  grant("boss", 7);
  grant("boss", 14);
  grant("boss", 21);

  return { afterQuests, final: level };
}

describe("the experience curve and its rewards agree", () => {
  it("keeps the level curve quadratic", () => {
    // 50 * L * (L - 1): each level costs about 100*L more than the one before.
    expect(totalExperienceForLevel(2)).toBe(100);
    expect(totalExperienceForLevel(10)).toBe(4500);
    const stepEarly = totalExperienceForLevel(5) - totalExperienceForLevel(4);
    const stepLate = totalExperienceForLevel(20) - totalExperienceForLevel(19);
    expect(stepLate).toBeGreaterThan(stepEarly * 3);
  });

  it("grows rewards superlinearly so they do not fall behind that curve", () => {
    const seed = "reward-growth";
    const low = calculateBattleReward("standard", 4, seed).experience;
    const mid = calculateBattleReward("standard", 12, seed).experience;
    const high = calculateBattleReward("standard", 20, seed).experience;

    // A purely linear reward has equal successive differences. The curve it has
    // to keep up with does not, so neither can the reward.
    expect(mid - low).toBeGreaterThan(0);
    expect(high - mid).toBeGreaterThan(mid - low);
  });

  it("lands a completionist inside the authored final band", () => {
    const [floor, ceiling] = FINAL_BAND;
    const { afterQuests, final } = simulateCompletionistLevel();

    // The gap this closes: with a linear reward the same run finished around
    // level 16 against a 14-22 band, having done everything the game offers.
    expect(final).toBeGreaterThanOrEqual(floor);
    expect(final).toBeLessThanOrEqual(ceiling);
    // Quests alone should not carry a player to the end of the band; fighting
    // has to matter too.
    expect(afterQuests).toBeLessThan(final);
  });

  it("still rewards a harder encounter more than an easy one at the same level", () => {
    const seed = "tier-ordering";
    const minor = calculateBattleReward("minor", 10, seed).experience;
    const standard = calculateBattleReward("standard", 10, seed).experience;
    const major = calculateBattleReward("major", 10, seed).experience;
    const boss = calculateBattleReward("boss", 10, seed).experience;
    expect(standard).toBeGreaterThan(minor);
    expect(major).toBeGreaterThan(standard);
    expect(boss).toBeGreaterThan(major);
  });
});
