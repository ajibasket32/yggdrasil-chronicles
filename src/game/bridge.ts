import type { Element, QuestState, QuestStepKind, StatusId } from "../shared/types";

export type Direction = "up" | "down" | "left" | "right";
export type OverlayKind = "journal" | "inventory" | "party" | "system" | "shop" | "ending" | "codex" | "map";
export type BattleAction = "attack" | "skill" | "item" | "guard" | "escape";
export type GameSaveSlot = "autosave" | "quick" | "manual-1" | "manual-2" | "manual-3";

export type Difficulty = "easy" | "normal" | "hard";

export interface CharacterCreationDraft {
  name: string;
  ancestryId: string;
  jobId: string;
  difficulty: Difficulty;
}

export interface PartyMemberStatsView {
  strength: number;
  dexterity: number;
  agility: number;
  vitality: number;
  intellect: number;
  wisdom: number;
  charisma: number;
}

export interface PartyMemberView {
  id: string;
  name: string;
  ancestry: string;
  job: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  portraitTint: number;
  /** Experience earned into the current level, and what the next one costs. */
  experienceIntoLevel: number;
  experienceForNextLevel: number;
  /** Post-equipment combat stats, excluding maxHp/maxMp (already shown above). */
  stats: PartyMemberStatsView;
  equipment?: Partial<Record<"weapon" | "armor" | "accessory", { itemId: string; name: string }>>;
  jobOptions?: JobOptionView[];
}

export interface JobOptionView {
  id: string;
  name: string;
  state: "active" | "unlocked" | "available" | "locked";
  requirement: string;
}

export interface QuestView {
  id: string;
  title: string;
  summary: string;
  state: QuestState;
  objective: string;
  objectiveKind?: QuestStepKind;
  objectiveTargetId?: string;
  /** True once the player has reached a step the quest marks as irreversible. */
  atPointOfNoReturn?: boolean;
  /** Present when the current step offers a branch the player must choose. */
  decision?: QuestDecisionView;
}

export interface QuestDecisionView {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string; description: string }>;
}

export interface InventoryView {
  itemId: string;
  name: string;
  description: string;
  quantity: number;
  kind?: "consumable" | "weapon" | "armor" | "accessory" | "key";
  equippedBy?: string[];
}

export interface GameCommandResult {
  success: boolean;
  message: string;
}

/** What a creation draft would actually start as. */
export interface BuildPreview {
  maxHp: number;
  maxMp: number;
  stats: PartyMemberStatsView;
  role: string;
  startingSkillNames: string[];
  /** The authored build notes — written for every loadout and never displayed. */
  strengths: string[];
  counters: string[];
}

export interface BattleStatusView {
  id: StatusId;
  remainingTurns: number;
  /** Short player-facing description, so the UI never has to explain a mechanic itself. */
  label: string;
}

export interface BattleActorView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  /** The resource layer was invisible on the one screen where it decides play. */
  mp: number;
  maxMp: number;
  isParty: boolean;
  /** Every active status, not just the first. Empty when the actor is clean. */
  statuses: BattleStatusView[];
  /** False once incapacitated, so the UI can render a distinct down state rather than 0/max. */
  alive: boolean;
  /** Whether this actor can currently be chosen as a target by the acting character. */
  targetable: boolean;
  /**
   * Elements this actor is weak to, revealed once the player has landed that
   * element on this species. Elemental identity is unlearnable otherwise —
   * the player would be guessing against numbers they can never see.
   */
  knownWeaknesses: Element[];
  /** Elements this actor resists, revealed the same way. */
  knownResistances: Element[];
  /** Preloaded Phaser texture key; falls back to sprite.player/sprite.enemy when absent. */
  spriteKey?: string;
  /** Multiplicative tint applied on top of the sprite for further per-actor distinction. */
  tint?: number;
}

export interface BattleSkillOption {
  id: string;
  name: string;
  mpCost: number;
  /** Read-only projection of the already-resolved CombatSkill, so the menu can teach the elemental layer. */
  element: Element;
  power: number;
  target: "enemy" | "ally" | "self";
  /** Present when the skill carries a status rider. */
  status?: StatusId;
  /** False when the acting character cannot currently pay for it. */
  affordable: boolean;
}

export interface BattleItemOption {
  id: string;
  name: string;
  description: string;
  quantity: number;
  /** Item effects target a party member; the UI needs to know whether to prompt for one. */
  target: "ally" | "self";
}

/**
 * Typed projection of the engine's CombatEvent. Previously every event was
 * flattened to a sentence at the bridge, so damage numbers, criticals and
 * misses could not be rendered as anything but log text.
 */
