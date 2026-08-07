import { BACKUPS_PER_SLOT, type SaveBackup, type SaveRecord, type SaveSlot, type SaveStorage } from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemorySaveStorage implements SaveStorage {
  readonly #records = new Map<SaveSlot, SaveRecord>();
  readonly #backups: SaveBackup[] = [];

  async get(slot: SaveSlot): Promise<SaveRecord | undefined> {
    const record = this.#records.get(slot);
    return record ? clone(record) : undefined;
  }

  async getAll(): Promise<SaveRecord[]> {
    return [...this.#records.values()].map(clone);
  }

  async put(record: SaveRecord): Promise<void> {
    this.#records.set(record.slot, clone(record));
  }

  async replaceWithBackup(record: SaveRecord, previous: SaveRecord | undefined): Promise<void> {
    const nextRecords = new Map(this.#records);
    let nextBackups = [...this.#backups];
    if (previous) {
      const backedUpAt = new Date().toISOString();
      nextBackups.push({
        id: `${previous.slot}:${backedUpAt}:${crypto.randomUUID()}`,
        sourceSlot: previous.slot,
        backedUpAt,
        record: clone(previous)
      });
      // Bounded the same way the IndexedDB backend is, so tests exercise the
      // retention rule the browser actually applies.
      const kept = nextBackups
        .filter((backup) => backup.sourceSlot === previous.slot)
        .sort((left, right) => right.backedUpAt.localeCompare(left.backedUpAt))
        .slice(0, BACKUPS_PER_SLOT);
      nextBackups = nextBackups.filter((backup) =>
        backup.sourceSlot !== previous.slot || kept.includes(backup));
    }
    nextRecords.set(record.slot, clone(record));
    this.#records.clear();
    for (const [slot, stored] of nextRecords) {
      this.#records.set(slot, stored);
    }
    this.#backups.splice(0, this.#backups.length, ...nextBackups);
  }

  async delete(slot: SaveSlot): Promise<void> {
    this.#records.delete(slot);
  }

  async getBackups(slot?: SaveSlot): Promise<SaveBackup[]> {
    return this.#backups
      .filter((backup) => slot === undefined || backup.sourceSlot === slot)
      .map(clone);
  }

  close(): void {
    // No resources to release.
  }
}
