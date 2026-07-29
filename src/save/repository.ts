import type { GameState } from "../shared/types";
import { sha256 } from "./checksum";
import { IndexedDbSaveStorage } from "./indexed-db-storage";
import { migrateGameState, validateGameState } from "./schema";
import {
  SAVE_SLOTS,
  type SaveBackup,
  type SaveRecord,
  type SaveRecordPayload,
  type SaveSlot,
  type SaveStorage,
  type SaveSummary
} from "./types";

function isSaveSlot(value: unknown): value is SaveSlot {
  return typeof value === "string" && (SAVE_SLOTS as readonly string[]).includes(value);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function payloadOf(record: SaveRecord): SaveRecordPayload {
  const { checksum: _checksum, ...payload } = record;
  return payload;
}

async function createRecord(
  slot: SaveSlot,
  state: GameState,
  createdAt: string,
  updatedAt: string
): Promise<SaveRecord> {
  const validState = validateGameState(state);
  const payload: SaveRecordPayload = {
    slot,
    schemaVersion: validState.schemaVersion,
    seed: validState.seed,
    contentPackVersions: { ...validState.contentPackVersions },
    createdAt,
    updatedAt,
    state: validState
  };
  return { ...payload, checksum: await sha256(payload) };
}

export class SaveRepository {
  readonly #storage: SaveStorage;

  constructor(storage: SaveStorage = new IndexedDbSaveStorage()) {
    this.#storage = storage;
  }

  async save(slot: SaveSlot, state: GameState, now = new Date()): Promise<SaveRecord> {
    const previous = await this.#storage.get(slot);
    const timestamp = now.toISOString();
    const record = await createRecord(slot, state, previous?.createdAt ?? timestamp, timestamp);
    await this.#storage.put(record);
    return record;
  }

  async load(slot: SaveSlot): Promise<GameState | undefined> {
    const record = await this.#storage.get(slot);
    if (!record) {
      return undefined;
    }
    await this.assertChecksum(record);
    const state = migrateGameState(record.state);
    this.assertMetadataMatchesState(record, state);
    return state;
  }

  async list(): Promise<SaveSummary[]> {
    const records = await this.#storage.getAll();
    return records
      .map((record) => ({
        slot: record.slot,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        locationId: record.state.world.currentLocationId,
        partyLevel: Math.max(...record.state.party.map((character) => character.level)),
        playTimeMinutes: record.state.world.worldMinutes
      }))
      .sort((left, right) => SAVE_SLOTS.indexOf(left.slot) - SAVE_SLOTS.indexOf(right.slot));
  }

  async delete(slot: SaveSlot): Promise<void> {
    await this.#storage.delete(slot);
  }

  async exportJson(slot: SaveSlot): Promise<string> {
    const record = await this.#storage.get(slot);
    if (!record) {
      throw new Error(`Save slot '${slot}' is empty`);
    }
    await this.assertChecksum(record);
    return JSON.stringify(record, null, 2);
  }

  async importJson(slot: SaveSlot, json: string, now = new Date()): Promise<SaveRecord> {
    let input: unknown;
    try {
      input = JSON.parse(json);
    } catch {
      throw new Error("Imported save is not valid JSON");
    }
    const imported = this.parseRecord(input);
    await this.assertChecksum(imported);
    const state = migrateGameState(imported.state);
    this.assertMetadataMatchesState(imported, state);
    const previous = await this.#storage.get(slot);
    const timestamp = now.toISOString();
    const replacement = await createRecord(slot, state, imported.createdAt, timestamp);
    await this.#storage.replaceWithBackup(replacement, previous);
    return replacement;
  }

  async backups(slot?: SaveSlot): Promise<SaveBackup[]> {
    return this.#storage.getBackups(slot);
  }

  close(): void {
    this.#storage.close();
  }

  private parseRecord(input: unknown): SaveRecord {
    if (!isRecord(input)
      || !isSaveSlot(input.slot)
      || typeof input.schemaVersion !== "number"
      || typeof input.seed !== "string"
      || !isRecord(input.contentPackVersions)
      || typeof input.createdAt !== "string"
      || typeof input.updatedAt !== "string"
      || typeof input.checksum !== "string"
      || !("state" in input)) {
      throw new Error("Imported save record has an invalid structure");
    }
    return {
      slot: input.slot,
      schemaVersion: input.schemaVersion,
      seed: input.seed,
      contentPackVersions: Object.fromEntries(
        Object.entries(input.contentPackVersions).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      ),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      checksum: input.checksum,
      state: input.state as GameState
    };
  }

  private async assertChecksum(record: SaveRecord): Promise<void> {
    const expected = await sha256(payloadOf(record));
    if (expected !== record.checksum) {
      throw new Error(`Save checksum mismatch for slot '${record.slot}'`);
    }
  }

  private assertMetadataMatchesState(record: SaveRecord, state: GameState): void {
    if (record.seed !== state.seed) {
      throw new Error(`Save metadata seed mismatch for slot '${record.slot}'`);
    }
    if (record.schemaVersion > state.schemaVersion) {
      throw new Error(`Save metadata schema mismatch for slot '${record.slot}'`);
    }
    const metadataPacks = JSON.stringify(Object.entries(record.contentPackVersions).sort());
    const statePacks = JSON.stringify(Object.entries(state.contentPackVersions).sort());
    if (metadataPacks !== statePacks) {
      throw new Error(`Save content-pack metadata mismatch for slot '${record.slot}'`);
    }
  }
}
