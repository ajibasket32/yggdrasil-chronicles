import { describe, expect, it } from "vitest";
import { quests } from "../../src/content";
import { refreshQuestAvailability } from "../../src/engine/quests";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "failure-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

const FAILING_QUEST = "quest.conservators-choice";
const RECOVERY_QUEST = "quest.conservators-amends";
const TRIGGER_FLAG = "outcome.quest.what-the-tree-forgot";

describe("authored quest failure", () => {
  it("authors at least one failure condition with a recovery branch", () => {
    const withFailure = quests.filter(({ failure }) => failure !== undefined);
    expect(withFailure.length).toBeGreaterThan(0);
    for (const quest of withFailure) {
      // A failure with no way forward is exactly what GAME_DESIGN forbids.
      expect(quest.failure?.recoveryQuestId, quest.id).toBeDefined();
      const recovery = quests.find(({ id }) => id === quest.failure?.recoveryQuestId);
      expect(recovery, `${quest.id} names a recovery quest that exists`).toBeDefined();
    }
  });

  it("fails an active quest once its condition holds and opens the recovery branch", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        quest.questId === FAILING_QUEST ? { ...quest, state: "active" as const, currentStep: 0 } : quest),
      world: { ...state.world, flags: { ...state.world.flags, [TRIGGER_FLAG]: true } }
    });
    await bridge.continueGame();
    // advanceCampaign runs on any world interaction; travel is the cheapest.
    await bridge.travel("location.mossroad");

    const view = bridge.getSnapshot().quests.find(({ id }) => id === FAILING_QUEST);
    expect(view?.state).toBe("failed");

    const recovery = bridge.getSnapshot().quests.find(({ id }) => id === RECOVERY_QUEST);
    expect(recovery).toBeDefined();
    expect(recovery?.state).not.toBe("locked");
  });

  it("leaves the quest alone while its condition does not hold", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        quest.questId === FAILING_QUEST ? { ...quest, state: "active" as const, currentStep: 0 } : quest)
    });
    await bridge.continueGame();
    await bridge.travel("location.mossroad");

    expect(bridge.getSnapshot().quests.find(({ id }) => id === FAILING_QUEST)?.state).toBe("active");
  });

  it("never fails a quest that is not active", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        quest.questId === FAILING_QUEST ? { ...quest, state: "completed" as const, currentStep: 2 } : quest),
      world: { ...state.world, flags: { ...state.world.flags, [TRIGGER_FLAG]: true } }
    });
    await bridge.continueGame();
    await bridge.travel("location.mossroad");

    // A completed quest must not be retroactively failed.
    expect(bridge.getSnapshot().quests.find(({ id }) => id === FAILING_QUEST)?.state).toBe("completed");
  });
});

describe("flag-gated availability", () => {
  it("keeps a flag-gated quest locked until its flag is set", () => {
    const gated = quests.filter(({ requiredFlags }) => (requiredFlags?.length ?? 0) > 0);
    expect(gated.length).toBeGreaterThan(0);
    const target = gated[0];
    if (!target) throw new Error("expected a flag-gated quest");

    const progress = quests.map((quest) => ({
      questId: quest.id,
      state: "locked" as const,
      currentStep: 0
    }));

    const withoutFlag = refreshQuestAvailability(progress, quests, {});
    expect(withoutFlag.find(({ questId }) => questId === target.id)?.state).toBe("locked");

    const flags = Object.fromEntries((target.requiredFlags ?? []).map(({ key, equals }) => [key, equals]));
    const withFlag = refreshQuestAvailability(progress, quests, flags);
    // Prerequisites still apply; this quest has none, so the flag alone opens it.
    expect(withFlag.find(({ questId }) => questId === target.id)?.state).toBe("available");
  });

  it("still honours prerequisites when flags are satisfied", () => {
    const progress = quests.map((quest) => ({
      questId: quest.id,
      state: "locked" as const,
      currentStep: 0
    }));
    const everyFlag: Record<string, boolean> = {};
    for (const quest of quests) {
      for (const { key } of quest.requiredFlags ?? []) everyFlag[key] = true;
    }
    const refreshed = refreshQuestAvailability(progress, quests, everyFlag);
    const gatedByPrerequisite = quests.find(({ prerequisites }) => prerequisites.length > 0);
    if (!gatedByPrerequisite) throw new Error("expected a quest with prerequisites");
    expect(refreshed.find(({ questId }) => questId === gatedByPrerequisite.id)?.state).toBe("locked");
  });
});
