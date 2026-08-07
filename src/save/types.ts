import type { GameState } from "../shared/types";

/**
 * `quick` is a dedicated slot so the quick-save key can never clobber a slot the
 * player deliberately parked something in. Order here drives load-menu ordering.
 */
export const SAVE_SLOTS = ["autosave", "quick", "manual-1", "manual-2", "manual-3"] as const;
export type SaveSlot = typeof SAVE_SLOTS[number];

export interface SaveRecordPayload {
  readonly slot: SaveSlot;
  readonly schemaVersion: number;
  readonly seed: string;
  readonly contentPackVersions: Record<string, string>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: GameState;
}

export interface SaveRecord extends SaveRecordPayload {
  readonly checksum: string;
}

export interface SaveSummary {
  readonly slot: SaveSlot;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly locationId: string;
  readonly partyLevel: number;
  /** Real time at the controls. */
  readonly playTimeMinutes: number;
  /** In-fiction clock, which rest and fast travel advance in leaps. */
  readonly worldMinutes: number;
  /**
   * The slot holds a record that could not be read as a game state — a partial
   * write, or an edited file. The slot is still listed, because a player who
   * cannot see an occupied slot will overwrite it.
   */
  readonly damaged?: boolean;
}

export interface SaveBackup {
  readonly id: string;
  readonly sourceSlot: SaveSlot;
  readonly backedUpAt: string;
  readonly record: SaveRecord;
}

export interface SaveStorage {
  get(slot: SaveSlot): Promise<SaveRecord | undefined>;
  getAll(): Promise<SaveRecord[]>;
  put(record: SaveRecord): Promise<void>;
  replaceWithBackup(record: SaveRecord, previous: SaveRecord | undefined): Promise<void>;
  delete(slot: SaveSlot): Promise<void>;
  getBackups(slot?: SaveSlot): Promise<SaveBackup[]>;
  close(): void;
}

