import { describe, expect, it } from "vitest";
import {
  advancedJobs,
  auditCampaignReadiness,
  bossPhases,
  coreCampaign,
  dialogueByNpcId,
  encounterAvailability,
  encounterFinds,
  getReachableQuestIds,
  locationEncounters,
  locationFinds,
  MIN_AUTHORED_DIALOGUE_LINES_PER_NPC,
  jobs,
  recruitProfiles,
  startingBuildLoadouts,
  validateContentPack,
  validateCampaignMetadata,
  worldRoutes
} from "../../src/content";

describe("core campaign content", () => {
  it("meets the authored campaign budget", () => {
    expect(coreCampaign.regions).toHaveLength(3);
    expect(coreCampaign.npcs).toHaveLength(30);
    expect(coreCampaign.quests.length).toBeGreaterThanOrEqual(35);
    expect(coreCampaign.quests.filter(({ mainStory }) => mainStory)).toHaveLength(15);
    expect(coreCampaign.encounters.filter(({ boss }) => boss)).toHaveLength(3);
    expect(startingBuildLoadouts).toHaveLength(24);
    expect(advancedJobs).toHaveLength(12);
    for (const job of jobs) {
      expect(advancedJobs.filter(({ baseJobId }) => baseJobId === job.id)).toHaveLength(2);
    }
    for (const branch of advancedJobs) {
      const matchingBuilds = startingBuildLoadouts.filter(({ jobId }) => jobId === branch.baseJobId);
      expect(matchingBuilds.every(({ startingSkills }) => startingSkills.includes(branch.signatureSkillId))).toBe(true);
    }
    expect(recruitProfiles).toHaveLength(3);
    expect(bossPhases.filter(({ encounterId }) => encounterId === "encounter.varn-rootless")).toHaveLength(3);
    const allDialogueLines = Object.values(dialogueByNpcId).flat();
    expect(allDialogueLines).toHaveLength(
      coreCampaign.npcs.length * MIN_AUTHORED_DIALOGUE_LINES_PER_NPC
    );
    expect(new Set(allDialogueLines).size).toBe(allDialogueLines.length);
    for (const npc of coreCampaign.npcs) {
      const lines = dialogueByNpcId[npc.id] ?? [];
      expect(lines, npc.id).toHaveLength(MIN_AUTHORED_DIALOGUE_LINES_PER_NPC);
      expect(new Set(lines).size, npc.id).toBe(lines.length);
    }
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
    expect(validateCampaignMetadata()).toEqual([]);
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

  it("walks the canonical main story from Hearthcross through the final boss without AI", () => {
    const result = auditCampaignReadiness(coreCampaign, {
      startLocationId: "location.hearthcross",
      routes: worldRoutes,
      locationEncounters,
      locationFinds,
      encounterFinds,
      encounterAvailability
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.mainQuestOrder).toEqual(
      coreCampaign.quests.filter(({ mainStory }) => mainStory).map(({ id }) => id)
    );
    expect(result.completedMainQuestIds).toContain("quest.architect-of-severance");
    expect(result.completedQuestIds).toHaveLength(coreCampaign.quests.length);
    expect(result.authoredQuestOrder.length).toBeGreaterThanOrEqual(35);
    expect(result.activityBudget.authoredQuestCount).toBeGreaterThanOrEqual(35);
    expect(result.activityBudget.repeatableEncounterVictories).toBeGreaterThan(0);
    expect(result.activityBudget.minimumPlayerActions).toBeGreaterThan(0);
    // Informational, so it belongs in notes: it fires on every healthy run, and
    // a warning that always fires is one nobody reads.
    expect(result.notes.some((note) => note.includes("not an hours estimate"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("not an hours estimate"))).toBe(false);
  });

  it("rejects a main-story collect objective when its authored sources are removed", () => {
    const result = auditCampaignReadiness(coreCampaign, {
      startLocationId: "location.hearthcross",
      routes: worldRoutes,
      locationEncounters,
      locationFinds: { ...locationFinds, "location.mossroad": [["item.vesleaf", 1]] },
      encounterFinds: { ...encounterFinds, "encounter.mossroad-foragers": [["item.vesleaf", 2]] },
      encounterAvailability
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("quest.marks-in-rain has an unsourced collect objective item.brass-rivet x3");
  });

  it("rejects ambiguous route inputs", () => {
    const result = auditCampaignReadiness(coreCampaign, {
      startLocationId: "location.hearthcross",
      routes: [...worldRoutes, {
        fromId: "location.hearthcross",
        toId: "location.mossroad",
        direction: "east"
      }],
      locationEncounters,
      locationFinds,
      encounterFinds,
      encounterAvailability
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("location.hearthcross has ambiguous east routes");
  });

  it("rejects an unplaced final boss", () => {
    const result = auditCampaignReadiness(coreCampaign, {
      startLocationId: "location.hearthcross",
      routes: worldRoutes,
      locationEncounters: { ...locationEncounters, "location.starless-vault": ["encounter.vault-echoes"] },
      locationFinds,
      encounterFinds,
      encounterAvailability
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Boss encounter is not placed in the world: encounter.varn-rootless");
  });

  it("rejects an ordinary encounter without repeatable availability semantics", () => {
    const result = auditCampaignReadiness(coreCampaign, {
      startLocationId: "location.hearthcross",
      routes: worldRoutes,
      locationEncounters,
      locationFinds,
      encounterFinds,
      encounterAvailability: { ...encounterAvailability, "encounter.ashfall-motes": "once" }
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("encounter.ashfall-motes is ordinary but is not repeatable");
  });
});
