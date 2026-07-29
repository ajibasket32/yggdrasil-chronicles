import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/engine/state";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";
import { migrateGameState, validateGameState } from "../../src/save/schema";
import type { SaveRecord } from "../../src/save/types";
import { makePlayerCharacter } from "../engine/fixtures";

function makeState(seed = "save-seed") {
  return createInitialGameState({
    seed,
    startingLocationId: "location-hushharbor",
    party: [makePlayerCharacter()],
    contentPackVersions: { core: "1.0.0" }
  });
}

describe("save repository", () => {
  it("round-trips autosave and three manual slots", async () => {
    const repository = new SaveRepository(new MemorySaveStorage());
    for (const slot of ["autosave", "manual-1", "manual-2", "manual-3"] as const) {
      await repository.save(slot, makeState(slot));
      expect((await repository.load(slot))?.seed).toBe(slot);
    }
    expect(await repository.list()).toHaveLength(4);
  });

  it("rejects checksum corruption", async () => {
    const storage = new MemorySaveStorage();
    const repository = new SaveRepository(storage);
    const record = await repository.save("manual-1", makeState());
    const corrupted: SaveRecord = {
      ...record,
      state: { ...record.state, seed: "tampered" }
    };
    await storage.put(corrupted);
    await expect(repository.load("manual-1")).rejects.toThrow(/checksum mismatch/);
  });

  it("backs up the previous slot when importing a validated save", async () => {
    const storage = new MemorySaveStorage();
    const repository = new SaveRepository(storage);
    await repository.save("manual-1", makeState("old"), new Date("2026-01-01T00:00:00.000Z"));
    await repository.save("manual-2", makeState("imported"), new Date("2026-01-02T00:00:00.000Z"));
    const exported = await repository.exportJson("manual-2");
    await repository.importJson("manual-1", exported, new Date("2026-01-03T00:00:00.000Z"));
    expect((await repository.load("manual-1"))?.seed).toBe("imported");
    const backups = await repository.backups("manual-1");
    expect(backups).toHaveLength(1);
    expect(backups[0]?.record.state.seed).toBe("old");
  });

  it("does not replace a slot when import validation fails", async () => {
    const repository = new SaveRepository(new MemorySaveStorage());
    await repository.save("manual-1", makeState("safe"));
    const exported = JSON.parse(await repository.exportJson("manual-1")) as Record<string, unknown>;
    exported.checksum = "invalid";
    await expect(repository.importJson("manual-1", JSON.stringify(exported))).rejects.toThrow(/checksum mismatch/);
    expect((await repository.load("manual-1"))?.seed).toBe("safe");
    expect(await repository.backups("manual-1")).toHaveLength(0);
  });
});

describe("save schema and migrations", () => {
  it("migrates version-zero fields to the current complete shape", () => {
    const current = makeState();
    const legacy: Record<string, unknown> = structuredClone(current) as unknown as Record<string, unknown>;
    delete legacy.schemaVersion;
    delete legacy.contentPackVersions;
    delete legacy.generatedPatches;
    delete legacy.pendingTriggers;
    const migrated = migrateGameState(legacy);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.generatedPatches).toEqual([]);
    expect(migrated.pendingTriggers).toEqual([]);
  });

  it("rejects impossible character health and duplicate inventory stacks", () => {
    const state = makeState();
    const invalid = {
      ...state,
      party: [{ ...state.party[0]!, hp: 9999 }],
      inventory: [{ itemId: "potion", quantity: 1 }, { itemId: "potion", quantity: 2 }]
    };
    expect(() => validateGameState(invalid)).toThrow();
  });
});
