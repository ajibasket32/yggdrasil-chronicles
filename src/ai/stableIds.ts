import type { GeneratedContentPatch } from "../shared/types";

export type GeneratedEntityKind = "dialogue" | "quest" | "npc" | "event";

/**
 * Generated local IDs are scoped to a patch. This compound form is the stable
 * world/save ID used by engine integrations and prevents cross-patch collisions.
 */
export function stableGeneratedEntityId(
  patchId: string,
  kind: GeneratedEntityKind,
  localId: string
): string {
  return `${patchId}.${kind}.${localId}`;
}

export function generatedEntityIds(patch: GeneratedContentPatch): string[] {
  return [
    ...patch.dialogue.map((entry) =>
      stableGeneratedEntityId(patch.id, "dialogue", entry.id)),
    ...patch.quests.map((entry) =>
      stableGeneratedEntityId(patch.id, "quest", entry.localId)),
    ...patch.npcs.map((entry) =>
      stableGeneratedEntityId(patch.id, "npc", entry.localId)),
    ...patch.events.map((entry) =>
      stableGeneratedEntityId(patch.id, "event", entry.localId))
  ];
}
