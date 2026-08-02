import type { QuestState, QuestStepKind } from "../shared/types";

export type Direction = "up" | "down" | "left" | "right";
export type OverlayKind = "journal" | "inventory" | "party" | "system" | "shop" | "ending";
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

export interface BattleActorView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  isParty: boolean;
  status?: string;
  /** Preloaded Phaser texture key; falls back to sprite.player/sprite.enemy when absent. */
  spriteKey?: string;
  /** Multiplicative tint applied on top of the sprite for further per-actor distinction. */
  tint?: number;
}

export interface BattleSkillOption {
  id: string;
  name: string;
  mpCost: number;
}

export interface BattleItemOption {
  id: string;
  name: string;
  description: string;
  quantity: number;
}

export interface BattleView {
  encounterId: string;
  title: string;
  phase: "choosing" | "resolving" | "victory" | "defeat" | "escaped";
  actors: BattleActorView[];
  activeActorId?: string;
  activeSkills: BattleSkillOption[];
  /** Usable items currently in the shared pack (restoratives and status cures). */
  activeItems: BattleItemOption[];
  bossPhase?: string;
  /** False for boss encounters, which refuse escape. Lets the UI stop offering it. */
  escapable: boolean;
  log: string[];
  round: number;
}

export interface InteractionView {
  speaker: string;
  lines: readonly string[];
  choices?: InteractionChoiceView[];
  recruitedMember?: PartyMemberView;
  startedQuestId?: string;
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
  chooseBattleAction(action: BattleAction, skillOrItemId?: string): void | Promise<void>;
  leaveBattle(): void | Promise<void>;
  rest(): void | Promise<void>;
  save(slot: GameSaveSlot): void | Promise<void>;
  useInventoryItem(itemId: string, memberId: string): GameCommandResult | Promise<GameCommandResult>;
  setEquipment(
    memberId: string,
    slot: "weapon" | "armor" | "accessory",
    itemId?: string
  ): GameCommandResult | Promise<GameCommandResult>;
  selectJob(memberId: string, jobId: string): GameCommandResult | Promise<GameCommandResult>;
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
