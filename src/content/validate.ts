import type { ContentPack, QuestDefinition } from "../shared/types";
import { knownPortraitTags } from "./portraits";
import { scenes } from "./scenes";

export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  reachableQuestIds: string[];
}

export interface CampaignRoute {
  readonly fromId: string;
  readonly toId: string;
  readonly direction: string;
}

export type CampaignFind = readonly [itemId: string, quantity: number];

/** Content-owned runtime sources used by the offline campaign simulation. */
export interface CampaignReadinessSources {
  readonly startLocationId: string;
  readonly routes: readonly CampaignRoute[];
  readonly locationEncounters: Readonly<Record<string, readonly string[]>>;
  readonly locationFinds: Readonly<Record<string, readonly CampaignFind[]>>;
  readonly encounterFinds: Readonly<Record<string, readonly CampaignFind[]>>;
  /** Explicitly distinguishes respawnable ordinary fights from permanent world bosses. */
  readonly encounterAvailability: Readonly<Record<string, "repeatable" | "once">>;
}

export interface CampaignActivityBudget {
  readonly authoredQuestCount: number;
  readonly authoredObjectiveCount: number;
  readonly mainQuestCount: number;
  readonly mainObjectiveCount: number;
  readonly routeTransitions: number;
  readonly npcInteractions: number;
  readonly encounterVictories: number;
  readonly repeatableEncounterVictories: number;
  /** Item-source encounters included above; retained to expose collection pressure without double-counting actions. */
  readonly itemSourceInteractions: number;
  /** A mechanical lower bound, not a playtime or completion-hour estimate. */
  readonly minimumPlayerActions: number;
}

export interface CampaignReadinessResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  /**
   * Findings that are informational rather than actionable.
   *
   * The authored-activity figure was pushed onto `warnings`, so
   * `validate:content` printed a `warning:` line on every single run of a
   * perfectly healthy campaign. A warning that always fires is a warning
   * nobody reads, and it would have hidden a real one.
   */
  readonly notes: string[];
  readonly mainQuestOrder: string[];
  readonly authoredQuestOrder: string[];
  readonly completedQuestIds: string[];
  readonly completedMainQuestIds: string[];
  readonly finalLocationId: string;
  readonly activityBudget: CampaignActivityBudget;
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

const findRoute = (
  routes: readonly CampaignRoute[],
  fromId: string,
  targetIds: ReadonlySet<string>
): string[] | undefined => {
  const pending: string[][] = [[fromId]];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    const current = path?.at(-1);
    if (!path || !current || visited.has(current)) continue;
    if (targetIds.has(current)) return path;
    visited.add(current);
    for (const route of routes) {
      if (route.fromId === current && !visited.has(route.toId)) pending.push([...path, route.toId]);
    }
  }
  return undefined;
};

const sumFinds = (finds: readonly CampaignFind[], itemId: string): number =>
  finds.filter(([candidate]) => candidate === itemId).reduce((total, [, quantity]) => total + quantity, 0);

/**
 * Walks every authored quest in prerequisite order through actual routes, NPC
 * placements, encounter placements, and finite/repeatable item sources. This
 * deliberately models only deterministic authored content: no generated
 * narrative or assumed drops.
 */
