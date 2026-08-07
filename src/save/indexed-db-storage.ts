import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { BACKUPS_PER_SLOT, type SaveBackup, type SaveRecord, type SaveSlot, type SaveStorage } from "./types";

interface YggdrasilSaveDatabase extends DBSchema {
  saves: {
    key: SaveSlot;
    value: SaveRecord;
  };
  backups: {
    key: string;
    value: SaveBackup;
    indexes: { "by-source-slot": SaveSlot };
  };
}

export class IndexedDbSaveStorage implements SaveStorage {
  readonly #databasePromise: Promise<IDBPDatabase<YggdrasilSaveDatabase>>;

  constructor(databaseName = "yggdrasil-chronicles") {
    this.#databasePromise = openDB<YggdrasilSaveDatabase>(databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("saves")) {
          database.createObjectStore("saves", { keyPath: "slot" });
        }
        if (!database.objectStoreNames.contains("backups")) {
          const store = database.createObjectStore("backups", { keyPath: "id" });
          store.createIndex("by-source-slot", "sourceSlot");
        }
      }
    });
  }

  async get(slot: SaveSlot): Promise<SaveRecord | undefined> {
    return (await this.#databasePromise).get("saves", slot);
  }

  async getAll(): Promise<SaveRecord[]> {
    return (await this.#databasePromise).getAll("saves");
  }

  async put(record: SaveRecord): Promise<void> {
    const database = await this.#databasePromise;
    const transaction = database.transaction("saves", "readwrite");
    await transaction.store.put(record);
    await transaction.done;
  }

  async replaceWithBackup(record: SaveRecord, previous: SaveRecord | undefined): Promise<void> {
    const database = await this.#databasePromise;
    const transaction = database.transaction(["saves", "backups"], "readwrite");
    if (previous) {
      const backups = transaction.objectStore("backups");
      const backedUpAt = new Date().toISOString();
      await backups.put({
        id: `${previous.slot}:${backedUpAt}:${crypto.randomUUID()}`,
        sourceSlot: previous.slot,
        backedUpAt,
        record: previous
      });
      // Trim inside the same transaction, so the archive can never be left
      // over its bound by a write that half-succeeded.
      const forSlot = await backups.index("by-source-slot").getAll(previous.slot);
      const stale = forSlot
        .sort((left, right) => right.backedUpAt.localeCompare(left.backedUpAt))
        .slice(BACKUPS_PER_SLOT);
      for (const entry of stale) await backups.delete(entry.id);
    }
    await transaction.objectStore("saves").put(record);
    await transaction.done;
  }

  async delete(slot: SaveSlot): Promise<void> {
    const database = await this.#databasePromise;
    const transaction = database.transaction("saves", "readwrite");
    await transaction.store.delete(slot);
    await transaction.done;
  }

  async getBackups(slot?: SaveSlot): Promise<SaveBackup[]> {
    const database = await this.#databasePromise;
    if (slot) {
      return database.getAllFromIndex("backups", "by-source-slot", slot);
    }
    return database.getAll("backups");
  }

  close(): void {
    void this.#databasePromise.then((database) => database.close());
  }
}
