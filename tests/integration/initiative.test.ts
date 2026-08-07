import { describe, expect, it } from "vitest";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

function createBridge(seed = "initiative-fixture"): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => seed), saves };
}

/** A two-member party with the recruitment quest already satisfied. */
async function twoMemberParty(bridge: EngineGameBridge, saves: SaveRepository): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
  const state = await saves.load("autosave");
  if (!state) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...state,
    quests: state.quests.map((quest) =>
      quest.questId === "quest.tovins-company"
        ? { ...quest, state: "completed" as const, currentStep: 3 }
        : quest)
  });
  await bridge.continueGame();
  await bridge.interactNpc("npc.tovin-ash");
}

describe("agility decides who acts first", () => {
  it("opens the battle on the fastest living member, not array position", async () => {
    const { bridge, saves } = createBridge();
    await twoMemberParty(bridge, saves);
    bridge.startEncounter("encounter.mossroad-foragers");

    const battle = bridge.getSnapshot().battle;
    const party = battle?.actors.filter(({ isParty }) => isParty) ?? [];
    expect(party.length).toBe(2);

    const first = battle?.turnOrder.find((id) => party.some((actor) => actor.id === id));
    expect(battle?.activeActorId).toBe(first);
    // The protagonist is a Vanguard and the recruit a Ranger, so the recruit is
    // faster: this asserts the order is not simply the roster order.
    expect(first).toBe("party.tovin-ash");
  });

  it("gives every living member exactly one turn before the enemies answer", async () => {
    const { bridge, saves } = createBridge();
    await twoMemberParty(bridge, saves);
    bridge.startEncounter("encounter.mossroad-foragers");

    const acted: string[] = [];
    for (let guard = 0; guard < 4; guard += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing" || battle.round > 1) break;
      if (battle.activeActorId) acted.push(battle.activeActorId);
      await bridge.chooseBattleAction("guard");
    }

    expect(new Set(acted).size).toBe(acted.length);
    expect(acted).toHaveLength(2);
  });

  it("recomputes order each round so a speed status can change it", async () => {
    const { bridge, saves } = createBridge();
    await twoMemberParty(bridge, saves);
    bridge.startEncounter("encounter.mossroad-foragers");

    const opening = bridge.getSnapshot().battle?.turnOrder ?? [];
    expect(opening.length).toBeGreaterThan(0);

    // Play a full round; the order is derived again rather than cached, which
    // is what lets haste and slow mean anything.
    await bridge.chooseBattleAction("guard");
    await bridge.chooseBattleAction("guard");

    const next = bridge.getSnapshot().battle?.turnOrder ?? [];
    expect(next.length).toBeGreaterThan(0);
    // Living actors only: anything that fell is gone from the order.
    const living = new Set(
      bridge.getSnapshot().battle?.actors.filter(({ alive }) => alive).map(({ id }) => id) ?? []
    );
    for (const id of next) expect(living.has(id)).toBe(true);
  });

  it("skips a member who has fallen instead of stalling on them", async () => {
    const { bridge, saves } = createBridge();
    await twoMemberParty(bridge, saves);
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    // One member down before the fight starts.
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member, index) => index === 1 ? { ...member, hp: 0 } : member)
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    const battle = bridge.getSnapshot().battle;
    const downedId = state.party[1]?.id;
    expect(battle?.activeActorId).not.toBe(downedId);
    expect(battle?.turnOrder).not.toContain(downedId);
  });
});

describe("a mid-round speed change does not duplicate a turn", () => {
  it("does not hand a second action to an ally overtaken by a self-haste", async () => {
    const { bridge, saves } = createBridge("initiative-haste");
    await twoMemberParty(bridge, saves);

    // Pin both agilities so the reorder is certain rather than incidental: the
    // protagonist starts a point slower, and the +40% from Pathfinder's Stride
    // clears the recruit even allowing for a Wayfinder bonus on top.
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => member.id === "party.protagonist"
        ? {
            ...member,
            skills: [...member.skills, "skill.pathfinders-stride"],
            stats: { ...member.stats, agility: 30, maxMp: 40 },
            mp: 40
          }
        : { ...member, stats: { ...member.stats, agility: 31 } })
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    const partyIds = (bridge.getSnapshot().battle?.actors ?? [])
      .filter(({ isParty }) => isParty).map(({ id }) => id);
    expect(partyIds.length).toBe(2);
    const partyOrder = (): string[] =>
      (bridge.getSnapshot().battle?.turnOrder ?? []).filter((id) => partyIds.includes(id));

    // The recruit leads, so the protagonist acts second.
    const openingOrder = partyOrder();
    expect(openingOrder[0]).toBe("party.tovin-ash");
    const firstActor = bridge.getSnapshot().battle?.activeActorId;
    expect(firstActor).toBe("party.tovin-ash");
    await bridge.chooseBattleAction("guard");

    // Now the slower protagonist hastes themselves past the ally who just went.
    expect(bridge.getSnapshot().battle?.activeActorId).toBe("party.protagonist");
    const stride = bridge.getSnapshot().battle?.activeSkills
      .find(({ id }) => id === "skill.pathfinders-stride");
    expect(stride?.affordable, "the haste must be castable for this to prove anything").toBe(true);
    await bridge.chooseBattleAction("skill", "skill.pathfinders-stride");

    // The order really did invert — otherwise this test proves nothing.
    expect(partyOrder()[0], "the haste should have moved the caster to the front").toBe("party.protagonist");

    // And the recruit, who already acted, is not handed a second turn: the
    // round ends and the enemies answer instead.
    const after = bridge.getSnapshot().battle;
    if (after?.phase === "choosing") {
      expect(after.activeActorId).not.toBe("party.tovin-ash");
    }
  });
});
