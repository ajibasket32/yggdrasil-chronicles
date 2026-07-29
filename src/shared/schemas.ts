import { z } from "zod";

export const narrativeTriggerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["unexpected_action", "relationship_change", "quest_outcome", "world_event"]),
  summary: z.string().min(1).max(800),
  actorIds: z.array(z.string()).max(12),
  locationId: z.string().min(1),
  worldMinute: z.number().int().nonnegative(),
  createdAt: z.iso.datetime()
});

export const narrativeContextSchema = z.object({
  promptVersion: z.string().min(1),
  canonSummary: z.string().min(1).max(6000),
  trigger: narrativeTriggerSchema,
  worldDigest: z.string().min(1),
  relevantFlags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  npcMemories: z.array(z.object({
    npcId: z.string(),
    memories: z.array(z.string().max(500)).max(20)
  })).max(12),
  factionState: z.record(z.string(), z.number().min(-100).max(100)),
  availableResources: z.object({
    assetTags: z.array(z.string()).max(200),
    encounterIds: z.array(z.string()).max(200),
    rewardTiers: z.array(z.enum(["minor", "standard", "major", "boss"]))
  })
});

const storyEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_generated_flag"),
    key: z.string().regex(/^generated\.[a-z0-9_.-]+$/),
    value: z.union([z.boolean(), z.number(), z.string().max(200)])
  }),
  z.object({
    type: z.literal("adjust_relationship"),
    npcId: z.string(),
    axis: z.enum(["trust", "respect", "fear"]),
    amount: z.number().int().min(-5).max(5)
  }),
  z.object({
    type: z.literal("unlock_generated_quest"),
    questLocalId: z.string()
  }),
  z.object({
    type: z.literal("add_chronicle_entry"),
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(1000)
  })
]);

export const generatedContentPatchSchema = z.object({
  id: z.string().min(1),
  triggerId: z.string().min(1),
  promptVersion: z.string().min(1),
  createdAt: z.iso.datetime(),
  dialogue: z.array(z.object({
    id: z.string(),
    speakerId: z.string(),
    text: z.string().min(1).max(1200),
    nextIds: z.array(z.string()).max(6)
  })).max(40),
  quests: z.array(z.object({
    localId: z.string(),
    title: z.string().min(1).max(100),
    summary: z.string().min(1).max(1000),
    objectives: z.array(z.string().min(1).max(240)).min(1).max(8),
    rewardTier: z.enum(["minor", "standard", "major", "boss"])
  })).max(4),
  npcs: z.array(z.object({
    localId: z.string(),
    name: z.string().min(1).max(80),
    role: z.string().min(1).max(120),
    personality: z.array(z.string().min(1).max(80)).min(1).max(6),
    assetTag: z.string()
  })).max(4),
  events: z.array(z.object({
    localId: z.string(),
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(1200),
    encounterId: z.string().optional()
  })).max(4),
  effects: z.array(storyEffectSchema).max(12)
}).strict();

export type GeneratedPatchInput = z.infer<typeof generatedContentPatchSchema>;
