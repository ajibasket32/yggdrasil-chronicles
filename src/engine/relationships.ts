import type {
  EntityId,
  QuestConsequence,
  Relationship,
  WorldState
} from "../shared/types";

export type RelationshipAxis = "trust" | "respect" | "fear";

export function clampRelationship(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export function adjustRelationship(
  relationships: readonly Relationship[],
  npcId: EntityId,
  axis: RelationshipAxis,
  amount: number
): Relationship[] {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Relationship adjustment must be finite");
  }
  const existing = relationships.find((relationship) => relationship.npcId === npcId)
    ?? { npcId, trust: 0, respect: 0, fear: 0 };
  const updated = {
    ...existing,
    [axis]: clampRelationship(existing[axis] + amount)
  };
  return relationships.some((relationship) => relationship.npcId === npcId)
    ? relationships.map((relationship) => relationship.npcId === npcId ? updated : { ...relationship })
    : [...relationships.map((relationship) => ({ ...relationship })), updated];
}

export function adjustFactionStanding(
  standing: Readonly<Record<EntityId, number>>,
  factionId: EntityId,
  amount: number
): Record<EntityId, number> {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Faction adjustment must be finite");
  }
  return {
    ...standing,
    [factionId]: clampRelationship((standing[factionId] ?? 0) + amount)
  };
}

export function applyQuestConsequences(
  world: Readonly<WorldState>,
  consequences: readonly QuestConsequence[]
): WorldState {
  let relationships = world.relationships.map((relationship) => ({ ...relationship }));
  let factionStanding = { ...world.factionStanding };
  let flags = { ...world.flags };
  for (const consequence of consequences) {
    if (consequence.type === "adjust_relationship") {
      relationships = adjustRelationship(
        relationships,
        consequence.npcId,
        consequence.axis,
        consequence.amount
      );
    } else if (consequence.type === "adjust_faction") {
      factionStanding = adjustFactionStanding(
        factionStanding,
        consequence.factionId,
        consequence.amount
      );
    } else {
      flags = { ...flags, [consequence.key]: consequence.value };
    }
  }
  return {
    ...world,
    flags,
    factionStanding,
    relationships
  };
}
