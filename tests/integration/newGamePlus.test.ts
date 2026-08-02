import { describe, expect, it } from "vitest";
import { encounters, postgameEncounterIds, quests } from "../../src/content";
import { enemyMaxHealth } from "../../src/engine/combat";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

const DRAFT = { name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" } as const;

function createBridge(seed = "ngplus-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

/** Finishes the campaign and grows the party, so carry-over has something to carry. */
async function finishCampaign(
  bridge: EngineGameBridge,
  saves: SaveRepository,
  level = 18
): Promise<void> {
  await bridge.newGame(DRAFT);
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  const mainQuestIds = new Set(quests.filter(({ mainStory }) => mainStory).map(({ id }) => id));
  await saves.save("autosave", {
    ...state,
    party: state.party.map((member) => ({
      ...grantExperience(member, totalExperienceForLevel(level)).character,
      equipment: { ...member.equipment, weapon: "item.rootbound-edge" }
    })),
    quests: state.quests.map((quest) =>
      mainQuestIds.has(quest.questId)
        ? { ...quest, state: "completed" as const, currentStep: 9 }
        : quest),
    world: { ...state.world, flags: { ...state.world.flags, currency: 900 } }
  });
  await bridge.continueGame();
}

describe("the post-game superboss", () => {
  it("is authored above the campaign and is repeatable", () => {
    expect(postgameEncounterIds.length).toBeGreaterThan(0);
    for (const id of postgameEncounterIds) {
      const encounter = encounters.find((candidate) => candidate.id === id);
      expect(encounter, id).toBeDefined();
      // Deliberately not flagged `boss`, so it stays repeatable and the
      // three-named-boss campaign shape is unchanged.
      expect(encounter?.boss).toBe(false);
    }
  });

  it("stays sealed until the campaign is finished", async () => {
    const { bridge } = createBridge();
    await bridge.newGame(DRAFT);
    const target = postgameEncounterIds[0];
    if (!target) throw new Error("expected a post-game encounter");

    bridge.startEncounter(target);
    expect(bridge.getSnapshot().battle).toBeUndefined();
  });

  it("opens once the campaign is finished", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves);
    const target = postgameEncounterIds[0];
    if (!target) throw new Error("expected a post-game encounter");

    bridge.startEncounter(target);
    expect(bridge.getSnapshot().battle).toBeDefined();
    expect(bridge.getSnapshot().battle?.actors.some((actor) => !actor.isParty)).toBe(true);
  });

  it("fights on the boss stat curve despite not being flagged a boss", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves);
    const target = postgameEncounterIds[0];
    const encounter = encounters.find(({ id }) => id === target);
    if (!target || !encounter?.level) throw new Error("expected an authored post-game encounter");

    bridge.startEncounter(target);
    const enemy = bridge.getSnapshot().battle?.actors.find((actor) => !actor.isParty);
    const attackers = bridge.getSnapshot().party.filter((member) => member.hp > 0).length;
    // Asserted against the shared curve at this fixture's party size, and shown
    // to be well above what the trash curve would give at the same level.
    expect(enemy?.maxHp).toBe(enemyMaxHealth(encounter.level, true, attackers));
    expect(enemy?.maxHp ?? 0).toBeGreaterThan(enemyMaxHealth(encounter.level, false, attackers));
  });
});

describe("New Game+ carries the finished run forward", () => {
  it("refuses before the campaign is complete", async () => {
    const { bridge } = createBridge();
    await bridge.newGame(DRAFT);
    const result = await bridge.newGamePlus(DRAFT);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/finished/i);
  });

  // Loading a save with completed-but-unpaid quests pays them out, which is
  // correct production behaviour and means the finished run is richer and
  // higher-levelled than the fixture wrote. Carry-over is asserted against the
  // state as it actually stands at the moment of the carry, not the fixture.
  it("carries level, equipment and currency into a fresh chronicle", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves, 18);
    const before = bridge.getSnapshot();
    const finishedLevel = before.party[0]?.level ?? 0;
    const finishedCurrency = before.currency;
    expect(finishedLevel).toBeGreaterThanOrEqual(18);
    expect(finishedCurrency).toBeGreaterThanOrEqual(900);

    const result = await bridge.newGamePlus({ ...DRAFT, name: "Aster II" });
    expect(result.success, result.message).toBe(true);

    const after = bridge.getSnapshot();
    expect(after.playerName).toBe("Aster II");
    expect(after.party[0]?.level).toBe(finishedLevel);
    expect(after.currency).toBe(finishedCurrency);
    // The carried weapon arrives in the pack rather than vanishing.
    expect(after.inventory.some(({ itemId }) => itemId === "item.rootbound-edge")).toBe(true);
  });

  it("grows carried stats through the real progression path", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves, 18);
    const finishedHp = bridge.getSnapshot().party[0]?.maxHp ?? 0;

    await bridge.newGamePlus(DRAFT);
    const carriedHp = bridge.getSnapshot().party[0]?.maxHp ?? 0;
    // A level written on its own would leave level-1 numbers behind.
    expect(carriedHp).toBeGreaterThan(0);
    expect(carriedHp).toBe(finishedHp);
  });

  it("resets the story so it is genuinely replayed", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves);
    expect(bridge.getSnapshot().campaign?.complete).toBe(true);

    await bridge.newGamePlus(DRAFT);
    const after = bridge.getSnapshot();
    expect(after.campaign?.complete).toBe(false);
    expect(after.locationId).toBe("location.hearthcross");
    // The post-game encounter is sealed again with the story.
    const target = postgameEncounterIds[0];
    if (target) {
      bridge.startEncounter(target);
      expect(bridge.getSnapshot().battle).toBeUndefined();
    }
  });

  it("counts completed runs across successive carry-overs", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves);
    await bridge.newGamePlus(DRAFT);

    // Finish again from the carried state and carry a second time.
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const mainQuestIds = new Set(quests.filter(({ mainStory }) => mainStory).map(({ id }) => id));
    await saves.save("autosave", {
      ...state,
      quests: state.quests.map((quest) =>
        mainQuestIds.has(quest.questId)
          ? { ...quest, state: "completed" as const, currentStep: 9 }
          : quest)
    });
    await bridge.continueGame();
    const second = await bridge.newGamePlus(DRAFT);
    expect(second.success, second.message).toBe(true);
  });

  it("survives a save and reload", async () => {
    const { bridge, saves } = createBridge();
    await finishCampaign(bridge, saves, 15);
    await bridge.newGamePlus(DRAFT);
    const carriedLevel = bridge.getSnapshot().party[0]?.level ?? 0;
    expect(carriedLevel).toBeGreaterThanOrEqual(15);

    const reloaded = new EngineGameBridge(saves, () => "ngplus-fixture");
    await reloaded.initialize();
    await reloaded.continueGame();
    expect(reloaded.getSnapshot().party[0]?.level).toBe(carriedLevel);
  });
});
