import { describe, expect, it } from "vitest";
import {
  coreCampaign,
  encounterFinds,
  getReachableQuestIds,
  locationEncounters,
  locationFinds,
  validateContentPack,
  worldRoutes
} from "../../src/content";

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

  it("assigns one visible route direction to every location connection", () => {
    for (const location of coreCampaign.locations) {
      const routes = worldRoutes.filter(({ fromId }) => fromId === location.id);
      expect(routes.map(({ toId }) => toId).sort()).toEqual([...location.connections].sort());
      expect(new Set(routes.map(({ direction }) => direction)).size).toBe(routes.length);
    }
  });

  it("provides a playable source for every authored collect and defeat objective", () => {
    const availableItemIds = new Set([
      ...Object.values(locationFinds).flatMap((finds) => finds.map(([itemId]) => itemId)),
      ...Object.values(encounterFinds).flatMap((finds) => finds.map(([itemId]) => itemId))
    ]);
    const placedEncounterIds = new Set(Object.values(locationEncounters).flat());
    const placedEnemyIds = new Set(
      coreCampaign.encounters
        .filter(({ id }) => placedEncounterIds.has(id))
        .flatMap(({ enemyIds }) => enemyIds)
    );

    for (const quest of coreCampaign.quests) {
      for (const objective of quest.steps) {
        if (objective.kind === "collect") expect(availableItemIds.has(objective.targetId), quest.id).toBe(true);
        if (objective.kind === "defeat") expect(placedEnemyIds.has(objective.targetId), quest.id).toBe(true);
      }
    }
  });
});
