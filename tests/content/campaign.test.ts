import { describe, expect, it } from "vitest";
import { coreCampaign, getReachableQuestIds, validateContentPack } from "../../src/content";

describe("core campaign content", () => {
  it("meets the authored campaign budget", () => {
    expect(coreCampaign.regions).toHaveLength(3);
    expect(coreCampaign.npcs).toHaveLength(30);
    expect(coreCampaign.quests).toHaveLength(35);
    expect(coreCampaign.quests.filter(({ mainStory }) => mainStory)).toHaveLength(15);
    expect(coreCampaign.encounters.filter(({ boss }) => boss)).toHaveLength(3);
  });

  it("has globally unique stable ids within every entity kind", () => {
    const groups = [
      coreCampaign.regions,
      coreCampaign.locations,
      coreCampaign.npcs,
      coreCampaign.quests,
      coreCampaign.encounters,
      coreCampaign.items
    ];

    for (const group of groups) {
      const ids = group.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => /^[a-z]+[a-z0-9.-]*\.[a-z0-9.-]+$/.test(id))).toBe(true);
    }
  });

  it("keeps every authored quest reachable", () => {
    const reachable = getReachableQuestIds(coreCampaign.quests);
    expect(reachable).toHaveLength(coreCampaign.quests.length);
    expect(reachable).toContain("quest.a-new-concord");
  });

  it("passes reference and graph validation", () => {
    const result = validateContentPack(coreCampaign);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("provides a continuous bidirectional route through all regions", () => {
    const startId = "location.hearthcross";
    const visited = new Set<string>();
    const pending = [startId];
    while (pending.length > 0) {
      const id = pending.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const location = coreCampaign.locations.find((candidate) => candidate.id === id);
      pending.push(...(location?.connections ?? []));
    }
    expect(visited.size).toBe(coreCampaign.locations.length);
  });
});

