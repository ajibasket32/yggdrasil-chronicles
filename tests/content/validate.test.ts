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
});
