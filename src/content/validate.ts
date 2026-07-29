import type { ContentPack, QuestDefinition } from "../shared/types";

export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  reachableQuestIds: string[];
}

const collectDuplicates = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
};

export function getReachableQuestIds(quests: readonly QuestDefinition[]): string[] {
  const allIds = new Set(quests.map((quest) => quest.id));
  const reachable = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const quest of quests) {
      const requirementsExist = quest.prerequisites.every((id) => allIds.has(id));
      const requirementsReachable = quest.prerequisites.every((id) => reachable.has(id));
      if (!reachable.has(quest.id) && requirementsExist && requirementsReachable) {
        reachable.add(quest.id);
        changed = true;
      }
    }
  }

  return [...reachable];
}

export function validateContentPack(pack: ContentPack): ContentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entityGroups = [
    ["region", pack.regions.map(({ id }) => id)],
    ["location", pack.locations.map(({ id }) => id)],
    ["npc", pack.npcs.map(({ id }) => id)],
    ["quest", pack.quests.map(({ id }) => id)],
    ["encounter", pack.encounters.map(({ id }) => id)],
    ["item", pack.items.map(({ id }) => id)]
  ] as const;

  for (const [group, ids] of entityGroups) {
    for (const id of collectDuplicates(ids)) errors.push(`Duplicate ${group} id: ${id}`);
  }

  const regionIds = new Set(pack.regions.map(({ id }) => id));
  const locationIds = new Set(pack.locations.map(({ id }) => id));
  const npcIds = new Set(pack.npcs.map(({ id }) => id));
  const questIds = new Set(pack.quests.map(({ id }) => id));
  const encounterEnemyIds = new Set(pack.encounters.flatMap(({ enemyIds }) => enemyIds));
  const itemIds = new Set(pack.items.map(({ id }) => id));

  for (const location of pack.locations) {
    if (!regionIds.has(location.regionId)) errors.push(`${location.id} references unknown region ${location.regionId}`);
    for (const connection of location.connections) {
      if (!locationIds.has(connection)) errors.push(`${location.id} connects to unknown location ${connection}`);
      const reverse = pack.locations.find(({ id }) => id === connection);
      if (reverse && !reverse.connections.includes(location.id)) {
        warnings.push(`${location.id} -> ${connection} is not reciprocal`);
      }
    }
  }

  for (const npc of pack.npcs) {
    if (!locationIds.has(npc.locationId)) errors.push(`${npc.id} references unknown location ${npc.locationId}`);
  }

  for (const quest of pack.quests) {
    for (const prerequisite of quest.prerequisites) {
      if (!questIds.has(prerequisite)) errors.push(`${quest.id} requires unknown quest ${prerequisite}`);
      if (prerequisite === quest.id) errors.push(`${quest.id} requires itself`);
    }
    for (const questStep of quest.steps) {
      const targetExists =
        (questStep.kind === "talk" && npcIds.has(questStep.targetId)) ||
        (questStep.kind === "travel" && locationIds.has(questStep.targetId)) ||
        (questStep.kind === "collect" && itemIds.has(questStep.targetId)) ||
        (questStep.kind === "defeat" && encounterEnemyIds.has(questStep.targetId));
      if (!targetExists) errors.push(`${quest.id} has unknown ${questStep.kind} target ${questStep.targetId}`);
      if (questStep.count < 1) errors.push(`${quest.id} has a non-positive objective count`);
    }
  }

  const reachableQuestIds = getReachableQuestIds(pack.quests);
  const reachable = new Set(reachableQuestIds);
  for (const quest of pack.quests) {
    if (!reachable.has(quest.id)) errors.push(`${quest.id} is unreachable (cycle or broken prerequisite chain)`);
  }

  const mainQuests = pack.quests.filter(({ mainStory }) => mainStory);
  if (mainQuests.length === 0) errors.push("Content pack has no main-story quests");
  if (!mainQuests.some(({ rewardTier }) => rewardTier === "boss")) {
    errors.push("Main story has no boss-tier conclusion");
  }
  if (pack.regions.length < 3) warnings.push("Core campaign is designed for three regions");

  return { valid: errors.length === 0, errors, warnings, reachableQuestIds };
}