export type BattleEventView =
  | { type: "damage"; actorId: string; targetId: string; amount: number; element: Element; critical: boolean }
  | { type: "healing"; actorId: string; targetId: string; amount: number }
  | { type: "miss"; actorId: string; targetId: string }
  | { type: "guard"; actorId: string }
  | { type: "status_applied"; targetId: string; status: StatusId }
  | { type: "status_damage"; targetId: string; status: StatusId; amount: number }
  | { type: "status_expired"; targetId: string; status: StatusId }
  | { type: "insufficient_mp"; actorId: string; skillId: string }
  | { type: "incapacitated"; actorId: string; status: StatusId }
  | { type: "battle_ended"; outcome: "victory" | "defeat" | "escaped" };

export interface BattleView {
  encounterId: string;
  title: string;
  phase: "choosing" | "victory" | "defeat" | "escaped";
  actors: BattleActorView[];
  activeActorId?: string;
  activeSkills: BattleSkillOption[];
  /** Usable items currently in the shared pack (restoratives and status cures). */
  activeItems: BattleItemOption[];
  /** Events produced by the most recent action, in order, for animation and damage numbers. */
  events: BattleEventView[];
  /** Turn order for the current round, most imminent first. */
  turnOrder: string[];
  bossPhase?: string;
  /** False for boss encounters, which refuse escape. Lets the UI stop offering it. */
  escapable: boolean;
  log: string[];
  round: number;
}

export interface SceneLineView {
  speaker: string;
  text: string;
  portraitTag?: string;
}

/**
 * A scripted story beat waiting to be played. The scene owns presentation;
 * the bridge decides when one fires and records that it has been seen.
 */
export interface PendingSceneView {
  id: string;
  lines: SceneLineView[];
}

export interface InteractionView {
  speaker: string;
  lines: readonly string[];
  choices?: InteractionChoiceView[];
  recruitedMember?: PartyMemberView;
  /** Set when this conversation started a quest, so the scene can announce it. */
  startedQuestId?: string;
  startedQuestTitle?: string;
  /**
   * Set when confirming a choice here is irreversible. The scene must require
   * a deliberate second confirmation rather than committing on the same
   * keypress that advances ordinary dialogue.
   */
  pointOfNoReturn?: string;
  /** Set when this NPC is a vendor; the scene should open the shop overlay after the dialogue closes. */
  opensVendorId?: string;
}

export interface InteractionChoiceView {
  id: string;
  label: string;
  description: string;
}

export interface ShopEntryView {
  itemId: string;
  name: string;
  description: string;
  kind: "consumable" | "weapon" | "armor" | "accessory";
  buyPrice: number;
  /** Present only for items the party currently carries at least one of. */
  sellPrice?: number;
  ownedQuantity: number;
  /**
   * For equipment: how this piece would change the selected character's stats
   * against what they wear now. Absent for consumables and for gear the
   * character cannot equip. Without it, buying is a guess.
   */
  statDelta?: Array<{ stat: string; delta: number }>;
  /** Set when the character cannot use this piece, with the reason. */
  unusableReason?: string;
}

export interface ShopView {
  vendorId: string;
  shopName: string;
  catalog: ShopEntryView[];
}

export interface GameSnapshot {
  hasSave: boolean;
  playerName: string;
  locationId: string;
  locationName: string;
  worldMinutes: number;
  currency: number;
  /** Chosen once at character creation; fixed for the life of the chronicle. */
  difficulty: Difficulty;
  party: PartyMemberView[];
  inventory: InventoryView[];
  quests: QuestView[];
  battle?: BattleView;
  shop?: ShopView;
  campaign?: {
    completedMainQuests: number;
    totalMainQuests: number;
    complete: boolean;
    ending?: {
      id: string;
      title: string;
      body: string;
      epilogue: string;
    };
  };
  reputation?: {
    factions: Array<{ id: string; name: string; standing: number }>;
    relationships: Array<{
      npcId: string;
      name: string;
      trust: number;
      respect: number;
      fear: number;
    }>;
  };
  /** Companions who have joined but are waiting outside the active party. */
  reserve?: PartyMemberView[];
  /** A scripted scene waiting to play; cleared by `acknowledgeScene`. */
  pendingScene?: PendingSceneView;
  /** Every location the party has reached, in discovery order, for the map overlay. */
  discoveredLocations?: Array<{
    id: string;
    name: string;
    regionName: string;
    kind: "town" | "wilderness" | "dungeon";
    current: boolean;
  }>;
  /** True once this location's searchable curio has been claimed. */
  curioSearched?: boolean;
  /** Species the party has felled, with what has been learned of each. */
  bestiary?: Array<{ name: string; defeated: number; weaknesses: string[]; resistances: string[] }>;
  saveSlots?: GameSaveSlot[];
  /** Per-slot detail the repository already computes, so the load menu can show more than AVAILABLE/EMPTY. */
  saveSummaries?: SaveSlotSummaryView[];
  autosave: "idle" | "saving" | "saved" | "error";
  /** Which slot the last autosave status refers to, so a failed manual save is not reported as an autosave failure. */
  autosaveSlot?: GameSaveSlot;
  /**
   * False when persistence is unavailable (private browsing, quota, blocked
   * upgrade). The game still boots and plays; it just cannot save.
   */
  storageAvailable: boolean;
  chronicleHint: string;
}

