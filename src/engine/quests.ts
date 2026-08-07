import type { EntityId, QuestDefinition, QuestProgress } from "../shared/types";

export interface QuestObjectiveEvent {
  readonly kind: QuestDefinition["steps"][number]["kind"];
  readonly targetId: EntityId;
  readonly count?: number;
}

export function createQuestProgress(definitions: readonly QuestDefinition[]): QuestProgress[] {
  return definitions.map((definition) => ({
    questId: definition.id,
    // A flag gate counts as a gate. `refreshQuestAvailability` only reconsiders
    // quests that are locked, so a quest with `requiredFlags` and no
    // prerequisites opened as available and its gate never ran once — which
    // offered a failure-recovery thread from the opening minute of a chronicle,
    // before the failure it exists to answer could have happened.
    state: definition.prerequisites.length === 0 && (definition.requiredFlags ?? []).length === 0
      ? "available"
      : "locked",
    currentStep: 0
  }));
}

/**
 * `flags` lets a quest gate on authored world state rather than only on
 * finished prerequisites — the mechanism behind ending-gated and
 * choice-gated content. Omitting it keeps the prior prerequisite-only
 * behaviour exactly.
 */
export function refreshQuestAvailability(
  progress: readonly QuestProgress[],
  definitions: readonly QuestDefinition[],
  flags: Readonly<Record<string, boolean | number | string>> = {}
): QuestProgress[] {
  const completedIds = new Set(progress.filter((quest) => quest.state === "completed").map((quest) => quest.questId));
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  return progress.map((quest) => {
    if (quest.state !== "locked") {
      return { ...quest };
    }
    const definition = definitionsById.get(quest.questId);
    if (!definition) {
      throw new Error(`Missing quest definition '${quest.questId}'`);
    }
    const prerequisitesMet = definition.prerequisites.every((id) => completedIds.has(id));
    const flagsMet = (definition.requiredFlags ?? []).every(({ key, equals }) => flags[key] === equals);
    return prerequisitesMet && flagsMet
      ? { ...quest, state: "available" }
      : { ...quest };
  });
}

export function startQuest(progress: readonly QuestProgress[], questId: EntityId): QuestProgress[] {
  let found = false;
  const next = progress.map((quest) => {
    if (quest.questId !== questId) {
      return { ...quest };
    }
    found = true;
    if (quest.state !== "available") {
      throw new Error(`Quest '${questId}' is not available`);
    }
    return { ...quest, state: "active" as const };
  });
  if (!found) {
    throw new Error(`Unknown quest '${questId}'`);
  }
  return next;
}

export function applyQuestObjective(
  progress: readonly QuestProgress[],
  definition: QuestDefinition,
  event: QuestObjectiveEvent
): QuestProgress[] {
  return progress.map((quest) => {
    if (quest.questId !== definition.id || quest.state !== "active") {
      return { ...quest };
    }
    const step = definition.steps[quest.currentStep];
    if (!step || step.kind !== event.kind || step.targetId !== event.targetId) {
      return { ...quest };
    }
    const count = Math.max(1, Math.floor(event.count ?? 1));
    const nextStep = count >= step.count ? quest.currentStep + 1 : quest.currentStep;
    return nextStep >= definition.steps.length
      ? { ...quest, state: "completed", currentStep: definition.steps.length }
      : { ...quest, currentStep: nextStep };
  });
}

export function failQuest(progress: readonly QuestProgress[], questId: EntityId): QuestProgress[] {
  return progress.map((quest) => {
    if (quest.questId !== questId) {
      return { ...quest };
    }
    if (quest.state !== "active") {
      throw new Error(`Quest '${questId}' is not active`);
    }
    return { ...quest, state: "failed" as const };
  });
}

export function resetFailedQuest(progress: readonly QuestProgress[], questId: EntityId): QuestProgress[] {
  return progress.map((quest) =>
    quest.questId === questId && quest.state === "failed"
      ? { ...quest, state: "available", currentStep: 0 }
      : { ...quest }
  );
}

