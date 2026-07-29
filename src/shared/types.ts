export type EntityId = string;

export type Element =
  | "physical"
  | "fire"
  | "water"
  | "ice"
  | "earth"
  | "wind"
  | "lightning"
  | "radiant"
  | "shadow"
  | "aether"
  | "nature";

export type RewardTier = "minor" | "standard" | "major" | "boss";

export interface Stats {
  maxHp: number;
  maxMp: number;
  strength: number;
  dexterity: number;
  agility: number;
  vitality: number;
  intellect: number;
  wisdom: number;
  charisma: number;
}

export interface Combatant {
  id: EntityId;
  name: string;
  level: number;
  stats: Stats;
  hp: number;
  mp: number;
  skills: EntityId[];
  elements: Partial<Record<Element, number>>;
  statuses: StatusInstance[];
  isPlayerControlled: boolean;
}

export interface StatusInstance {
  id: "guard" | "poison" | "burn" | "bleed" | "stun" | "sleep" | "freeze";
  remainingTurns: number;
  potency: number;
}

export interface PlayerCharacter extends Combatant {
  raceId: EntityId;
  jobId: EntityId;
  experience: number;
  equipment: Partial<Record<"weapon" | "armor" | "accessory", EntityId>>;
}

export type QuestState = "locked" | "available" | "active" | "completed" | "failed";

export interface QuestProgress {
  questId: EntityId;
  state: QuestState;
  currentStep: number;
}

export interface Relationship {
  npcId: EntityId;
  trust: number;
  respect: number;
  fear: number;
}

export interface WorldState {
  currentLocationId: EntityId;
  discoveredLocationIds: EntityId[];
  flags: Record<string, boolean | number | string>;
  defeatedBossIds: EntityId[];
  factionStanding: Record<EntityId, number>;
  relationships: Relationship[];
  chronicle: ChronicleEntry[];
  worldMinutes: number;
}

export interface ChronicleEntry {
  id: EntityId;
  worldMinute: number;
  title: string;
  body: string;
  tags: string[];
}

export interface InventoryStack {
  itemId: EntityId;
  quantity: number;
}

export interface GameState {
  schemaVersion: number;
  seed: string;
  contentPackVersions: Record<string, string>;
  party: PlayerCharacter[];
  reserve: PlayerCharacter[];
  inventory: InventoryStack[];
  quests: QuestProgress[];
  world: WorldState;
  generatedPatches: GeneratedContentPatch[];
  pendingTriggers: NarrativeTrigger[];
}

export type NarrativeTriggerKind =
  | "unexpected_action"
  | "relationship_change"
  | "quest_outcome"
  | "world_event";

export interface NarrativeTrigger {
  id: EntityId;
  kind: NarrativeTriggerKind;
  summary: string;
  actorIds: EntityId[];
  locationId: EntityId;
  worldMinute: number;
  createdAt: string;
}

export interface NarrativeContext {
  promptVersion: string;
  canonSummary: string;
  trigger: NarrativeTrigger;
  worldDigest: string;
  relevantFlags: Record<string, boolean | number | string>;
  npcMemories: Array<{ npcId: EntityId; memories: string[] }>;
  factionState: Record<EntityId, number>;
  availableResources: {
    assetTags: string[];
    encounterIds: EntityId[];
    rewardTiers: RewardTier[];
  };
}

export type StoryEffectIntent =
  | { type: "create_generated_flag"; key: string; value: boolean | number | string }
  | { type: "adjust_relationship"; npcId: EntityId; axis: "trust" | "respect" | "fear"; amount: number }
  | { type: "unlock_generated_quest"; questLocalId: string }
  | { type: "add_chronicle_entry"; title: string; body: string };

export interface GeneratedDialogueNode {
  id: string;
  speakerId: EntityId;
  text: string;
  nextIds: string[];
}

export interface GeneratedQuest {
  localId: string;
  title: string;
  summary: string;
  objectives: string[];
  rewardTier: RewardTier;
}

export interface GeneratedNpc {
  localId: string;
  name: string;
  role: string;
  personality: string[];
  assetTag: string;
}

export interface GeneratedWorldEvent {
  localId: string;
  title: string;
  description: string;
  encounterId?: EntityId;
}

export interface GeneratedContentPatch {
  id: EntityId;
  triggerId: EntityId;
  promptVersion: string;
  createdAt: string;
  dialogue: GeneratedDialogueNode[];
  quests: GeneratedQuest[];
  npcs: GeneratedNpc[];
  events: GeneratedWorldEvent[];
  effects: StoryEffectIntent[];
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  acceptedEntityIds: string[];
  rejectedEffects: Array<{ index: number; reason: string }>;
}

export interface ContentPack {
  id: string;
  version: string;
  title: string;
  regions: RegionDefinition[];
  locations: LocationDefinition[];
  npcs: NpcDefinition[];
  quests: QuestDefinition[];
  encounters: EncounterDefinition[];
  items: ItemDefinition[];
}

export interface RegionDefinition {
  id: EntityId;
  name: string;
  description: string;
  recommendedLevel: [number, number];
}

export interface LocationDefinition {
  id: EntityId;
  regionId: EntityId;
  name: string;
  kind: "town" | "wilderness" | "dungeon";
  connections: EntityId[];
  mapKey: string;
}

export interface NpcDefinition {
  id: EntityId;
  name: string;
  role: string;
  locationId: EntityId;
  factionId: EntityId;
  assetTag: string;
  dialogueId: EntityId;
}

export interface QuestDefinition {
  id: EntityId;
  title: string;
  summary: string;
  prerequisites: EntityId[];
  steps: Array<{ kind: "talk" | "defeat" | "collect" | "travel"; targetId: EntityId; count: number }>;
  rewardTier: RewardTier;
  mainStory: boolean;
}

export interface EncounterDefinition {
  id: EntityId;
  name: string;
  enemyIds: EntityId[];
  rewardTier: RewardTier;
  boss: boolean;
}

export interface ItemDefinition {
  id: EntityId;
  name: string;
  kind: "consumable" | "weapon" | "armor" | "accessory" | "key";
  description: string;
  value: number;
}
