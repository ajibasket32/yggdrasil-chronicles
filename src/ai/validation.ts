import { generatedContentPatchSchema } from "../shared/schemas";
import type {
  GeneratedContentPatch,
  NarrativeContext,
  ValidationReport
} from "../shared/types";
import { generatedEntityIds } from "./stableIds";

export interface PatchValidationCatalog {
  knownEntityIds?: ReadonlySet<string>;
  knownNpcIds?: ReadonlySet<string>;
  existingGeneratedEntityIds?: ReadonlySet<string>;
  forbiddenCanonTerms?: readonly string[];
}

export interface PatchValidationResult {
  patch?: GeneratedContentPatch;
  report: ValidationReport;
}

const FORBIDDEN_AUTHORITY_KEYS = new Set([
  "damage",
  "stats",
  "stat",
  "xp",
  "experience",
  "currency",
  "gold",
  "loot",
  "itemstats",
  "combatoutcome",
  "battleoutcome",
  "bossstate",
  "queststate",
  "authoredqueststate",
  "rawreward"
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

function findForbiddenKeys(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenKeys(entry, `${path}[${index}]`, found));
    return found;
  }
  if (value === null || typeof value !== "object") {
    return found;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_KEYS.has(normalizedKey(key))) {
      found.push(`${path}.${key}`);
    }
    findForbiddenKeys(entry, `${path}.${key}`, found);
  }
  return found;
}

function textCorpus(patch: GeneratedContentPatch): string {
  return [
    ...patch.dialogue.flatMap((node) => [node.text]),
    ...patch.quests.flatMap((quest) => [quest.title, quest.summary, ...quest.objectives]),
    ...patch.npcs.flatMap((npc) => [npc.name, npc.role, ...npc.personality]),
    ...patch.events.flatMap((event) => [event.title, event.description]),
    ...patch.effects.flatMap((effect) =>
      effect.type === "add_chronicle_entry" ? [effect.title, effect.body] : []
    )
    // Deliberately `toLowerCase`, not `toLocaleLowerCase`. The forbidden-term
    // list this feeds is ASCII, and the locale-sensitive form maps "I" to a
    // dotless "ı" on a Turkish or Azeri host — so "AINZ" became "aınz", matched
    // nothing, and the canon guard was defeated by the operator's system
    // settings rather than by anything in the text.
  ].join("\n").toLowerCase();
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicateValues.add(value);
    }
    seen.add(value);
  }
  return [...duplicateValues];
}

function validateDialogueReachability(
  patch: GeneratedContentPatch,
  errors: string[]
): void {
  if (patch.dialogue.length === 0) {
    return;
  }
  const ids = new Set(patch.dialogue.map((node) => node.id));
  for (const node of patch.dialogue) {
    for (const nextId of node.nextIds) {
      if (!ids.has(nextId)) {
        errors.push(`Dialogue "${node.id}" references unknown next node "${nextId}".`);
      }
    }
  }

  const referenced = new Set(patch.dialogue.flatMap((node) => node.nextIds));
  const roots = patch.dialogue.filter((node) => !referenced.has(node.id));
  if (roots.length === 0) {
    errors.push("Dialogue graph has no reachable root.");
    return;
  }
  const visited = new Set<string>();
  const pending = roots.map((node) => node.id);
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const node = patch.dialogue.find((candidate) => candidate.id === id);
    if (node !== undefined) {
      pending.push(...node.nextIds);
    }
  }
  for (const id of ids) {
    if (!visited.has(id)) {
      errors.push(`Dialogue node "${id}" is unreachable.`);
    }
  }
}

