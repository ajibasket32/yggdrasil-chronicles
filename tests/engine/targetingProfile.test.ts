import { describe, expect, it } from "vitest";
import { enemyTargetingProfile } from "../../src/engine/combat";
import { enemyCombatant } from "../../src/integration/enemies";
import type { Difficulty } from "../../src/shared/types";

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

describe("targeting behaviour is authored, not a side effect of tuning", () => {
  it("keeps one enemy's profile identical across every difficulty", () => {
    for (const level of [1, 5, 9, 14, 20]) {
      const profiles = new Set(
        DIFFICULTIES.map((difficulty) =>
          enemyTargetingProfile(enemyCombatant("enemy.briar-wolf", 0, false, level, difficulty)))
      );
      expect(profiles.size, `level ${level} changed profile with difficulty`).toBe(1);
    }
  });

  it("keeps it identical however many enemies share the fight", () => {
    // Action-economy scaling divides offence across a group. That scales
    // strength and intellect but not agility, so a large group used to read as
    // fast-and-weak and switch to hunting the frailest character.
    for (const level of [1, 5, 9, 14, 20]) {
      const profiles = new Set(
        [1, 0.7, 0.5, 0.34].map((economyScale) =>
          enemyTargetingProfile(enemyCombatant("enemy.briar-wolf", 0, false, level, "normal", economyScale)))
      );
      expect(profiles.size, `level ${level} changed profile with group size`).toBe(1);
    }
  });

  it("still derives a profile for a combatant with none authored", () => {
    const bare = {
      ...enemyCombatant("enemy.briar-wolf", 0, false, 5, "normal"),
      targetingProfile: undefined
    };
    expect(["opportunist", "hunter", "shifting"]).toContain(enemyTargetingProfile(bare));
  });
});
