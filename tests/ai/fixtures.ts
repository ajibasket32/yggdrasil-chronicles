import type {
  GameState,
  GeneratedContentPatch,
  NarrativeContext
} from "../../src/shared/types";

export function narrativeContext(
  overrides: Partial<NarrativeContext> = {}
): NarrativeContext {
  return {
    promptVersion: "narrative-v1",
    canonSummary: "The Rootways remember choices, but mortals cannot rewrite the Crown.",
    trigger: {
      id: "trigger-1",
      kind: "unexpected_action",
      summary: "The player returned a stolen lantern without asking for payment.",
      actorIds: ["npc.keeper"],
      locationId: "location.root-market",
      worldMinute: 120,
      createdAt: "2026-07-29T00:00:00.000Z"
    },
    worldDigest: "world-digest-1",
    relevantFlags: {},
    npcMemories: [{ npcId: "npc.keeper", memories: ["The traveler kept their word."] }],
    factionState: { "faction.wardens": 5 },
    availableResources: {
      assetTags: ["portrait.villager", "sprite.merchant"],
      encounterIds: ["encounter.moths"],
      rewardTiers: ["minor", "standard"]
    },
    ...overrides
  };
}

export function validPatch(
  overrides: Partial<GeneratedContentPatch> = {}
): GeneratedContentPatch {
  return {
    id: "generated.patch-1",
    triggerId: "trigger-1",
    promptVersion: "narrative-v1",
    createdAt: "2026-07-29T00:00:01.000Z",
    dialogue: [{
      id: "dialogue.start",
      speakerId: "npc.keeper",
      text: "Kindness travels farther than coin in the Rootways.",
      nextIds: []
    }],
    quests: [{
      localId: "lantern-rumor",
      title: "Light Between Roots",
      summary: "Ask where the lantern first came from.",
      objectives: ["Speak with the lantern keeper."],
      rewardTier: "minor"
    }],
    npcs: [{
      localId: "lantern-witness",
      name: "Orin Vale",
      role: "Lantern witness",
      personality: ["observant"],
      assetTag: "portrait.villager"
    }],
    events: [{
      localId: "market-whisper",
      title: "A Market Whisper",
      description: "A rumor follows the returned lantern.",
      encounterId: "encounter.moths"
    }],
    effects: [{
      type: "unlock_generated_quest",
      questLocalId: "lantern-rumor"
    }],
    ...overrides
  };
}

export function emptyGameState(): GameState {
  return {
    schemaVersion: 1,
    seed: "test-seed",
    contentPackVersions: { core: "1.0.0" },
    party: [],
    reserve: [],
    inventory: [],
    quests: [],
    world: {
      currentLocationId: "location.root-market",
      discoveredLocationIds: ["location.root-market"],
      flags: {},
      defeatedBossIds: [],
      factionStanding: {},
      relationships: [{
        npcId: "npc.keeper",
        trust: 99,
        respect: 0,
        fear: 0
      }],
      chronicle: [],
      playSeconds: 0,
    worldMinutes: 120
    },
    generatedPatches: [],
    pendingTriggers: [narrativeContext().trigger]
  };
}
