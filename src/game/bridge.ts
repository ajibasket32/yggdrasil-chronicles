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
}

export interface BattleView {
  encounterId: string;
  title: string;
  phase: "choosing" | "resolving" | "victory" | "defeat" | "escaped";
  actors: BattleActorView[];
  activeActorId?: string;
  activeSkillName?: string;
  bossPhase?: string;
  log: string[];
  round: number;
}

export interface InteractionView {
  speaker: string;
  lines: readonly string[];
  recruitedMember?: PartyMemberView;
  startedQuestId?: string;
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
  startEncounter(encounterId: string): void | Promise<void>;
  chooseBattleAction(action: BattleAction): void | Promise<void>;
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
}

export interface GameLaunchOptions {
  parent: string | HTMLElement;
  bridge?: GameBridge;
  width?: number;
  height?: number;
}
