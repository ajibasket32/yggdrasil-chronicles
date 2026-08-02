import { describe, expect, it } from "vitest";
import { quests } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "quest-announce-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
}

describe("quests are announced when acquired", () => {
  // quest.first-silence is started by newGame, not by a conversation, so it is
  // not a valid probe here. A Salvager's Debt is introduced by talking to Ilas.
  it("reports the quest a conversation started", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);

    const view = await bridge.interactNpc("npc.ilas-morn");
    expect(view.startedQuestId).toBe("quest.salvagers-debt");
    expect(view.startedQuestTitle).toBe(
      quests.find(({ id }) => id === "quest.salvagers-debt")?.title
    );
  });

  it("does not re-announce a quest already in progress", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    await bridge.interactNpc("npc.ilas-morn");

    const second = await bridge.interactNpc("npc.ilas-morn");
    expect(second.startedQuestId).toBeUndefined();
    expect(second.startedQuestTitle).toBeUndefined();
  });

  it("leaves the field clear for a conversation that starts nothing", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const view = await bridge.interactNpc("npc.joryn-hale");
    expect(view.startedQuestId).toBeUndefined();
  });
});

describe("the campaign's irreversible choice is flagged", () => {
  /** Drives the campaign to the point where the Concord decision is offered. */
  async function reachConcordChoice(): Promise<EngineGameBridge> {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const mainQuestIds = quests.filter(({ mainStory }) => mainStory).map(({ id }) => id);
    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        mainQuestIds.includes(quest.questId) && quest.questId !== "quest.a-new-concord"
          ? { ...quest, state: "completed" as const, currentStep: 9 }
          // The Concord quest's third step (index 2) is the Sable Voss
          // conversation that offers the decision; parking it at 0 leaves the
          // gate closed and the test asserting nothing.
          : quest.questId === "quest.a-new-concord"
            ? { ...quest, state: "active" as const, currentStep: 2 }
            : quest)
    });
    await bridge.continueGame();
    return bridge;
  }

  it("marks the Concord decision as a point of no return", async () => {
    const bridge = await reachConcordChoice();
    const view = await bridge.interactNpc("npc.sable-voss");
    // Assert the gate actually opened, so this can never silently pass by
    // never reaching the decision.
    expect(view.choices?.length).toBeGreaterThan(0);
    expect(view.pointOfNoReturn).toBeDefined();
    expect(view.pointOfNoReturn).toMatch(/ends the chronicle/i);
  });

  it("does not flag ordinary conversations", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    const view = await bridge.interactNpc("npc.mara-vell");
    expect(view.pointOfNoReturn).toBeUndefined();
  });
});
