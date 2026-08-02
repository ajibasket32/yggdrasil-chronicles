import { describe, expect, it } from "vitest";
import { recruitProfiles } from "../../src/content";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";
import type { PlayerCharacter } from "../../src/shared/types";

function createBridge(seed = "reserve-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

/** Clones the protagonist into a full four-member party plus a named reserve. */
function fillRoster(hero: PlayerCharacter, activeCount: number, reserveCount: number): {
  party: PlayerCharacter[];
  reserve: PlayerCharacter[];
} {
  const party = Array.from({ length: activeCount }, (_, index) =>
    index === 0 ? hero : { ...hero, id: `party.active${index}`, name: `Active ${index}` });
  const reserve = Array.from({ length: reserveCount }, (_, index) => ({
    ...hero,
    id: `party.reserve${index}`,
    name: `Reserve ${index}`
  }));
  return { party, reserve };
}

describe("the reserve roster is reachable", () => {
  it("sends a companion to the reserve when the active party is full", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const profile = recruitProfiles[0];
    if (!profile) throw new Error("expected a recruit profile");

    const { party } = fillRoster(hero, 4, 0);
    await saves.save("autosave", {
      ...state,
      party,
      quests: state.quests.map((quest) =>
        quest.questId === profile.recruitmentQuestId
          ? { ...quest, state: "completed" as const, currentStep: 3 }
          : quest)
    });
    await bridge.continueGame();
    expect(bridge.getSnapshot().party).toHaveLength(4);

    await bridge.interactNpc(profile.npcId);

    // The fifth companion is kept, not discarded.
    expect(bridge.getSnapshot().party).toHaveLength(4);
    expect(bridge.getSnapshot().reserve?.length ?? 0).toBe(1);
  });

  it("swaps a reserve member into a full party, benching the named active one", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const { party, reserve } = fillRoster(hero, 4, 1);
    await saves.save("autosave", { ...state, party, reserve });
    await bridge.continueGame();

    const benched = party[3];
    const incoming = reserve[0];
    if (!benched || !incoming) throw new Error("expected a full roster");

    const result = await bridge.swapPartyMember(incoming.id, benched.id);
    expect(result.success, result.message).toBe(true);

    const activeIds = bridge.getSnapshot().party.map(({ id }) => id);
    const reserveIds = bridge.getSnapshot().reserve?.map(({ id }) => id) ?? [];
    expect(activeIds).toContain(incoming.id);
    expect(activeIds).not.toContain(benched.id);
    expect(reserveIds).toContain(benched.id);
    expect(bridge.getSnapshot().party).toHaveLength(4);
  });

  it("fills an empty slot without benching anyone", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const { party, reserve } = fillRoster(hero, 2, 1);
    await saves.save("autosave", { ...state, party, reserve });
    await bridge.continueGame();

    const incoming = reserve[0];
    if (!incoming) throw new Error("expected a reserve member");
    const result = await bridge.swapPartyMember(incoming.id);
    expect(result.success, result.message).toBe(true);
    expect(bridge.getSnapshot().party).toHaveLength(3);
    expect(bridge.getSnapshot().reserve ?? []).toHaveLength(0);
  });

  it("refuses to empty the active party", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const { party, reserve } = fillRoster(hero, 1, 1);
    await saves.save("autosave", { ...state, party, reserve });
    await bridge.continueGame();

    const incoming = reserve[0];
    if (!incoming) throw new Error("expected a reserve member");
    const result = await bridge.swapPartyMember(incoming.id, hero.id);
    expect(result.success).toBe(false);
    expect(bridge.getSnapshot().party).toHaveLength(1);
  });

  it("refuses a swap during a battle", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const { party, reserve } = fillRoster(hero, 2, 1);
    await saves.save("autosave", { ...state, party, reserve });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    const incoming = reserve[0];
    if (!incoming) throw new Error("expected a reserve member");
    const result = await bridge.swapPartyMember(incoming.id);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/battle/i);
  });

  it("persists the reserve across a save and reload", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    const hero = state.party[0];
    if (!hero) throw new Error("expected a protagonist");

    const { party, reserve } = fillRoster(hero, 2, 1);
    await saves.save("autosave", { ...state, party, reserve });
    await bridge.continueGame();

    const reloaded = new EngineGameBridge(saves, () => "reserve-fixture");
    await reloaded.initialize();
    await reloaded.continueGame();
    expect(reloaded.getSnapshot().reserve?.length ?? 0).toBe(1);
  });
});