export function auditCampaignReadiness(
  pack: ContentPack,
  sources: CampaignReadinessSources
): CampaignReadinessResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const locationIds = new Set(pack.locations.map(({ id }) => id));
  const itemIds = new Set(pack.items.map(({ id }) => id));
  const encounterById = new Map(pack.encounters.map((encounter) => [encounter.id, encounter]));
  const npcById = new Map(pack.npcs.map((npc) => [npc.id, npc]));
  const mainQuests = pack.quests.filter(({ mainStory }) => mainStory);
  const mainQuestIds = new Set(mainQuests.map(({ id }) => id));

  if (!locationIds.has(sources.startLocationId)) {
    errors.push(`Campaign start references unknown location ${sources.startLocationId}`);
  }
  for (const route of sources.routes) {
    if (!locationIds.has(route.fromId)) errors.push(`Route starts at unknown location ${route.fromId}`);
    if (!locationIds.has(route.toId)) errors.push(`Route ends at unknown location ${route.toId}`);
  }
  for (const location of pack.locations) {
    const exits = sources.routes.filter(({ fromId }) => fromId === location.id);
    const exitIds = exits.map(({ toId }) => toId);
    for (const connection of location.connections) {
      if (exitIds.filter((id) => id === connection).length !== 1) {
        errors.push(`${location.id} has an ambiguous or missing route to ${connection}`);
      }
    }
    for (const exit of exits) {
      if (!location.connections.includes(exit.toId)) {
        errors.push(`${location.id} has a route not declared by its connections: ${exit.toId}`);
      }
    }
    const duplicateDirections = collectDuplicates(exits.map(({ direction }) => direction));
    for (const direction of duplicateDirections) errors.push(`${location.id} has ambiguous ${direction} routes`);
  }
  for (const [locationId, encounterIds] of Object.entries(sources.locationEncounters)) {
    if (!locationIds.has(locationId)) errors.push(`Encounter placement references unknown location ${locationId}`);
    for (const encounterId of encounterIds) {
      if (!encounterById.has(encounterId)) errors.push(`${locationId} places unknown encounter ${encounterId}`);
    }
  }
  for (const [locationId, finds] of Object.entries(sources.locationFinds)) {
    if (!locationIds.has(locationId)) errors.push(`Item source references unknown location ${locationId}`);
    for (const [itemId, quantity] of finds) {
      if (!itemIds.has(itemId)) errors.push(`${locationId} sources unknown item ${itemId}`);
      if (quantity < 1) errors.push(`${locationId} has a non-positive item source quantity`);
    }
  }
  for (const [encounterId, finds] of Object.entries(sources.encounterFinds)) {
    if (!encounterById.has(encounterId)) errors.push(`Item source references unknown encounter ${encounterId}`);
    if (!Object.values(sources.locationEncounters).some((ids) => ids.includes(encounterId))) {
      errors.push(`Item source encounter is not placed in the world: ${encounterId}`);
    }
    for (const [itemId, quantity] of finds) {
      if (!itemIds.has(itemId)) errors.push(`${encounterId} sources unknown item ${itemId}`);
      if (quantity < 1) errors.push(`${encounterId} has a non-positive item source quantity`);
    }
  }

  for (const encounter of pack.encounters) {
    const availability = sources.encounterAvailability[encounter.id];
    if (!availability) errors.push(`${encounter.id} has no encounter availability semantics`);
    if (encounter.boss && availability !== "once") errors.push(`${encounter.id} is a boss but is not once-only`);
    if (!encounter.boss && availability !== "repeatable") errors.push(`${encounter.id} is ordinary but is not repeatable`);
  }
  for (const encounterId of Object.keys(sources.encounterAvailability)) {
    if (!encounterById.has(encounterId)) errors.push(`Availability references unknown encounter ${encounterId}`);
  }

  const roots = mainQuests.filter(({ prerequisites }) => prerequisites.filter((id) => mainQuestIds.has(id)).length === 0);
  if (roots.length !== 1) errors.push(`Main story must have exactly one starting quest; found ${roots.length}`);
  const mainQuestOrder: string[] = [];
  const completed = new Set<string>();
  while (mainQuestOrder.length < mainQuests.length) {
    const next = mainQuests.filter((quest) =>
      !completed.has(quest.id) && quest.prerequisites.every((id) => !mainQuestIds.has(id) || completed.has(id))
    );
    if (next.length !== 1) {
      errors.push(next.length === 0
        ? "Main story has a dead end or prerequisite cycle"
        : `Main story order is ambiguous after ${mainQuestOrder.at(-1) ?? "start"}`);
      break;
    }
    const quest = next[0];
    if (!quest) break;
    mainQuestOrder.push(quest.id);
    completed.add(quest.id);
  }

  const authoredQuestOrder: string[] = [];
  const authoredCompleted = new Set<string>();
  while (authoredQuestOrder.length < pack.quests.length) {
    const next = pack.quests.find((quest) =>
      !authoredCompleted.has(quest.id) && quest.prerequisites.every((id) => authoredCompleted.has(id))
    );
    if (!next) {
      errors.push("Authored quest graph has a dead end or prerequisite cycle");
      break;
    }
    authoredQuestOrder.push(next.id);
    authoredCompleted.add(next.id);
  }

  const itemQuantities = new Map<string, number>();
  const harvestedLocations = new Set<string>();
  const defeatedOnce = new Set<string>();
  let locationId = sources.startLocationId;
  let routeTransitions = 0;
  let npcInteractions = 0;
  let encounterVictories = 0;
  let repeatableEncounterVictories = 0;
  let itemSourceInteractions = 0;
  const harvestLocation = (candidateLocationId: string): void => {
    if (harvestedLocations.has(candidateLocationId)) return;
    harvestedLocations.add(candidateLocationId);
    for (const [itemId, quantity] of sources.locationFinds[candidateLocationId] ?? []) {
      itemQuantities.set(itemId, (itemQuantities.get(itemId) ?? 0) + quantity);
    }
  };
  const travelTo = (targets: ReadonlySet<string>, label: string): string | undefined => {
    const path = findRoute(sources.routes, locationId, targets);
    if (!path) {
      errors.push(`No route from ${locationId} to ${label}`);
      return undefined;
    }
    for (const nextLocationId of path.slice(1)) {
      routeTransitions += 1;
      locationId = nextLocationId;
      harvestLocation(locationId);
    }
    return locationId;
  };
  const encounterLocations = (encounterId: string): string[] => Object.entries(sources.locationEncounters)
    .flatMap(([candidateLocationId, encounterIds]) => encounterIds.includes(encounterId) ? [candidateLocationId] : []);
  const canFight = (encounterId: string): boolean =>
    sources.encounterAvailability[encounterId] === "repeatable" || !defeatedOnce.has(encounterId);
  const resolveEncounter = (encounterId: string): void => {
    const availability = sources.encounterAvailability[encounterId];
    if (availability === "once") defeatedOnce.add(encounterId);
    if (availability === "repeatable") repeatableEncounterVictories += 1;
    encounterVictories += 1;
    for (const [itemId, quantity] of sources.encounterFinds[encounterId] ?? []) {
      itemQuantities.set(itemId, (itemQuantities.get(itemId) ?? 0) + quantity);
    }
  };

  for (const questId of authoredQuestOrder) {
    const quest = pack.quests.find((candidate) => candidate.id === questId);
    if (!quest) continue;
    for (const objective of quest.steps) {
      if (objective.kind === "talk") {
        const npc = npcById.get(objective.targetId);
        if (!npc || !travelTo(new Set([npc.locationId]), objective.targetId)) continue;
        npcInteractions += 1;
      } else if (objective.kind === "travel") {
        travelTo(new Set([objective.targetId]), objective.targetId);
      } else if (objective.kind === "survive") {
        // Enduring an encounter needs that encounter to be reachable and
        // fightable; rounds survived are a battle-time property, not a
        // reachability one.
        const placements = encounterLocations(objective.targetId);
        const reachable = placements.some((candidateLocationId) =>
          canFight(objective.targetId) && findRoute(sources.routes, locationId, new Set([candidateLocationId]))
        );
        if (!reachable) {
          errors.push(`${quest.id} has no reachable encounter for its survive objective ${objective.targetId}`);
          continue;
        }
        const placement = placements.find((candidateLocationId) =>
          findRoute(sources.routes, locationId, new Set([candidateLocationId]))
        );
        if (placement && travelTo(new Set([placement]), objective.targetId)) {
          resolveEncounter(objective.targetId);
        }
      } else if (objective.kind === "defeat") {
        const candidates = pack.encounters.filter(({ enemyIds }) => enemyIds.includes(objective.targetId));
        const placedCandidates = candidates.flatMap(({ id }) => encounterLocations(id).map((candidateLocationId) => ({
          encounterId: id,
          locationId: candidateLocationId
        })));
        for (let victory = 0; victory < objective.count; victory += 1) {
          const source = placedCandidates.find(({ encounterId, locationId: candidateLocationId }) =>
            canFight(encounterId) && findRoute(sources.routes, locationId, new Set([candidateLocationId]))
          );
          if (!source || !travelTo(new Set([source.locationId]), objective.targetId)) {
            errors.push(`${quest.id} has no available placed encounter source for ${objective.targetId} x${objective.count}`);
            break;
          }
          resolveEncounter(source.encounterId);
        }
      } else {
        // collect and deliver share their sourcing rules — both need the item
        // in hand. deliver additionally needs its recipient to be reachable,
        // and consumes the stack when it resolves.
        if (objective.kind === "deliver") {
          const recipientId = objective.recipientId;
          const recipient = recipientId ? npcById.get(recipientId) : undefined;
          if (!recipient) {
            errors.push(`${quest.id} has a deliver objective with no reachable recipient ${recipientId ?? "(unset)"}`);
            continue;
          }
        }
        const owned = itemQuantities.get(objective.targetId) ?? 0;
        if (owned >= objective.count) {
          if (objective.kind === "deliver") {
            itemQuantities.set(objective.targetId, owned - objective.count);
            const recipientId = objective.recipientId;
            const recipient = recipientId ? npcById.get(recipientId) : undefined;
            if (recipient && travelTo(new Set([recipient.locationId]), recipientId ?? objective.targetId)) {
              npcInteractions += 1;
            }
          }
          continue;
        }
        const direct = Object.entries(sources.locationFinds).flatMap(([candidateLocationId, finds]) =>
          sumFinds(finds, objective.targetId) > 0 ? [{
            kind: "location" as const,
            locationId: candidateLocationId,
            quantity: sumFinds(finds, objective.targetId)
          }] : []
        );
        const encounter = Object.entries(sources.encounterFinds).flatMap(([encounterId, finds]) =>
          sumFinds(finds, objective.targetId) > 0
            ? encounterLocations(encounterId).map((candidateLocationId) => ({
              kind: "encounter" as const,
              encounterId,
              locationId: candidateLocationId,
              quantity: sumFinds(finds, objective.targetId)
            }))
            : []
        );
        const candidates = [...encounter, ...direct];
        if (candidates.length === 0) {
          errors.push(`${quest.id} has an unsourced collect objective ${objective.targetId} x${objective.count}`);
          continue;
        }
        let attempts = 0;
        while ((itemQuantities.get(objective.targetId) ?? 0) < objective.count) {
          attempts += 1;
          if (attempts > objective.count + 1) {
            errors.push(`${quest.id} cannot collect enough ${objective.targetId} from its authored sources`);
            break;
          }
          const source = candidates.find((candidate) => {
            const available = candidate.kind === "location"
              ? !harvestedLocations.has(candidate.locationId)
              : canFight(candidate.encounterId);
            return available && Boolean(findRoute(sources.routes, locationId, new Set([candidate.locationId])));
          });
          if (!source || !travelTo(new Set([source.locationId]), objective.targetId)) {
            errors.push(`${quest.id} cannot reach an item source for ${objective.targetId}`);
            break;
          }
          if (source.kind === "encounter") {
            resolveEncounter(source.encounterId);
            itemSourceInteractions += 1;
          }
        }
      }
    }
  }

  for (const encounter of pack.encounters.filter(({ boss }) => boss)) {
    if (encounterLocations(encounter.id).length === 0) errors.push(`Boss encounter is not placed in the world: ${encounter.id}`);
  }
  for (const quest of pack.quests.filter(({ rewardTier }) => rewardTier === "boss")) {
    const hasBossObjective = quest.steps.some((step) => step.kind === "defeat" &&
      pack.encounters.some((encounter) => encounter.boss && encounter.enemyIds.includes(step.targetId)));
    if (!hasBossObjective) errors.push(`${quest.id} is boss-tier but has no placed boss objective`);
  }
  const bossQuest = mainQuests.find((quest) => quest.steps.some((step) => step.kind === "defeat" &&
    pack.encounters.some((encounter) => encounter.boss && encounter.enemyIds.includes(step.targetId))));
  if (!bossQuest) errors.push("Main story has no placed boss objective");

  const mainObjectiveCount = mainQuests.reduce((total, quest) => total + quest.steps.length, 0);
  const authoredObjectiveCount = pack.quests.reduce((total, quest) => total + quest.steps.length, 0);
  const activityBudget: CampaignActivityBudget = {
    authoredQuestCount: pack.quests.length,
    authoredObjectiveCount,
    mainQuestCount: mainQuests.length,
    mainObjectiveCount,
    routeTransitions,
    npcInteractions,
    encounterVictories,
    repeatableEncounterVictories,
    itemSourceInteractions,
    minimumPlayerActions: routeTransitions + npcInteractions + encounterVictories
  };
  const notes = [
    `Authored minimum: ${activityBudget.minimumPlayerActions} world interactions across ${authoredObjectiveCount} authored objectives; this is not an hours estimate.`
  ];
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    notes,
    mainQuestOrder,
    authoredQuestOrder,
    completedQuestIds: [...authoredCompleted],
    completedMainQuestIds: [...completed],
    finalLocationId: locationId,
    activityBudget
  };
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
  const factionIds = new Set(pack.npcs.map(({ factionId }) => factionId));
  const questIds = new Set(pack.quests.map(({ id }) => id));
  const encounterEnemyIds = new Set(pack.encounters.flatMap(({ enemyIds }) => enemyIds));
  const encounterIds = new Set(pack.encounters.map(({ id }) => id));
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

  const portraitTags = new Set(knownPortraitTags());
  for (const npc of pack.npcs) {
    if (!locationIds.has(npc.locationId)) errors.push(`${npc.id} references unknown location ${npc.locationId}`);
    // Every authored assetTag went unread for the whole project. Now that they
    // reach the dialogue panel, an unmapped one means a speaker with no face.
    if (!portraitTags.has(npc.assetTag)) errors.push(`${npc.id} has no portrait for ${npc.assetTag}`);
  }
  for (const scene of scenes) {
    for (const line of scene.lines) {
      if (line.portraitTag && !portraitTags.has(line.portraitTag)) {
        errors.push(`${scene.id} names an unknown portrait ${line.portraitTag}`);
      }
    }
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
        // deliver names the item carried; its recipient is checked separately.
        (questStep.kind === "deliver" && itemIds.has(questStep.targetId)) ||
        (questStep.kind === "survive" && encounterIds.has(questStep.targetId)) ||
        (questStep.kind === "defeat" && encounterEnemyIds.has(questStep.targetId));
      if (!targetExists) errors.push(`${quest.id} has unknown ${questStep.kind} target ${questStep.targetId}`);
      if (questStep.kind === "deliver" && !npcIds.has(questStep.recipientId ?? "")) {
        errors.push(`${quest.id} delivers to unknown recipient ${questStep.recipientId ?? "(unset)"}`);
      }
      if (questStep.count < 1) errors.push(`${quest.id} has a non-positive objective count`);
    }
    if (quest.consequences.length === 0) warnings.push(`${quest.id} has no persistent world consequence`);
    for (const consequence of quest.consequences) {
      if (consequence.type === "adjust_relationship") {
        if (!npcIds.has(consequence.npcId)) {
          errors.push(`${quest.id} has unknown relationship target ${consequence.npcId}`);
        }
        if (!Number.isFinite(consequence.amount) || consequence.amount === 0 || Math.abs(consequence.amount) > 100) {
          errors.push(`${quest.id} has invalid relationship consequence amount`);
        }
      } else if (consequence.type === "adjust_faction") {
        if (!factionIds.has(consequence.factionId)) {
          errors.push(`${quest.id} has unknown faction consequence target ${consequence.factionId}`);
        }
        if (!Number.isFinite(consequence.amount) || consequence.amount === 0 || Math.abs(consequence.amount) > 100) {
          errors.push(`${quest.id} has invalid faction consequence amount`);
        }
      } else if (!/^(outcome|ending)\.[a-z0-9.-]+$/.test(consequence.key)) {
        errors.push(`${quest.id} has unsafe consequence flag ${consequence.key}`);
      }
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
