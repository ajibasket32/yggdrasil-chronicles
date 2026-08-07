import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

const FIXED_SEED = "save-management-fixture";

/** A clock the test advances by hand, so play-time accrual needs no sleeping. */
function fakeClock(): { now: () => number; advance: (seconds: number) => void } {
  let millis = 1_700_000_000_000;
  return {
    now: () => millis,
    advance: (seconds: number) => {
      millis += seconds * 1000;
    }
  };
}

function createBridge(now: () => number): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => FIXED_SEED, now), saves };
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
}

describe("save management", () => {
  it("counts real seconds at the controls, not the in-fiction clock", async () => {
    const clock = fakeClock();
    const { bridge } = createBridge(clock.now);
    await startChronicle(bridge);

    clock.advance(90);
    await bridge.save("manual-1");
    // Travelling costs the world more than half an hour a leg and the player
    // no time at all, so the two clocks have to diverge.
    await bridge.travel("location.mossroad");
    await bridge.travel("location.hearthcross");
    clock.advance(30);
    await bridge.save("manual-2");

    const summaries = bridge.getSnapshot().saveSummaries ?? [];
    const first = summaries.find((entry) => entry.slot === "manual-1");
    const second = summaries.find((entry) => entry.slot === "manual-2");
    expect(first?.playTimeMinutes).toBe(1);
    expect(second?.playTimeMinutes).toBe(2);
    expect(second?.worldMinutes).toBeGreaterThan((first?.worldMinutes ?? 0) + 60);
  });

  it("offers a mis-aimed manual save back as a restorable backup", async () => {
    const clock = fakeClock();
    const { bridge } = createBridge(clock.now);
    await startChronicle(bridge);
    await bridge.save("manual-1");
    const parked = bridge.getSnapshot().saveSummaries?.find((entry) => entry.slot === "manual-1");

    await bridge.travel("location.mossroad");
    await bridge.save("manual-1");
    expect(bridge.getSnapshot().locationId).toBe("location.mossroad");

    const backups = await bridge.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]?.slot).toBe("manual-1");
    expect(backups[0]?.locationName).toBe(parked?.locationName);

    const restored = await bridge.restoreBackup(backups[0]!.id);
    expect(restored.success).toBe(true);
    expect(bridge.getSnapshot().locationId).toBe("location.hearthcross");
  });

  it("reports a missing backup instead of throwing at the presentation layer", async () => {
    const clock = fakeClock();
    const { bridge } = createBridge(clock.now);
    await startChronicle(bridge);
    const result = await bridge.restoreBackup("no-such-backup");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Restore failed");
  });

  it("loads a save written against a different content pack, and says so", async () => {
    const clock = fakeClock();
    const { bridge, saves } = createBridge(clock.now);
    await startChronicle(bridge);
    await bridge.save("manual-1");

    // Rewrite the slot as if an older build had produced it.
    const state = await saves.load("manual-1");
    expect(state).toBeDefined();
    await saves.save("manual-1", {
      ...state!,
      contentPackVersions: { "core.yggdrasil-chronicles": "0.0.1" }
    });

    const result = await bridge.load("manual-1");
    expect(result.success).toBe(true);
    expect(result.message).toContain("0.0.1 → ");
  });

  it("stays quiet when the save matches the running content pack", async () => {
    const clock = fakeClock();
    const { bridge } = createBridge(clock.now);
    await startChronicle(bridge);
    await bridge.save("manual-1");
    const result = await bridge.load("manual-1");
    expect(result.success).toBe(true);
    expect(result.message).toBe("Manual Slot 1 loaded.");
  });

  it("deletes a slot without disturbing the others", async () => {
    const clock = fakeClock();
    const { bridge } = createBridge(clock.now);
    await startChronicle(bridge);
    await bridge.save("manual-1");
    await bridge.save("manual-2");

    const deleted = await bridge.deleteSave("manual-1");
    expect(deleted.success).toBe(true);
    const slots = bridge.getSnapshot().saveSlots ?? [];
    expect(slots).not.toContain("manual-1");
    expect(slots).toContain("manual-2");
    expect(bridge.getSnapshot().saveSummaries?.some((entry) => entry.slot === "manual-1")).toBe(false);
  });
});

describe("a save that did not land does not claim it did", () => {
  it("resolves false when the storage write throws", async () => {
    const storage = new MemorySaveStorage();
    const bridge = new EngineGameBridge(new SaveRepository(storage), () => FIXED_SEED);
    await startChronicle(bridge);

    // The disk fills, or the browser revokes the quota, mid-session.
    storage.put = async () => {
      throw new Error("QuotaExceededError");
    };
    storage.replaceWithBackup = async () => {
      throw new Error("QuotaExceededError");
    };

    await expect(bridge.save("manual-1")).resolves.toBe(false);
    expect(bridge.getSnapshot().autosave).toBe("error");
  });

  it("resolves true on an ordinary write", async () => {
    const bridge = new EngineGameBridge(new SaveRepository(new MemorySaveStorage()), () => FIXED_SEED);
    await startChronicle(bridge);
    await expect(bridge.save("manual-1")).resolves.toBe(true);
  });
});
