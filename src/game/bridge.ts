import type { QuestState } from "../shared/types";

export type Direction = "up" | "down" | "left" | "right";
export type OverlayKind = "journal" | "inventory" | "party" | "system";
export type BattleAction = "attack" | "skill" | "item" | "guard" | "escape";
export type GameSaveSlot = "autosave" | "manual-1" | "manual-2" | "manual-3";

export interface CharacterCreationDraft {
  name: string;
  ancestryId: string;
  jobId: string;
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
  objectiveKind?: "talk" | "travel" | "collect" | "defeat";
  objectiveTargetId?: string;
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
  log: string[];
  round: number;
}

export interface InteractionView {
  speaker: string;
  lines: readonly string[];
  choices?: InteractionChoiceView[];
  recruitedMember?: PartyMemberView;
  startedQuestId?: string;
}

export interface InteractionChoiceView {
  id: string;
  label: string;
  description: string;
}

export interface GameSnapshot {
  hasSave: boolean;
  playerName: string;
  locationId: string;
  locationName: string;
  worldMinutes: number;
  party: PartyMemberView[];
  inventory: InventoryView[];
  quests: QuestView[];
  battle?: BattleView;
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
  autosave: "idle" | "saving" | "saved" | "error";
  chronicleHint: string;
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
  continueGame(): void | Promise<void>;
  load(slot: GameSaveSlot): void | Promise<void>;
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
  exportSave(slot: GameSaveSlot): string | Promise<string>;
  importSave(slot: GameSaveSlot, json: string): GameCommandResult | Promise<GameCommandResult>;
}

export interface GameLaunchOptions {
  parent: string | HTMLElement;
  bridge?: GameBridge;
  width?: number;
  height?: number;
}
