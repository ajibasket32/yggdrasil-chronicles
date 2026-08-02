import { describe, expect, it } from "vitest";
import { simulateCampaignViability } from "../../tools/campaign-simulation";

describe("authored campaign viability simulation", () => {
  it("walks the offline authored campaign and defeats every boss across fixed seeds", () => {
    const result = simulateCampaignViability();

    expect(result.valid, result.errors.join("\n")).toBe(true);
    expect(result.authoredQuestCount).toBeGreaterThanOrEqual(35);
    expect(result.completedMainQuestIds).toHaveLength(15);
    expect(result.bossResults).toHaveLength(3);
    for (const boss of result.bossResults) {
      expect(boss.wins).toBe(boss.attempts);
      expect(boss.failedSeeds).toEqual([]);
      expect(boss.activatedPhases.length).toBeGreaterThan(0);
      expect(boss.longestBattleRounds).toBeLessThanOrEqual(80);
    }
  });

  it("is deterministic and keeps the report diagnostic", () => {
    const first = simulateCampaignViability();
    const second = simulateCampaignViability();

    expect(second).toEqual(first);
    expect(first.combatProfile).toContain("EngineGameBridge");
    expect(first.bossResults.map(({ encounterId }) => encounterId)).toEqual([
      "encounter.mire-antler",
      "encounter.kiln-heart",
      "encounter.varn-rootless"
    ]);
  });
});
