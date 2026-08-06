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
  /**
   * Per-status resistance in 0..1, where 1 means immune. Lives on every
   * combatant so equipment can populate it later, but only enemies are
   * authored with values today. Without it, two characters alternating a
   * 40% stun could lock a boss out of its own fight.
   */
  statusResistance?: Partial<Record<StatusId, number>>;
  isPlayerControlled: boolean;
}

/**
 * `guard` is applied by the Guard action. The four at the end are the
 * buff/debuff set: deliberately symmetric (offence/defence, speed up/down)
 * and deliberately closed — every id here is persisted, so growing this union
 * costs a save migration.
 */
export type StatusId =
  | "guard"
  | "poison"
  | "burn"
  | "bleed"
  | "stun"
  | "sleep"
  | "freeze"
  | "weaken"
  | "fortify"
  | "haste"
  | "slow";

/** Statuses that stop a combatant acting on their turn. */
export const BLOCKING_STATUS_IDS = ["stun", "sleep", "freeze"] as const;

/** Statuses that deal damage per tick rather than modifying a stat. */
export const DAMAGE_OVER_TIME_STATUS_IDS = ["poison", "burn", "bleed"] as const;

export interface StatusInstance {
  id: StatusId;
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
  /**
   * Real seconds spent playing this chronicle. Distinct from `worldMinutes`,
   * which is in-fiction time and jumps by hours whenever the party rests or
   * fast-travels. The save list showed the latter as "play time", which meant a
   * single night of camping read as eight hours played.
   *
   * Written only by the integration layer, which is the sole owner of the
   * clock; the engine stays a pure function of its inputs.
   */
  playSeconds: number;
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

/** Chosen once at character creation and persisted in world flags for the life of the chronicle. */
export type Difficulty = "easy" | "normal" | "hard";

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

/**
 * Objective kinds. `deliver` is a collect that also names where it must be
 * handed in; `survive` completes after N rounds of a named encounter rather
 * than on a kill. Escort and timed objectives are deliberately absent — both
 * need scene-level AI the simplicity law refuses.
 */
export type QuestStepKind = "talk" | "defeat" | "collect" | "travel" | "deliver" | "survive";

export interface QuestStep {
  kind: QuestStepKind;
  targetId: EntityId;
  count: number;
  /** For `deliver`: the NPC the carried item must be handed to. */
  recipientId?: EntityId;
}

/**
 * A branch point inside a quest. v1 changes consequences only — it never skips
 * steps — which covers the authored promises at a fraction of the risk.
 */
export interface QuestDecision {
  id: EntityId;
  /** Shown when the decision is offered, at the step named by `atStep`. */
  prompt: string;
  atStep: number;
  options: QuestDecisionOption[];
}

export interface QuestDecisionOption {
  id: EntityId;
  label: string;
  description: string;
  consequences: QuestConsequence[];
}

/** How a quest can be failed, and what the player can still do afterwards. */
export interface QuestFailure {
  /** The quest fails the moment this flag is set to this value. */
  whenFlag: string;
  equals: boolean | number | string;
  /** The quest offered in its place, honouring GAME_DESIGN's recovery-branch promise. */
  recoveryQuestId?: EntityId;
}

export interface QuestDefinition {
  id: EntityId;
  title: string;
  summary: string;
  prerequisites: EntityId[];
  steps: QuestStep[];
  rewardTier: RewardTier;
  mainStory: boolean;
  consequences: QuestConsequence[];
  /** World flags that must already hold before this quest becomes available. */
  requiredFlags?: Array<{ key: string; equals: boolean | number | string }>;
  /** Hidden quests exist in the catalog but are not listed until discovered. */
  hidden?: boolean;
  /**
   * Marks a step the player cannot walk back from, so the UI can require an
   * explicit confirmation. The campaign's only irreversible decision was
   * previously committed from an ordinary dialogue box.
   */
  finality?: "point_of_no_return";
  decision?: QuestDecision;
  failure?: QuestFailure;
}

export type QuestConsequence =
  | {
      type: "adjust_relationship";
      npcId: EntityId;
      axis: "trust" | "respect" | "fear";
      amount: number;
    }
  | {
      type: "adjust_faction";
      factionId: EntityId;
      amount: number;
    }
  | {
      type: "set_flag";
      key: string;
      value: boolean | number | string;
    };

export interface EncounterDefinition {
  id: EntityId;
  name: string;
  enemyIds: EntityId[];
  rewardTier: RewardTier;
  boss: boolean;
  /**
   * Authored enemy level. Deriving it from the party average made enemy HP
   * grow faster than the player's, so levelling up reduced the party's margin
   * — the inversion this field exists to remove. Optional during the Wave 2
   * contract change; Wave 3 authors it on every encounter.
   */
  level?: number;
}

/** Which broad job family may equip a piece. Resolved against the base job, never a branch id. */
export type EquipmentBand = "martial" | "caster";

export interface ItemDefinition {
  id: EntityId;
  name: string;
  kind: "consumable" | "weapon" | "armor" | "accessory" | "key";
  description: string;
  value: number;
  /**
   * Equipment stat modifiers, authored here rather than hardcoded in the
   * integration layer. Nine items previously carried their price in content
   * and their stats in the bridge, so a designer rebalancing gear changed the
   * price and silently nothing else.
   */
  modifiers?: Partial<Stats>;
  /** Empty or absent means every job may equip it. */
  allowedBands?: EquipmentBand[];
  /** Minimum character level; absent means no gate. */
  requiredLevel?: number;
}