export function validateGeneratedPatch(
  input: unknown,
  context: NarrativeContext,
  catalog: PatchValidationCatalog = {}
): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rejectedEffects: Array<{ index: number; reason: string }> = [];

  for (const path of findForbiddenKeys(input)) {
    errors.push(`Forbidden gameplay-authority field at ${path}.`);
  }

  const parsed = generatedContentPatchSchema.safeParse(input);
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) =>
      `Schema ${issue.path.length > 0 ? issue.path.join(".") : "$"}: ${issue.message}`
    ));
    return {
      report: {
        valid: false,
        errors,
        warnings,
        acceptedEntityIds: [],
        rejectedEffects
      }
    };
  }

  const patch = parsed.data as GeneratedContentPatch;
  if (patch.triggerId !== context.trigger.id) {
    errors.push("Patch triggerId does not match the requested trigger.");
  }
  if (patch.promptVersion !== context.promptVersion) {
    errors.push("Patch promptVersion does not match the request.");
  }

  const localIds = [
    ...patch.quests.map((entry) => entry.localId),
    ...patch.npcs.map((entry) => entry.localId),
    ...patch.events.map((entry) => entry.localId)
  ];
  for (const id of duplicates(localIds)) {
    errors.push(`Generated local ID "${id}" is duplicated.`);
  }
  for (const id of duplicates(patch.dialogue.map((entry) => entry.id))) {
    errors.push(`Dialogue ID "${id}" is duplicated.`);
  }
  for (const id of localIds) {
    if (catalog.existingGeneratedEntityIds?.has(id) === true) {
      errors.push(`Generated local ID "${id}" already exists.`);
    }
  }

  const allowedAssets = new Set(context.availableResources.assetTags);
  for (const npc of patch.npcs) {
    if (!allowedAssets.has(npc.assetTag)) {
      errors.push(`NPC "${npc.localId}" requests unknown asset tag "${npc.assetTag}".`);
    }
  }
  const allowedEncounters = new Set(context.availableResources.encounterIds);
  for (const event of patch.events) {
    if (event.encounterId !== undefined && !allowedEncounters.has(event.encounterId)) {
      errors.push(`Event "${event.localId}" references unknown encounter "${event.encounterId}".`);
    }
  }
  const allowedRewards = new Set(context.availableResources.rewardTiers);
  for (const quest of patch.quests) {
    if (!allowedRewards.has(quest.rewardTier)) {
      errors.push(`Quest "${quest.localId}" requests unavailable reward tier "${quest.rewardTier}".`);
    }
  }

  const generatedNpcIds = new Set(patch.npcs.map((npc) => npc.localId));
  const knownEntities = new Set([
    context.trigger.locationId,
    ...context.trigger.actorIds,
    ...context.npcMemories.map((memory) => memory.npcId),
    ...(catalog.knownEntityIds ?? [])
  ]);
  for (const node of patch.dialogue) {
    if (!knownEntities.has(node.speakerId) && !generatedNpcIds.has(node.speakerId)) {
      errors.push(`Dialogue "${node.id}" has unknown speaker "${node.speakerId}".`);
    }
  }

  const questIds = new Set(patch.quests.map((quest) => quest.localId));
  const unlockedQuestIds = new Set<string>();
  patch.effects.forEach((effect, index) => {
    let rejection: string | undefined;
    if (effect.type === "unlock_generated_quest") {
      if (!questIds.has(effect.questLocalId)) {
        rejection = `Unknown generated quest "${effect.questLocalId}".`;
      } else {
        unlockedQuestIds.add(effect.questLocalId);
      }
    } else if (effect.type === "adjust_relationship") {
      const knownNpc =
        generatedNpcIds.has(effect.npcId) ||
        catalog.knownNpcIds?.has(effect.npcId) === true ||
        context.npcMemories.some((memory) => memory.npcId === effect.npcId);
      if (!knownNpc) {
        rejection = `Unknown relationship target "${effect.npcId}".`;
      }
    }
    if (rejection !== undefined) {
      rejectedEffects.push({ index, reason: rejection });
      errors.push(`Effect ${index}: ${rejection}`);
    }
  });
  for (const questId of questIds) {
    if (!unlockedQuestIds.has(questId)) {
      errors.push(`Generated quest "${questId}" is unreachable because no effect unlocks it.`);
    }
  }

  validateDialogueReachability(patch, errors);

  const corpus = textCorpus(patch);
  for (const term of catalog.forbiddenCanonTerms ?? []) {
    // Locale-independent on both sides of the comparison, for the reason given
    // on `textCorpus`: a Turkish or Azeri host lowercases "I" to a dotless "ı",
    // and a guard that disagrees with its own corpus matches nothing.
    const normalizedTerm = term.trim().toLowerCase();
    if (normalizedTerm.length > 0 && corpus.includes(normalizedTerm)) {
      errors.push(`Generated text conflicts with canon restriction "${term}".`);
    }
  }

  if (patch.dialogue.length === 0 && patch.quests.length === 0 &&
      patch.npcs.length === 0 && patch.events.length === 0) {
    warnings.push("Patch contains effects but no player-visible generated entity.");
  }

  const acceptedEntityIds = errors.length === 0 ? generatedEntityIds(patch) : [];
  return {
    patch: errors.length === 0 ? patch : undefined,
    report: {
      valid: errors.length === 0,
      errors,
      warnings,
      acceptedEntityIds,
      rejectedEffects
    }
  };
}
