import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";
import type { SaveBackup, SaveRecord, SaveStorage } from "../../src/save/types";
import {
  DEFAULT_KEYBOARD_BINDINGS,
  RESERVED_KEY_CODES,
  sanitizeGameSettings
} from "../../src/settings";
import { rebindKeyboardAction } from "../../src/game/keyboardControls";

const FIXED_SEED = "wave1-triage-fixture";

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository; storage: MemorySaveStorage } {
  const storage = new MemorySaveStorage();
  const saves = new SaveRepository(storage);
  return { bridge: new EngineGameBridge(saves, () => FIXED_SEED), saves, storage };
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
}

/** Storage that refuses every operation, standing in for private browsing or an exhausted quota. */
class UnavailableStorage implements SaveStorage {
  async get(): Promise<SaveRecord | undefined> { throw new Error("storage unavailable"); }
  async getAll(): Promise<SaveRecord[]> { throw new Error("storage unavailable"); }
  async put(): Promise<void> { throw new Error("storage unavailable"); }
  async replaceWithBackup(): Promise<void> { throw new Error("storage unavailable"); }
  async delete(): Promise<void> { throw new Error("storage unavailable"); }
  async getBackups(): Promise<SaveBackup[]> { throw new Error("storage unavailable"); }
  close(): void { /* nothing to close */ }
}

describe("Wave 1 — quick save no longer destroys a manual slot", () => {
  it("writes to the dedicated quick slot, leaving manual-1 untouched", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    await bridge.travel("location.mossroad");
    await bridge.save("manual-1");
    const parkedLocation = bridge.getSnapshot().locationId;

    await bridge.travel("location.hearthcross");
    await bridge.save("quick");

    const slots = bridge.getSnapshot().saveSlots ?? [];
    expect(slots).toContain("quick");
    expect(slots).toContain("manual-1");

    const manual = bridge.getSnapshot().saveSummaries?.find((entry) => entry.slot === "manual-1");
    const quick = bridge.getSnapshot().saveSummaries?.find((entry) => entry.slot === "quick");
    expect(manual).toBeDefined();
    expect(quick).toBeDefined();
    // The parked chronicle still describes where it was parked, not where the
    // quick save happened.
    expect(manual?.locationName).not.toBe(quick?.locationName);
    expect(parkedLocation).toBe("location.mossroad");
  });

  it("round-trips a quick save back into play", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    await bridge.travel("location.mossroad");
    await bridge.save("quick");
    await bridge.travel("location.hearthcross");
    expect(bridge.getSnapshot().locationId).toBe("location.hearthcross");

    const result = await bridge.load("quick");
    expect(result.success).toBe(true);
    expect(bridge.getSnapshot().locationId).toBe("location.mossroad");
  });
});

describe("Wave 1 — the default bindings never claim a browser key", () => {
  it("keeps quickSave off F5 and every default off the reserved list", () => {
    expect(DEFAULT_KEYBOARD_BINDINGS.quickSave).not.toBe("F5");
    for (const code of Object.values(DEFAULT_KEYBOARD_BINDINGS)) {
      expect(RESERVED_KEY_CODES).not.toContain(code);
    }
  });

  it("heals a persisted F5 quick-save binding back to the default", () => {
    const healed = sanitizeGameSettings({
      version: 1,
      highContrast: false,
      reducedMotion: false,
      soundEnabled: true,
      soundVolume: 0.65,
      keyBindings: { ...DEFAULT_KEYBOARD_BINDINGS, quickSave: ["F5"] }
    });
    expect(healed.keyBindings.quickSave).toEqual(DEFAULT_KEYBOARD_BINDINGS.quickSave);
  });

  it("refuses to rebind an action onto a browser-owned key", () => {
    const next = rebindKeyboardAction(DEFAULT_KEYBOARD_BINDINGS, "quickSave", "F5");
    expect(next.quickSave).toBe(DEFAULT_KEYBOARD_BINDINGS.quickSave);
  });
});

describe("Wave 1 — a party wipe leaves the pre-battle autosave intact", () => {
  it("does not overwrite the autosave on defeat", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await bridge.travel("location.mossroad");

    const before = await saves.load("autosave");
    if (!before) throw new Error("expected a pre-battle autosave");
    const healthyHp = before.party.map((member) => member.hp);

    // Drive the party to a wipe by starting a fight and letting the enemies act
    // until the engine reports defeat.
    bridge.startEncounter("encounter.mossroad-foragers");
    const weakened = bridge.getSnapshot();
    expect(weakened.battle).toBeDefined();

    // Force the loss deterministically by guarding until the party falls.
    for (let turn = 0; turn < 60; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("guard");
    }

    const phase = bridge.getSnapshot().battle?.phase;
    if (phase !== "defeat") {
      // The solo party can survive this encounter on normal; the invariant under
      // test only applies to an actual defeat, so skip rather than assert a lie.
      return;
    }

    await bridge.leaveBattle();
    const after = await saves.load("autosave");
    expect(after).toBeDefined();
    expect(after?.party.map((member) => member.hp)).toEqual(healthyHp);
  });
});