export interface SaveSlotSummaryView {
  slot: GameSaveSlot;
  updatedAt: string;
  locationName: string;
  partyLevel: number;
  playTimeMinutes: number;
}

export type SnapshotListener = (snapshot: Readonly<GameSnapshot>) => void;

/**
 * The sole integration boundary between Phaser presentation and deterministic
 * game state. Implementations own rules, persistence, rewards, and transitions.
 */
export interface GameBridge {
  getSnapshot(): Readonly<GameSnapshot>;
  subscribe(listener: SnapshotListener): () => void;
  newGame(draft: CharacterCreationDraft): void | Promise<void>;
  /**
   * Starts a fresh chronicle carrying the finished run's levels, equipment and
   * currency forward. Refused until the campaign is complete.
   */
  newGamePlus(draft: CharacterCreationDraft): GameCommandResult | Promise<GameCommandResult>;
  /**
   * Loading can fail on a corrupt or unreadable slot. Both report the failure
   * rather than throwing so the title screen can show it and stay usable.
   */
  continueGame(): GameCommandResult | Promise<GameCommandResult>;
  load(slot: GameSaveSlot): GameCommandResult | Promise<GameCommandResult>;
  deleteSave(slot: GameSaveSlot): GameCommandResult | Promise<GameCommandResult>;
  travel(locationId: string): void | Promise<void>;
  interactNpc(npcId: string): InteractionView | Promise<InteractionView>;
  resolveInteractionChoice(choiceId: string): InteractionView | Promise<InteractionView>;
  startEncounter(encounterId: string): void | Promise<void>;
  /**
   * `targetId` is optional so callers that do not care keep working; the bridge
   * picks a sensible default (first living enemy, or the actor for a self
   * skill). Supplying it is what makes ally healing, item targeting and revive
   * expressible at all.
   */
  chooseBattleAction(action: BattleAction, skillOrItemId?: string, targetId?: string): void | Promise<void>;
  leaveBattle(): void | Promise<void>;
  /** Resting has a cost: paid lodging in a settlement, or a camp supply in the field. */
  rest(): GameCommandResult | Promise<GameCommandResult>;
  save(slot: GameSaveSlot): void | Promise<void>;
  useInventoryItem(itemId: string, memberId: string): GameCommandResult | Promise<GameCommandResult>;
  setEquipment(
    memberId: string,
    slot: "weapon" | "armor" | "accessory",
    itemId?: string
  ): GameCommandResult | Promise<GameCommandResult>;
  selectJob(memberId: string, jobId: string): GameCommandResult | Promise<GameCommandResult>;
  /**
   * Swaps a reserve character into the active party. Passing only a reserve id
   * fills an empty slot; passing both benches the active member.
   */
  swapPartyMember(reserveMemberId: string, activeMemberId?: string): GameCommandResult | Promise<GameCommandResult>;
  /** Marks the pending scene as seen so it does not play again. */
  acknowledgeScene(sceneId: string): void | Promise<void>;
  /** Travels to any discovered location; costs world time per hop, not the walk. */
  fastTravel(locationId: string): GameCommandResult | Promise<GameCommandResult>;
  /** Claims the current location's once-per-chronicle curio. */
  searchLocation(): GameCommandResult | Promise<GameCommandResult>;
  /** Chooses which active quest the HUD and compass follow. */
  trackQuest(questId: string): GameCommandResult | Promise<GameCommandResult>;
  /**
   * The numbers and authored strengths a draft would start with, so character
   * creation is not made blind.
   */
  previewBuild(ancestryId: string, jobId: string): BuildPreview | undefined;
  buyItem(itemId: string): GameCommandResult | Promise<GameCommandResult>;
  sellItem(itemId: string): GameCommandResult | Promise<GameCommandResult>;
  leaveShop(): void | Promise<void>;
  exportSave(slot: GameSaveSlot): string | Promise<string>;
  importSave(slot: GameSaveSlot, json: string): GameCommandResult | Promise<GameCommandResult>;
}

export interface GameLaunchOptions {
  parent: string | HTMLElement;
  bridge?: GameBridge;
  width?: number;
  height?: number;
}
