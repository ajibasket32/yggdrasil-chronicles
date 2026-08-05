import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "tracking-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

async function withTwoActiveQuests(bridge: EngineGameBridge, saves: SaveRepository): Promise<string[]> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
  await bridge.acknowledgeScene("scene.prologue");
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  // Activate a regional quest alongside the main thread.
  await saves.save("autosave", {
    ...state,
    quests: state.quests.map((quest) =>
      quest.questId === "quest.medicine-in-the-mud"
        ? { ...quest, state: "active" as const, currentStep: 0 }
        : quest)
  });
  await bridge.continueGame();
  return bridge.getSnapshot().quests.filter(({ state: s }) => s === "active").map(({ id }) => id);
}

describe("the player chooses which thread the game follows", () => {
  it("moves the tracked quest to the head of the list", async () => {
    const { bridge, saves } = createBridge();
    const active = await withTwoActiveQuests(bridge, saves);
    expect(active.length).toBeGreaterThanOrEqual(2);
    const second = active[1];
    if (!second) throw new Error("expected a second active quest");

    const result = await bridge.trackQuest(second);
    expect(result.success, result.message).toBe(true);

    // The HUD, compass and objective marker all read the first quest, so
    // ordering IS tracking.
    expect(bridge.getSnapshot().quests[0]?.id).toBe(second);
  });

  it("refuses to follow a quest that is not active", async () => {
    const { bridge, saves } = createBridge();
    await withTwoActiveQuests(bridge, saves);
    const available = bridge.getSnapshot().quests.find(({ state }) => state === "available");
    if (!available) return;
    const result = await bridge.trackQuest(available.id);
    expect(result.success).toBe(false);
  });

  it("persists the followed thread across a reload", async () => {
    const { bridge, saves } = createBridge();
    const active = await withTwoActiveQuests(bridge, saves);
    const second = active[1];
    if (!second) throw new Error("expected a second active quest");
    await bridge.trackQuest(second);

    const reloaded = new EngineGameBridge(saves, () => "tracking-fixture");
    await reloaded.initialize();
    await reloaded.continueGame();
    expect(reloaded.getSnapshot().quests[0]?.id).toBe(second);
  });

  it("orders resolved threads after live ones", async () => {
    const { bridge, saves } = createBridge();
    await withTwoActiveQuests(bridge, saves);
    const states = bridge.getSnapshot().quests.map(({ state }) => state);
    const firstCompleted = states.indexOf("completed");
    const lastActive = states.lastIndexOf("active");
    if (firstCompleted >= 0) expect(lastActive).toBeLessThan(firstCompleted);
  });

  it("keeps every quest summary in the view", async () => {
    const { bridge, saves } = createBridge();
    await withTwoActiveQuests(bridge, saves);
    for (const quest of bridge.getSnapshot().quests) {
      // The summary prose was authored for all quests and rendered nowhere.
      expect(quest.summary.length, quest.id).toBeGreaterThan(10);
    }
  });
});