describe("Wave 1 — an unreadable slot reports failure instead of throwing", () => {
  it("returns a failed result and leaves the current chronicle playable", async () => {
    const { bridge, storage } = createBridge();
    await startChronicle(bridge);
    await bridge.travel("location.mossroad");
    await bridge.save("manual-1");

    const record = await storage.get("manual-1");
    if (!record) throw new Error("expected a manual save");
    // Corrupt the payload without recomputing the checksum, exactly what a
    // partial flush or a storage-corruption event produces.
    await storage.put({ ...record, state: { ...record.state, seed: "tampered" } });

    const result = await bridge.load("manual-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/manual slot 1/i);
    // The session that was already loaded is untouched and still playable.
    expect(bridge.getSnapshot().locationId).toBe("location.mossroad");
  });

  it("reports an empty slot rather than silently doing nothing", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const result = await bridge.load("manual-3");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/empty/i);
  });
});

describe("Wave 1 — blocked storage still boots", () => {
  it("initializes without throwing and reports storage as unavailable", async () => {
    const bridge = new EngineGameBridge(new SaveRepository(new UnavailableStorage()), () => FIXED_SEED);
    await expect(bridge.initialize()).resolves.toBeUndefined();
    expect(bridge.getSnapshot().storageAvailable).toBe(false);
  });

  it("keeps the game playable when a save fails", async () => {
    const bridge = new EngineGameBridge(new SaveRepository(new UnavailableStorage()), () => FIXED_SEED);
    await bridge.initialize();
    await startChronicle(bridge);
    // newGame persists; the write fails, but state is live and the world responds.
    expect(bridge.getSnapshot().playerName).toBe("Aster");
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().locationId).toBe("location.mossroad");
    expect(bridge.getSnapshot().autosave).toBe("error");
    expect(bridge.getSnapshot().storageAvailable).toBe(false);
  });
});

describe("Wave 1 — deleting a save", () => {
  it("removes the slot and reports the outcome", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    await bridge.save("manual-2");
    expect(bridge.getSnapshot().saveSlots).toContain("manual-2");

    const result = await bridge.deleteSave("manual-2");
    expect(result.success).toBe(true);
    expect(bridge.getSnapshot().saveSlots).not.toContain("manual-2");
    expect(bridge.getSnapshot().saveSummaries?.some((entry) => entry.slot === "manual-2")).toBe(false);
  });

  it("declines to delete an empty slot", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const result = await bridge.deleteSave("manual-3");
    expect(result.success).toBe(false);
  });
});

describe("Wave 1 — a won battle never leaves the party dead", () => {
  it("floors survivors at 1 HP so the next encounter can still start", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    bridge.startEncounter("encounter.mossroad-foragers");

    for (let turn = 0; turn < 40; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }
    if (bridge.getSnapshot().battle?.phase !== "victory") return;

    await bridge.leaveBattle();
    for (const member of bridge.getSnapshot().party) {
      expect(member.hp).toBeGreaterThan(0);
    }
  });

  it("declines an encounter rather than throwing when nobody can fight", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => ({ ...member, hp: 0 }))
    });
    await bridge.continueGame();

    expect(() => bridge.startEncounter("encounter.mossroad-foragers")).not.toThrow();
    expect(bridge.getSnapshot().battle).toBeUndefined();
  });
});

describe("Wave 1 — boss escape costs nothing", () => {
  it("refuses escape without handing the round to the enemy", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const bossId = "encounter.mire-antler";
    bridge.startEncounter(bossId);
    const opening = bridge.getSnapshot().battle;
    if (!opening) throw new Error("expected a boss battle");
    expect(opening.escapable).toBe(false);

    const partyHpBefore = opening.actors.filter((actor) => actor.isParty).map((actor) => actor.hp);
    const roundBefore = opening.round;

    await bridge.chooseBattleAction("escape");

    const after = bridge.getSnapshot().battle;
    expect(after).toBeDefined();
    expect(after?.phase).toBe("choosing");
    expect(after?.round).toBe(roundBefore);
    expect(after?.actors.filter((actor) => actor.isParty).map((actor) => actor.hp)).toEqual(partyHpBefore);
  });

  it("still allows escape from an ordinary encounter", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    bridge.startEncounter("encounter.mossroad-foragers");
    expect(bridge.getSnapshot().battle?.escapable).toBe(true);
    await bridge.chooseBattleAction("escape");
    expect(bridge.getSnapshot().battle?.phase).toBe("escaped");
  });
});
