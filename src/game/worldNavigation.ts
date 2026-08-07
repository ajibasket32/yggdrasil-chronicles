import {
  encounterFinds,
  encounters,
  items,
  locationEncounters,
  locationFinds,
  locations,
  npcs,
  postgameEncounterIds,
  worldRoutes,
  type RouteDirection
} from "../content";
import type { GameSnapshot, QuestView } from "./bridge";

export type ExitDirection = "up" | "down" | "left" | "right";

export interface LocationExit {
  direction: ExitDirection;
  targetId: string;
  targetName: string;
}

export interface ObjectiveGuidance {
  message: string;
  targetEntityId: string;
  targetLocationId: string;
  local: boolean;
  nextExit?: LocationExit;
}

const routeToExitDirection = (direction: RouteDirection): ExitDirection => {
  switch (direction) {
    case "north":
      return "up";
    case "east":
      return "right";
    case "south":
      return "down";
    case "west":
      return "left";
  }
};

export function getLocationExits(locationId: string): LocationExit[] {
  return worldRoutes.flatMap((route) => {
    if (route.fromId !== locationId) return [];
    const target = locations.find(({ id }) => id === route.toId);
    return target ? [{
      direction: routeToExitDirection(route.direction),
      targetId: target.id,
      targetName: target.name
    }] : [];
  });
}

function findPath(fromId: string, targetIds: ReadonlySet<string>): string[] | undefined {
  const pending: string[][] = [[fromId]];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    const current = path?.at(-1);
    if (!path || !current || visited.has(current)) continue;
    if (targetIds.has(current)) return path;
    visited.add(current);
    for (const exit of getLocationExits(current)) {
      if (!visited.has(exit.targetId)) pending.push([...path, exit.targetId]);
    }
  }
  return undefined;
}

function encounterLocations(encounterId: string): string[] {
  return Object.entries(locationEncounters).flatMap(([locationId, encounterIds]) =>
    encounterIds.includes(encounterId) ? [locationId] : []
  );
}

function targetLocations(quest: QuestView): string[] {
  const targetId = quest.objectiveTargetId;
  if (!targetId) return [];
  switch (quest.objectiveKind) {
    case "talk": {
      const npc = npcs.find(({ id }) => id === targetId);
      return npc ? [npc.locationId] : [];
    }
    case "travel":
      return locations.some(({ id }) => id === targetId) ? [targetId] : [];
    case "defeat":
      return encounters
        .filter(({ enemyIds }) => enemyIds.includes(targetId))
        .flatMap(({ id }) => encounterLocations(id));
    case "collect": {
      const directSources = Object.entries(locationFinds).flatMap(([locationId, finds]) =>
        finds.some(([itemId]) => itemId === targetId) ? [locationId] : []
      );
      const encounterSources = Object.entries(encounterFinds).flatMap(([encounterId, finds]) =>
        finds.some(([itemId]) => itemId === targetId) ? encounterLocations(encounterId) : []
      );
      return [...new Set([...directSources, ...encounterSources])];
    }
    // A delivery points at whoever is waiting for the item, not at the item.
    case "deliver": {
      const recipient = npcs.find(({ id }) => id === quest.objectiveRecipientId);
      return recipient ? [recipient.locationId] : [];
    }
    // `survive` names the encounter to be endured, so it points where that
    // encounter is fought.
    case "survive":
      return encounterLocations(targetId);
    default:
      return [];
  }
}

