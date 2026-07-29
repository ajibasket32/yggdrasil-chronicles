import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves), saves };
}

async function startChronicle(bridge: EngineGameBridge): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard" });
}

async function winCurrentBattle(bridge: EngineGameBridge): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    const battle = bridge.getSnapshot().battle;
    if (battle?.phase === "victory") return;
    if (!battle || battle.phase !== "choosing") {
      throw new Error(`Battle became unwinnable in phase '${battle?.phase ?? "missing"}'`);
    }
    await bridge.chooseBattleAction("attack");
  }
  throw new Error("Battle did not end within the deterministic turn budget");
}

describe("EngineGameBridge party combat", () => {
  it("gives every living party member a deterministic turn before enemies act", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    await bridge.interactNpc("npc.tovin-ash");
    bridge.startEncounter("encounter.mossroad-foragers");

    expect(bridge.getSnapshot().battle?.activeActorId).toBe("party.protagonist");
    await bridge.chooseBattleAction("guard");
    expect(bridge.getSnapshot().battle).toMatchObject({
      phase: "choosing",
      activeActorId: "party.tovin",
      round: 1
    });

    await bridge.chooseBattleAction("guard");
    expect(bridge.getSnapshot().battle).toMatchObject({
      phase: "choosing",
      activeActorId: "party.protagonist",
      round: 2
    });
  });

  it("handles item and escape actions safely through the public bridge", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);
    bridge.startEncounter("encounter.mossroad-foragers");

    await bridge.chooseBattleAction("item");
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.root-tonic")?.quantity).toBe(1);
    expect(bridge.getSnapshot().battle?.activeActorId).toBe("party.protagonist");

    await bridge.chooseBattleAction("escape");
    expect(bridge.getSnapshot().battle?.phase).toBe("escaped");
    await bridge.leaveBattle();
    expect(bridge.getSnapshot().battle).toBeUndefined();
  });
});

describe("EngineGameBridge campaign persistence", () => {
  it("discovers an available travel-first side quest from the matching action", async () => {
    const { bridge } = createBridge();
    await startChronicle(bridge);

    await bridge.travel("location.mossroad");

    expect(bridge.getSnapshot().quests.find(({ id }) => id === "quest.storytellers-toll")).toMatchObject({
      state: "active",
      objectiveKind: "talk",
      objectiveTargetId: "npc.pella-wren"
    });
  });

  it("accumulates counted defeat objectives across repeatable encounters", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        hp: 1_000,
        stats: { ...member.stats, maxHp: 1_000, strength: 1_000 }
      })),
      quests: initial.quests.map((quest) =>
        quest.questId === "quest.hollow-witness"
          ? { ...quest, state: "active" as const, currentStep: 1 }
          : quest
      ),
      world: {
        ...initial.world,
        currentLocationId: "location.hollow-root",
        flags: { ...initial.world.flags, "progress.defeat.enemy.root-gnawer": 2 }
      }
    });
    await bridge.continueGame();

    bridge.startEncounter("encounter.mossroad-foragers");
    await winCurrentBattle(bridge);
    expect((await saves.load("autosave"))?.world.flags["progress.defeat.enemy.root-gnawer"]).toBe(3);
    expect(bridge.getSnapshot().quests.find(({ id }) => id === "quest.hollow-witness")?.objectiveTargetId)
      .toBe("enemy.root-gnawer");
    await bridge.leaveBattle();

    bridge.startEncounter("encounter.mossroad-foragers");
    await winCurrentBattle(bridge);
    expect((await saves.load("autosave"))?.world.flags["progress.defeat.enemy.root-gnawer"]).toBe(4);
    expect(bridge.getSnapshot().quests.find(({ id }) => id === "quest.hollow-witness")?.objectiveTargetId)
      .toBe("enemy.mire-antler");
  });

  it("rests the party, advances time, records the camp, and autosaves", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const initial = await saves.load("autosave");
    if (!initial) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...initial,
      party: initial.party.map((member) => ({
        ...member,
        hp: 1,
        mp: 0,
        statuses: [{ id: "poison", remainingTurns: 2, potency: 3 }]
      }))
    });
    await bridge.continueGame();

    await bridge.rest();

    const rested = await saves.load("autosave");
    expect(rested?.world.worldMinutes).toBe(initial.world.worldMinutes + 480);
    expect(rested?.party.every((member) =>
      member.hp === member.stats.maxHp && member.mp === member.stats.maxMp && member.statuses.length === 0
    )).toBe(true);
    expect(rested?.world.chronicle.at(-1)?.title).toBe("A Quiet Rest");
  });

  it("claims location discoveries once and refuses a defeated boss encounter", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);

    await bridge.travel("location.mossroad");
    const firstFindCount = bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.brass-rivet")?.quantity;
    await bridge.travel("location.hearthcross");
    await bridge.travel("location.mossroad");
    expect(bridge.getSnapshot().inventory.find(({ itemId }) => itemId === "item.brass-rivet")?.quantity).toBe(firstFindCount);

    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an autosave after travel");
    await saves.save("autosave", {
      ...saved,
      world: { ...saved.world, defeatedBossIds: ["encounter.mire-antler"] }
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mire-antler");
    expect(bridge.getSnapshot().battle).toBeUndefined();
  });

  it("pays a completed quest exactly once and preserves its reward marker", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    await bridge.interactNpc("npc.mara-vell");
    await bridge.interactNpc("npc.orren-pike");

    const rewarded = await saves.load("autosave");
    if (!rewarded) throw new Error("Expected a quest reward autosave");
    const protagonist = rewarded.party.find(({ id }) => id === "party.protagonist");
    expect(rewarded.world.flags["content.quest-reward.quest.first-silence"]).toBe(true);
    expect(protagonist?.experience).toBeGreaterThan(0);
    expect(rewarded.world.chronicle.filter(({ title }) => title === "The First Silence resolved")).toHaveLength(1);

    await bridge.interactNpc("npc.orren-pike");
    const repeated = await saves.load("autosave");
    expect(repeated?.party.find(({ id }) => id === "party.protagonist")?.experience).toBe(protagonist?.experience);
    expect(repeated?.world.chronicle.filter(({ title }) => title === "The First Silence resolved")).toHaveLength(1);
  });

  it("reports authored campaign completion from persisted main quest state", async () => {
    const { bridge, saves } = createBridge();
    await startChronicle(bridge);
    const saved = await saves.load("autosave");
    if (!saved) throw new Error("Expected an initial autosave");
    await saves.save("autosave", {
      ...saved,
      quests: saved.quests.map((quest) => ({ ...quest, state: "completed" as const }))
    });

    await bridge.continueGame();

    expect(bridge.getSnapshot().campaign).toEqual({
      completedMainQuests: 15,
      totalMainQuests: 15,
      complete: true
    });
  });
});
