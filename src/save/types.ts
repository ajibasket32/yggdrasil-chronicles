import type { GameState } from "../shared/types";

export const SAVE_SLOTS = ["autosave", "manual-1", "manual-2", "manual-3"] as const;
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
  readonly playTimeMinutes: number;
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

