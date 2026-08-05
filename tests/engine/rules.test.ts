import { describe, expect, it } from "vitest";
import { addItem, hasItems, removeItem } from "../../src/engine/inventory";
import { canUnlockJob, grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import {
  applyQuestObjective,
  createQuestProgress,
  refreshQuestAvailability,
  startQuest
} from "../../src/engine/quests";
import {
  adjustFactionStanding,
  adjustRelationship,
  applyQuestConsequences
} from "../../src/engine/relationships";
import type { QuestDefinition } from "../../src/shared/types";
import { makePlayerCharacter } from "./fixtures";

describe("progression and inventory", () => {
  it("levels up with deterministic stat growth", () => {
    const character = makePlayerCharacter();
    const result = grantExperience(character, totalExperienceForLevel(3));
    expect(result.levelsGained).toBe(2);
    expect(result.character.level).toBe(3);
    expect(result.character.stats.maxHp).toBe(character.stats.maxHp + 16);
  });

  it("checks branching job prerequisites", () => {
    const character = { ...makePlayerCharacter(), level: 5, skills: ["skill-riposte"] };
    expect(canUnlockJob(character, {
      id: "job-warden",
      name: "Warden",
      prerequisiteJobIds: ["job-vanguard"],
      minimumLevel: 5,
      requiredSkillIds: ["skill-riposte"]
    }, ["job-vanguard"])).toBe(true);
  });

  it("adds, checks, and consumes immutable inventory stacks", () => {
    const original = [{ itemId: "potion", quantity: 1 }];
    const added = addItem(original, "potion", 2);
    expect(added).toEqual([{ itemId: "potion", quantity: 3 }]);
    expect(original[0]?.quantity).toBe(1);
    expect(hasItems(added, [{ itemId: "potion", quantity: 3 }])).toBe(true);
    expect(removeItem(added, "potion", 3)).toEqual([]);
  });
});

describe("quests and relationships", () => {
  const quests: QuestDefinition[] = [
    {
      id: "quest-first",
      title: "First",
      summary: "Meet the ferryman.",
      prerequisites: [],
      steps: [{ kind: "talk", targetId: "npc-ferryman", count: 1 }],
      rewardTier: "minor",
      mainStory: true,
      consequences: []
    },
    {
      id: "quest-second",
      title: "Second",
      summary: "Reach the causeway.",
      prerequisites: ["quest-first"],
      steps: [{ kind: "travel", targetId: "causeway", count: 1 }],
      rewardTier: "standard",
      mainStory: true,
      consequences: []
    }
  ];

  it("advances a validated quest graph", () => {
    let progress = createQuestProgress(quests);
    expect(progress.map((quest) => quest.state)).toEqual(["available", "locked"]);
    progress = startQuest(progress, "quest-first");
    progress = applyQuestObjective(progress, quests[0]!, { kind: "talk", targetId: "npc-ferryman" });
    progress = refreshQuestAvailability(progress, quests);
    expect(progress.map((quest) => quest.state)).toEqual(["completed", "available"]);
  });

  it("clamps relationship and faction axes to canonical bounds", () => {
    const relationships = adjustRelationship([], "npc-ferryman", "trust", 500);
    expect(relationships[0]?.trust).toBe(100);
    expect(adjustFactionStanding({}, "faction-reeds", -400)["faction-reeds"]).toBe(-100);
  });

  it("applies authored quest consequences without mutating the prior world", () => {
    const world = {
      currentLocationId: "location.hearthcross",
      discoveredLocationIds: ["location.hearthcross"],
      flags: {},
      defeatedBossIds: [],
      factionStanding: {},
      relationships: [],
      chronicle: [],
      playSeconds: 0,
      worldMinutes: 0
    };
    const next = applyQuestConsequences(world, [
      { type: "adjust_relationship", npcId: "npc-ferryman", axis: "trust", amount: 6 },
      { type: "adjust_faction", factionId: "faction-reeds", amount: 4 },
      { type: "set_flag", key: "outcome.quest-first", value: true }
    ]);

    expect(next.relationships[0]).toMatchObject({ npcId: "npc-ferryman", trust: 6 });
    expect(next.factionStanding["faction-reeds"]).toBe(4);
    expect(next.flags["outcome.quest-first"]).toBe(true);
    expect(world).toMatchObject({ flags: {}, factionStanding: {}, relationships: [] });
  });
});
