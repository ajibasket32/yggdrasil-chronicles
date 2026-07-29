import { describe, expect, it } from "vitest";
import type { ContentPack } from "../../src/shared/types";
import { coreCampaign, validateContentPack } from "../../src/content";

const copyPack = (): ContentPack => structuredClone(coreCampaign);

describe("content validator", () => {
  it("rejects unknown quest targets", () => {
    const pack = copyPack();
    const quest = pack.quests[0];
    if (!quest) throw new Error("Fixture must contain a quest");
    quest.steps = [{ kind: "talk", targetId: "npc.does-not-exist", count: 1 }];

    const result = validateContentPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`${quest.id} has unknown talk target npc.does-not-exist`);
  });

  it("rejects cyclic prerequisite graphs", () => {
    const pack = copyPack();
    const first = pack.quests.find(({ id }) => id === "quest.first-silence");
    const conclusion = pack.quests.find(({ id }) => id === "quest.a-new-concord");
    if (!first || !conclusion) throw new Error("Fixture must contain campaign endpoints");
    first.prerequisites = [conclusion.id];

    const result = validateContentPack(pack);
    expect(result.valid).toBe(false);
    expect(result.reachableQuestIds).not.toContain(first.id);
    expect(result.errors.some((error) => error.includes("unreachable"))).toBe(true);
  });

  it("rejects dangling location connections", () => {
    const pack = copyPack();
    const location = pack.locations[0];
    if (!location) throw new Error("Fixture must contain a location");
    location.connections.push("location.nowhere");

    const result = validateContentPack(pack);
    expect(result.errors).toContain(`${location.id} connects to unknown location location.nowhere`);
  });

  it("rejects quest consequences with unknown world-state targets", () => {
    const pack = copyPack();
    const quest = pack.quests[0];
    if (!quest) throw new Error("Fixture must contain a quest");
    quest.consequences = [
      { type: "adjust_relationship", npcId: "npc.unknown", axis: "trust", amount: 4 },
      { type: "adjust_faction", factionId: "faction.unknown", amount: 2 },
      { type: "set_flag", key: "unsafe flag", value: true }
    ];

    const result = validateContentPack(pack);
    expect(result.errors).toEqual(expect.arrayContaining([
      `${quest.id} has unknown relationship target npc.unknown`,
      `${quest.id} has unknown faction consequence target faction.unknown`,
      `${quest.id} has unsafe consequence flag unsafe flag`
    ]));
  });
});
