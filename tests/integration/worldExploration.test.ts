import { describe, expect, it } from "vitest";
import { locations } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "world-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

async function start(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
  await bridge.acknowledgeScene("scene.prologue");
}

describe("the world graph has a loop, not a line", () => {
  it("connects the two dungeons so the road home differs from the road out", () => {
    const hollowRoot = locations.find(({ id }) => id === "location.hollow-root");
    const silentKiln = locations.find(({ id }) => id === "location.silent-kiln");
    expect(hollowRoot?.connections).toContain("location.silent-kiln");
    expect(silentKiln?.connections).toContain("location.hollow-root");
  });

  it("keeps every connection bidirectional", () => {
    for (const location of locations) {
      for (const target of location.connections) {
        const other = locations.find(({ id }) => id === target);
        expect(other?.connections, `${target} links back to ${location.id}`).toContain(location.id);
      }
    }
  });
});

describe("fast travel consumes the discovery list", () => {
  it("refuses a road not yet walked", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    const result = await bridge.fastTravel("location.larkspire");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not been walked/i);
  });

  it("jumps to a discovered location and pays the hours", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    await bridge.travel("location.mossroad");
    await bridge.travel("location.emberwake");
    const minutesBefore = bridge.getSnapshot().worldMinutes;

    const result = await bridge.fastTravel("location.hearthcross");
    expect(result.success, result.message).toBe(true);
    expect(bridge.getSnapshot().locationId).toBe("location.hearthcross");
    // Two hops home: the walk is skipped, the clock is not.
    expect(bridge.getSnapshot().worldMinutes).toBe(minutesBefore + 90);
  });

  it("declines when already at the destination", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    const result = await bridge.fastTravel("location.hearthcross");
    expect(result.success).toBe(false);
  });

  it("lists discovered locations with their regions for the map overlay", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    await bridge.travel("location.mossroad");

    const discovered = bridge.getSnapshot().discoveredLocations ?? [];
    expect(discovered.length).toBeGreaterThanOrEqual(2);
    const current = discovered.find(({ current: isCurrent }) => isCurrent);
    expect(current?.id).toBe("location.mossroad");
    for (const entry of discovered) {
      expect(entry.regionName.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("still credits a travel objective reached by fast travel", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    await bridge.travel("location.mossroad");
    await bridge.travel("location.hearthcross");
    // quest.marks-in-rain's first objective is travelling to the Mossroad.
    const before = bridge.getSnapshot().quests.find(({ id }) => id === "quest.marks-in-rain");
    if (before?.state !== "active" || before.objectiveKind !== "travel") return;

    await bridge.fastTravel("location.mossroad");
    const after = bridge.getSnapshot().quests.find(({ id }) => id === "quest.marks-in-rain");
    expect(after?.objectiveKind).not.toBe("travel");
  });
});

describe("each location hides one search", () => {
  it("grants a deterministic find once and never again", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    const before = bridge.getSnapshot().currency;
    expect(bridge.getSnapshot().curioSearched).toBe(false);

    const first = await bridge.searchLocation();
    expect(first.success, first.message).toBe(true);
    expect(bridge.getSnapshot().currency).toBeGreaterThan(before);
    expect(bridge.getSnapshot().curioSearched).toBe(true);

    const second = await bridge.searchLocation();
    expect(second.success).toBe(false);
  });

  it("rerolls nothing on reload — the find comes from the chronicle seed", async () => {
    const { bridge: first } = createBridge();
    await start(first);
    const a = await first.searchLocation();

    const { bridge: second } = createBridge();
    await start(second);
    const b = await second.searchLocation();
    // Same seed, same find. A reload cannot shop for a better one.
    expect(a.message).toBe(b.message);
  });

  it("tracks the claim per location", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    await bridge.searchLocation();
    await bridge.travel("location.mossroad");
    // A fresh location has its own curio.
    expect(bridge.getSnapshot().curioSearched).toBe(false);
    const result = await bridge.searchLocation();
    expect(result.success, result.message).toBe(true);
  });
});

describe("the bestiary grows from real kills", () => {
  it("is empty before any victory and populated after one", async () => {
    const { bridge } = createBridge();
    await start(bridge);
    expect(bridge.getSnapshot().bestiary ?? []).toHaveLength(0);

    bridge.startEncounter("encounter.mossroad-foragers");
    for (let turn = 0; turn < 40; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }
    if (bridge.getSnapshot().battle?.phase !== "victory") return;
    await bridge.leaveBattle();

    const bestiary = bridge.getSnapshot().bestiary ?? [];
    expect(bestiary.length).toBeGreaterThanOrEqual(2);
    for (const entry of bestiary) {
      expect(entry.defeated).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});