function objectiveTargetName(quest: QuestView): string {
  const targetId = quest.objectiveTargetId;
  if (!targetId) return quest.objective;
  if (quest.objectiveKind === "talk") return npcs.find(({ id }) => id === targetId)?.name ?? targetId;
  if (quest.objectiveKind === "travel") return locations.find(({ id }) => id === targetId)?.name ?? targetId;
  if (quest.objectiveKind === "collect") return items.find(({ id }) => id === targetId)?.name ?? targetId;
  if (quest.objectiveKind === "deliver") {
    return npcs.find(({ id }) => id === quest.objectiveRecipientId)?.name
      ?? quest.objectiveRecipientId
      ?? targetId;
  }
  if (quest.objectiveKind === "survive") {
    return encounters.find(({ id }) => id === targetId)?.name ?? targetId.replace("encounter.", "").replaceAll("-", " ");
  }
  const encounter = encounters.find(({ enemyIds }) => enemyIds.includes(targetId));
  return encounter?.name ?? targetId.replace("enemy.", "").replaceAll("-", " ");
}

function localMessage(quest: QuestView, targetName: string): string {
  switch (quest.objectiveKind) {
    case "talk":
      return `HERE  Speak with ${targetName}`;
    case "travel":
      return `ARRIVED  Explore ${targetName}`;
    case "collect":
      return `HERE  Search or battle for ${targetName}`;
    case "defeat":
      return `HERE  Engage ${targetName}`;
    case "deliver":
      return `HERE  Hand it to ${targetName}`;
    case "survive":
      return `HERE  Hold the line at ${targetName}`;
    default:
      return quest.objective;
  }
}

export function getObjectiveGuidance(snapshot: Readonly<GameSnapshot>): ObjectiveGuidance | undefined {
  const quest = snapshot.quests.find(({ state }) => state === "active");
  if (!quest?.objectiveTargetId) return undefined;
  const candidates = new Set(targetLocations(quest));
  const path = findPath(snapshot.locationId, candidates);
  const targetLocationId = path?.at(-1);
  if (!path || !targetLocationId) return undefined;
  const targetName = objectiveTargetName(quest);
  if (path.length === 1) {
    return {
      message: localMessage(quest, targetName),
      targetEntityId: quest.objectiveTargetId,
      targetLocationId,
      local: true
    };
  }
  const nextId = path[1];
  const nextExit = getLocationExits(snapshot.locationId).find(({ targetId }) => targetId === nextId);
  if (!nextExit) return undefined;
  const arrow = nextExit.direction === "left" ? "←"
    : nextExit.direction === "right" ? "→"
      : nextExit.direction === "up" ? "↑" : "↓";
  return {
    message: `${arrow} ${nextExit.targetName}\nToward ${targetName}`,
    targetEntityId: quest.objectiveTargetId,
    targetLocationId,
    local: false,
    nextExit
  };
}

export function selectEncounterForLocation(
  locationId: string,
  quest: QuestView | undefined,
  campaignComplete = false
): string | undefined {
  const availableIds = locationEncounters[locationId] ?? [];
  /**
   * Which encounter a location falls back to when no active objective picks one.
   *
   * A postgame encounter is listed last at its location and named by no quest,
   * so neither branch below could ever reach it and the fallback was always
   * `availableIds[0]` — the Echo of Severance was authored, levelled, given its
   * own skills and sprite, gated behind finishing the campaign, and then left
   * unreachable by every path the world had. Once the campaign is complete it
   * becomes the location's default; an active objective still wins, so a side
   * quest at the same location is not shouldered aside by it.
   */
  const fallbackId = campaignComplete
    ? availableIds.find((encounterId) => postgameEncounterIds.includes(encounterId)) ?? availableIds[0]
    : availableIds[0];
  if (!quest?.objectiveTargetId) return fallbackId;
  if (quest.objectiveKind === "defeat") {
    return availableIds.find((encounterId) =>
      encounters.find(({ id }) => id === encounterId)?.enemyIds.includes(quest.objectiveTargetId ?? "")
    ) ?? fallbackId;
  }
  if (quest.objectiveKind === "collect") {
    return availableIds.find((encounterId) =>
      encounterFinds[encounterId]?.some(([itemId]) => itemId === quest.objectiveTargetId)
    ) ?? fallbackId;
  }
  return fallbackId;
}
