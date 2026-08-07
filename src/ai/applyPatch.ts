import type {
  GameState,
  GeneratedContentPatch,
  QuestProgress,
  Relationship,
  ValidationReport
} from "../shared/types";
import { stableGeneratedEntityId } from "./stableIds";

export interface PatchApplicationResult {
  applied: boolean;
  state: GameState;
  reason?: string;
}

function clampRelationship(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/**
 * Applies only whitelisted story intents. The input state is never mutated and
 * validation failure leaves it byte-for-byte equivalent to its previous value.
 */
export function applyGeneratedPatch(
  state: GameState,
  patch: GeneratedContentPatch,
  report: ValidationReport
): PatchApplicationResult {
  if (!report.valid) {
    return { applied: false, state, reason: "Patch did not pass validation." };
  }
  if (state.generatedPatches.some((candidate) => candidate.id === patch.id)) {
    return { applied: false, state, reason: "Patch was already applied." };
  }
  // A patch that carries nothing durable is not recorded at all. The scripted
  // fallback runs on every checkpoint the provider cannot answer — which,
  // offline, is every single one — and travel raises a checkpoint per crossing.
  // Recording those grew `generatedPatches` without bound inside a save that is
  // checksummed and rewritten on each autosave, and triggered a second autosave
  // per crossing to store it.
  if (
    patch.effects.length === 0
    && patch.quests.length === 0
    && patch.npcs.length === 0
    && patch.dialogue.length === 0
  ) {
    return { applied: false, state, reason: "Patch carries no durable content." };
  }

  const flags = { ...state.world.flags };
  let relationships: Relationship[] = state.world.relationships.map((entry) => ({ ...entry }));
  let quests: QuestProgress[] = state.quests.map((entry) => ({ ...entry }));
  const chronicle = state.world.chronicle.map((entry) => ({
    ...entry,
    tags: [...entry.tags]
  }));

  for (const [index, effect] of patch.effects.entries()) {
    if (effect.type === "create_generated_flag") {
      flags[effect.key] = effect.value;
      continue;
    }
    if (effect.type === "adjust_relationship") {
      const generatedNpc = patch.npcs.some((npc) => npc.localId === effect.npcId);
      const npcId = generatedNpc
        ? stableGeneratedEntityId(patch.id, "npc", effect.npcId)
        : effect.npcId;
      const relationIndex = relationships.findIndex((entry) => entry.npcId === npcId);
      const current = relationIndex >= 0
        ? relationships[relationIndex]
        : { npcId, trust: 0, respect: 0, fear: 0 };
      if (current === undefined) {
        continue;
      }
      const updated = {
        ...current,
        [effect.axis]: clampRelationship(current[effect.axis] + effect.amount)
      };
      if (relationIndex >= 0) {
        relationships[relationIndex] = updated;
      } else {
        relationships = [...relationships, updated];
      }
      continue;
    }
    if (effect.type === "unlock_generated_quest") {
      const questId = stableGeneratedEntityId(patch.id, "quest", effect.questLocalId);
      if (!quests.some((entry) => entry.questId === questId)) {
        quests = [...quests, { questId, state: "available", currentStep: 0 }];
      }
      continue;
    }
    chronicle.push({
      id: `${patch.id}.chronicle.${index}`,
      worldMinute: state.world.worldMinutes,
      title: effect.title,
      body: effect.body,
      tags: ["generated", patch.triggerId]
    });
  }

  return {
    applied: true,
    state: {
      ...state,
      quests,
      generatedPatches: [...state.generatedPatches, patch],
      pendingTriggers: state.pendingTriggers.filter((trigger) => trigger.id !== patch.triggerId),
      world: {
        ...state.world,
        flags,
        relationships,
        chronicle
      }
    }
  };
}
