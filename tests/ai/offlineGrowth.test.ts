import { afterEach, describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

/**
 * Offline is a supported mode, not a degraded one: AGENTS.md requires core
 * gameplay to work with no network and no AI key. What it must not do is charge
 * the player for it — every crossing raises a narrative checkpoint, and with no
 * provider every one of those falls back to the scripted reaction.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("playing offline does not grow the save forever", () => {
  it("records no generated patch and no chronicle entry per crossing", async () => {
    // No network at all, which is the case this is about.
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const saves = new SaveRepository(new MemorySaveStorage());
    const bridge = new EngineGameBridge(saves, () => "offline-seed");
    await bridge.newGame({
      name: "Aster",
      ancestryId: "hearthborn",
      jobId: "vanguard",
      difficulty: "normal"
    });

    const before = await saves.load("autosave");
    const chronicleBefore = before?.world.chronicle.length ?? 0;

    for (let crossing = 0; crossing < 6; crossing += 1) {
      await bridge.travel(crossing % 2 === 0 ? "location.mossroad" : "location.hearthcross");
    }
    await new Promise((resolve) => setTimeout(resolve, 40));

    const after = await saves.load("autosave");
    // Each crossing used to append a stored patch and an identical "A Quiet
    // Echo" line, then autosave a second time to persist them.
    expect(after?.generatedPatches.length ?? 0).toBe(0);
    const added = (after?.world.chronicle.length ?? 0) - chronicleBefore;
    expect(added, "offline travel should add no chronicle entries of its own").toBe(0);
  });

  it("still lets the party travel while offline", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const saves = new SaveRepository(new MemorySaveStorage());
    const bridge = new EngineGameBridge(saves, () => "offline-play");
    await bridge.newGame({
      name: "Aster",
      ancestryId: "hearthborn",
      jobId: "vanguard",
      difficulty: "normal"
    });
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().locationId).toBe("location.mossroad");
  });
});
