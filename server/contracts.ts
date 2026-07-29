import { z } from "zod";

export const contextSchema = z.object({
  promptVersion: z.string().min(1),
  canonSummary: z.string().min(1).max(6000),
  trigger: z.object({
    id: z.string().min(1),
    kind: z.enum(["unexpected_action", "relationship_change", "quest_outcome", "world_event"]),
    summary: z.string().min(1).max(800),
    actorIds: z.array(z.string()).max(12),
    locationId: z.string().min(1),
    worldMinute: z.number().int().nonnegative(),
    createdAt: z.iso.datetime()
  }).strict(),
  worldDigest: z.string().min(1),
  relevantFlags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  npcMemories: z.array(z.object({
    npcId: z.string(),
    memories: z.array(z.string().max(500)).max(20)
  }).strict()).max(12),
  factionState: z.record(z.string(), z.number().min(-100).max(100)),
  availableResources: z.object({
    assetTags: z.array(z.string()).max(200),
    encounterIds: z.array(z.string()).max(200),
    rewardTiers: z.array(z.enum(["minor", "standard", "major", "boss"]))
  }).strict()
}).strict();

const effectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_generated_flag"),
    key: z.string().regex(/^generated\.[a-z0-9_.-]+$/),
    value: z.union([z.boolean(), z.number(), z.string().max(200)])
  }).strict(),
  z.object({
    type: z.literal("adjust_relationship"),
    npcId: z.string().min(1),
    axis: z.enum(["trust", "respect", "fear"]),
    amount: z.number().int().min(-5).max(5)
  }).strict(),
  z.object({
    type: z.literal("unlock_generated_quest"),
    questLocalId: z.string().min(1)
  }).strict(),
  z.object({
    type: z.literal("add_chronicle_entry"),
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(1000)
  }).strict()
]);

export const patchSchema = z.object({
  id: z.string().min(1),
  triggerId: z.string().min(1),
  promptVersion: z.string().min(1),
  createdAt: z.iso.datetime(),
  dialogue: z.array(z.object({
    id: z.string().min(1),
    speakerId: z.string().min(1),
    text: z.string().min(1).max(1200),
    nextIds: z.array(z.string()).max(6)
  }).strict()).max(40),
  quests: z.array(z.object({
    localId: z.string().min(1),
    title: z.string().min(1).max(100),
    summary: z.string().min(1).max(1000),
    objectives: z.array(z.string().min(1).max(240)).min(1).max(8),
    rewardTier: z.enum(["minor", "standard", "major", "boss"])
  }).strict()).max(4),
  npcs: z.array(z.object({
    localId: z.string().min(1),
    name: z.string().min(1).max(80),
    role: z.string().min(1).max(120),
    personality: z.array(z.string().min(1).max(80)).min(1).max(6),
    assetTag: z.string().min(1)
  }).strict()).max(4),
  events: z.array(z.object({
    localId: z.string().min(1),
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(1200),
    encounterId: z.string().optional()
  }).strict()).max(4),
  effects: z.array(effectSchema).max(12)
}).strict();

export type NarrativeContext = z.infer<typeof contextSchema>;
export type NarrativePatch = z.infer<typeof patchSchema>;

const FORBIDDEN_KEYS = new Set([
  "damage", "stats", "stat", "xp", "experience", "currency", "gold",
  "loot", "itemstats", "combatoutcome", "battleoutcome", "bossstate",
  "queststate", "authoredqueststate", "rawreward"
]);

function hasForbiddenAuthorityKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenAuthorityKey);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, "")) ||
    hasForbiddenAuthorityKey(nested)
  );
}

export function validateProviderPatch(
  input: unknown,
  context: NarrativeContext
): { success: true; patch: NarrativePatch } | { success: false; reason: string } {
  if (hasForbiddenAuthorityKey(input)) {
    return { success: false, reason: "Provider attempted to set gameplay-authority fields." };
  }
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, reason: "Provider returned a patch outside the narrative schema." };
  }
  const patch = parsed.data;
  if (patch.triggerId !== context.trigger.id || patch.promptVersion !== context.promptVersion) {
    return { success: false, reason: "Provider patch does not match its request." };
  }
  const allowedAssets = new Set(context.availableResources.assetTags);
  const allowedEncounters = new Set(context.availableResources.encounterIds);
  const allowedRewards = new Set(context.availableResources.rewardTiers);
  if (patch.npcs.some((npc) => !allowedAssets.has(npc.assetTag))) {
    return { success: false, reason: "Provider requested an unavailable asset." };
  }
  if (patch.events.some((event) =>
    event.encounterId !== undefined && !allowedEncounters.has(event.encounterId))) {
    return { success: false, reason: "Provider requested an unavailable encounter." };
  }
  if (patch.quests.some((quest) => !allowedRewards.has(quest.rewardTier))) {
    return { success: false, reason: "Provider requested an unavailable reward tier." };
  }
  const questIds = new Set(patch.quests.map((quest) => quest.localId));
  if (patch.effects.some((effect) =>
    effect.type === "unlock_generated_quest" && !questIds.has(effect.questLocalId))) {
    return { success: false, reason: "Provider referenced an unknown generated quest." };
  }
  return { success: true, patch };
}
