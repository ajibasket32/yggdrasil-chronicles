import { describe, expect, it } from "vitest";
import { quests } from "../../src/content";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "objectives-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

describe("the objective vocabulary is wider than talk and collect", () => {
  it("authors both new kinds", () => {
    const kinds = new Set(quests.flatMap(({ steps }) => steps.map(({ kind }) => kind)));
    expect(kinds.has("deliver")).toBe(true);
    expect(kinds.has("survive")).toBe(true);
  });

  it("gives every deliver step a recipient that exists", () => {
    const deliveries = quests.flatMap(({ id, steps }) =>
      steps.filter((step) => step.kind === "deliver").map((step) => ({ questId: id, step })));
    expect(deliveries.length).toBeGreaterThan(0);
    for (const { questId, step } of deliveries) {
      expect(step.recipientId, `${questId} names a recipient`).toBeDefined();
    }
  });
});

describe("deliver hands the goods over", () => {
  const DELIVERY_QUEST = "quest.medicine-in-the-mud";
  const ITEM = "item.vesleaf";
  const RECIPIENT = "npc.veska-reed";

  it("completes the step and consumes the delivered stack", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    const definition = quests.find(({ id }) => id === DELIVERY_QUEST);
    const deliverStep = definition?.steps.findIndex((step) => step.kind === "deliver") ?? -1;
    expect(deliverStep).toBeGreaterThanOrEqual(0);
    const required = definition?.steps[deliverStep]?.count ?? 0;
    expect(required).toBeGreaterThan(0);

    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        quest.questId === DELIVERY_QUEST
          ? { ...quest, state: "active" as const, currentStep: deliverStep }
          : quest),
      inventory: [...state.inventory.filter(({ itemId }) => itemId !== ITEM), { itemId: ITEM, quantity: required }]
    });
    await bridge.continueGame();

    await bridge.interactNpc(RECIPIENT);

    const after = bridge.getSnapshot().quests.find(({ id }) => id === DELIVERY_QUEST);
    expect(after?.state).toBe("completed");
    // The whole point of deliver over collect: the goods change hands.
    const remaining = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === ITEM)?.quantity ?? 0;
    expect(remaining).toBe(0);
  });

  it("does not complete when the party is short of the required count", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    const definition = quests.find(({ id }) => id === DELIVERY_QUEST);
    const deliverStep = definition?.steps.findIndex((step) => step.kind === "deliver") ?? -1;
    const required = definition?.steps[deliverStep]?.count ?? 0;

    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        quest.questId === DELIVERY_QUEST
          ? { ...quest, state: "active" as const, currentStep: deliverStep }
          : quest),
      inventory: [
        ...state.inventory.filter(({ itemId }) => itemId !== ITEM),
        { itemId: ITEM, quantity: Math.max(1, required - 1) }
      ]
    });
    await bridge.continueGame();

    await bridge.interactNpc(RECIPIENT);

    expect(bridge.getSnapshot().quests.find(({ id }) => id === DELIVERY_QUEST)?.state).toBe("active");
    // Nothing was taken, so the player can come back with the rest.
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === ITEM)?.quantity)
      .toBe(Math.max(1, required - 1));
  });
});

describe("survive rewards endurance rather than a kill count", () => {
  const SURVIVE_QUEST = "quest.adras-line";

  it("advances once the party lasts the authored rounds", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "easy" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");

    const definition = quests.find(({ id }) => id === SURVIVE_QUEST);
    const surviveIndex = definition?.steps.findIndex((step) => step.kind === "survive") ?? -1;
    expect(surviveIndex).toBeGreaterThanOrEqual(0);
    const encounterId = definition?.steps[surviveIndex]?.targetId;
    if (!encounterId) throw new Error("expected an encounter target");

    await saves.save("autosave", {
      ...state,
      // Grow the party so the fight actually lasts the authored rounds at the
      // encounter's level; the objective is about enduring, not about winning
      // quickly, and a one-round wipe would test nothing.
      party: state.party.map((member) => grantExperience(member, totalExperienceForLevel(12)).character),
      quests: state.quests.map((quest) =>
        quest.questId === SURVIVE_QUEST
          ? { ...quest, state: "active" as const, currentStep: surviveIndex }
          : quest)
    });
    await bridge.continueGame();

    const before = bridge.getSnapshot().quests.find(({ id }) => id === SURVIVE_QUEST);
    expect(before?.state).toBe("active");
    // QuestView exposes the objective, not the raw step index, so the contract
    // under test is what the player is actually being asked to do.
    expect(before?.objectiveKind).toBe("survive");

    bridge.startEncounter(encounterId);
    let roundsReached = 0;
    for (let turn = 0; turn < 40; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle) break;
      // Read the round on every snapshot, including the final non-choosing one,
      // otherwise the last round of the fight is never counted.
      roundsReached = Math.max(roundsReached, battle.round);
      if (battle.phase !== "choosing") break;
      await bridge.chooseBattleAction("attack");
    }

    // Assert the fight really ran long enough to satisfy the objective, so a
    // premature end can never look like a pass.
    const required = definition?.steps[surviveIndex]?.count ?? 0;
    expect(bridge.getSnapshot().battle?.phase).toBe("victory");
    expect(roundsReached).toBeGreaterThanOrEqual(required);

    await bridge.leaveBattle();
    const after = bridge.getSnapshot().quests.find(({ id }) => id === SURVIVE_QUEST);
    // The survive step cleared: the quest now asks for something else.
    expect(after?.objectiveKind).not.toBe("survive");
  });
});
