import { describe, expect, it } from "vitest";
import { grantExperience, totalExperienceForLevel } from "../../src/engine/progression";
import { EngineGameBridge } from "../../src/integration/EngineGameBridge";
import { MemorySaveStorage } from "../../src/save/memory-storage";
import { SaveRepository } from "../../src/save/repository";

const FIXED_SEED = "targeting-fixture";

function createBridge(): { bridge: EngineGameBridge; saves: SaveRepository } {
  const saves = new SaveRepository(new MemorySaveStorage());
  return { bridge: new EngineGameBridge(saves, () => FIXED_SEED), saves };
}

/**
 * Guards past other party members until `actorId` holds the turn. Turn order
 * follows initiative, so no test may assume a given character acts first.
 */
async function advanceUntilActive(bridge: EngineGameBridge, actorId: string): Promise<void> {
  for (let guard = 0; guard < 8; guard += 1) {
    const battle = bridge.getSnapshot().battle;
    if (!battle || battle.phase !== "choosing" || battle.activeActorId === actorId) return;
    await bridge.chooseBattleAction("guard");
  }
  throw new Error(`${actorId} never took a turn`);
}

/** A two-member party, reached by completing the recruitment quest the bridge gates on. */
async function startTwoMemberParty(bridge: EngineGameBridge, saves: SaveRepository): Promise<void> {
  await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "mender", difficulty: "normal" });
  const initial = await saves.load("autosave");
  if (!initial) throw new Error("expected an autosave");
  await saves.save("autosave", {
    ...initial,
    quests: initial.quests.map((quest) =>
      quest.questId === "quest.tovins-company"
        ? { ...quest, state: "completed" as const, currentStep: 3 }
        : quest)
  });
  await bridge.continueGame();
  await bridge.interactNpc("npc.tovin-ash");
}

describe("battle targeting", () => {
  it("lands an attack on the enemy the player names, not just the first living one", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    bridge.startEncounter("encounter.mossroad-foragers");

    const before = bridge.getSnapshot().battle;
    const enemies = before?.actors.filter((actor) => !actor.isParty) ?? [];
    expect(enemies.length).toBeGreaterThan(1);
    const second = enemies[1];
    if (!second) throw new Error("expected a second enemy");
    expect(second.hp).toBe(second.maxHp);

    await bridge.chooseBattleAction("attack", undefined, second.id);

    const after = bridge.getSnapshot().battle?.actors.find(({ id }) => id === second.id);
    const first = bridge.getSnapshot().battle?.actors.find(({ id }) => id === enemies[0]?.id);
    expect(after?.hp).toBeLessThan(second.maxHp);
    // The default target is untouched, proving the request was honoured rather
    // than coincidentally matching the fallback.
    expect(first?.hp).toBe(first?.maxHp);
  });

  it("remembers the last target so a repeat attack needs no re-aim", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    bridge.startEncounter("encounter.mossroad-foragers");
    const enemies = bridge.getSnapshot().battle?.actors.filter((actor) => !actor.isParty) ?? [];
    const second = enemies[1];
    if (!second) throw new Error("expected a second enemy");

    await bridge.chooseBattleAction("attack", undefined, second.id);
    const afterFirst = bridge.getSnapshot().battle?.actors.find(({ id }) => id === second.id)?.hp ?? 0;
    await bridge.chooseBattleAction("attack");
    const afterSecond = bridge.getSnapshot().battle?.actors.find(({ id }) => id === second.id)?.hp ?? 0;

    expect(afterSecond).toBeLessThan(afterFirst);
  });

  it("falls back to a living enemy when the remembered target dies", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    bridge.startEncounter("encounter.mossroad-foragers");
    const enemies = bridge.getSnapshot().battle?.actors.filter((actor) => !actor.isParty) ?? [];
    const first = enemies[0];
    if (!first) throw new Error("expected an enemy");

    for (let turn = 0; turn < 20; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      if ((battle.actors.find(({ id }) => id === first.id)?.hp ?? 0) <= 0) break;
      await bridge.chooseBattleAction("attack", undefined, first.id);
    }

    const battle = bridge.getSnapshot().battle;
    if (!battle || battle.phase !== "choosing") return;
    expect(battle.actors.find(({ id }) => id === first.id)?.alive).toBe(false);

    // The next unaimed action must still resolve rather than aiming at a corpse.
    const livingBefore = battle.actors.filter((actor) => !actor.isParty && actor.alive);
    await bridge.chooseBattleAction("attack");
    const livingAfter = bridge.getSnapshot().battle?.actors.filter((actor) => !actor.isParty && actor.alive) ?? [];
    const damaged = livingAfter.some((actor) => {
      const previous = livingBefore.find(({ id }) => id === actor.id);
      return previous !== undefined && actor.hp < previous.hp;
    });
    expect(damaged || livingAfter.length < livingBefore.length).toBe(true);
  });
});

describe("ally-targeted support", () => {
  it("lets a Mender heal a wounded companion rather than only themselves", async () => {
    const { bridge, saves } = createBridge();
    await startTwoMemberParty(bridge, saves);

    const loaded = await saves.load("autosave");
    if (!loaded || loaded.party.length < 2) throw new Error("expected a two-member party");
    const companion = loaded.party[1];
    if (!companion) throw new Error("expected a companion");
    // Wound the companion and leave the healer at full health, so a self-heal
    // would be a no-op and cannot be mistaken for success.
    await saves.save("autosave", {
      ...loaded,
      party: loaded.party.map((member, index) => index === 1 ? { ...member, hp: 5 } : member)
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    // Turn order follows initiative, so the healer is not necessarily first.
    // Guard until it is their turn rather than assuming array position.
    await advanceUntilActive(bridge, "party.protagonist");
    const healer = bridge.getSnapshot().battle?.actors.find(({ id }) => id === "party.protagonist");
    expect(healer?.hp).toBe(healer?.maxHp);

    await bridge.chooseBattleAction("skill", "skill.mend", `party.${companion.id.replace("party.", "")}`);

    const log = bridge.getSnapshot().battle?.log.join(" ") ?? "";
    expect(log).toMatch(/restores \d+ vitality to/);
  });

  it("offers healing skills as ally-targeted in the battle view", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Sage", ancestryId: "sylvan", jobId: "mender", difficulty: "normal" });
    bridge.startEncounter("encounter.mossroad-foragers");
    const mend = bridge.getSnapshot().battle?.activeSkills.find(({ id }) => id === "skill.mend");
    expect(mend?.target).toBe("ally");
    expect(mend?.element).toBe("radiant");
    expect(mend?.power).toBeGreaterThan(0);
    expect(mend?.affordable).toBe(true);
  });

  it("hands a battle item to the named ally", async () => {
    const { bridge, saves } = createBridge();
    await startTwoMemberParty(bridge, saves);
    const loaded = await saves.load("autosave");
    if (!loaded || loaded.party.length < 2) throw new Error("expected a two-member party");
    // Wound everyone, so whoever initiative puts first has a genuinely hurt
    // ally to hand the tonic to. Turn order is not the array order.
    await saves.save("autosave", {
      ...loaded,
      party: loaded.party.map((member) => ({ ...member, hp: 3 }))
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    const companionId = bridge.getSnapshot().battle?.actors
      .filter((actor) => actor.isParty)
      .find(({ id }) => id !== bridge.getSnapshot().battle?.activeActorId)?.id;
    if (!companionId) throw new Error("expected a companion in battle");
    const before = bridge.getSnapshot().battle?.actors.find(({ id }) => id === companionId)?.hp ?? 0;

    await bridge.chooseBattleAction("item", "item.root-tonic", companionId);

    const after = bridge.getSnapshot().battle?.actors.find(({ id }) => id === companionId)?.hp ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(bridge.getSnapshot().battle?.log.join(" ")).toMatch(/on .+, restoring vitality/);
  });
});

describe("battle view carries what the screen needs", () => {
  it("exposes MP, statuses, typed events and turn order", async () => {
    const { bridge } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "normal" });
    bridge.startEncounter("encounter.mossroad-foragers");

    const opening = bridge.getSnapshot().battle;
    expect(opening?.turnOrder.length).toBeGreaterThan(0);
    const hero = opening?.actors.find((actor) => actor.isParty);
    expect(hero?.maxMp).toBeGreaterThan(0);
    expect(hero?.statuses).toEqual([]);
    expect(hero?.alive).toBe(true);

    await bridge.chooseBattleAction("attack");

    const events = bridge.getSnapshot().battle?.events ?? [];
    expect(events.length).toBeGreaterThan(0);
    // Typed, not prose: the scene can read amounts and criticals directly.
    expect(events.some((event) => event.type === "damage" || event.type === "miss")).toBe(true);
  });

  it("marks a skill unaffordable once MP runs short", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Sage", ancestryId: "sylvan", jobId: "mender", difficulty: "normal" });
    const loaded = await saves.load("autosave");
    if (!loaded) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...loaded,
      party: loaded.party.map((member) => ({ ...member, mp: 0 }))
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mossroad-foragers");

    const skills = bridge.getSnapshot().battle?.activeSkills ?? [];
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((skill) => !skill.affordable)).toBe(true);
  });

  // Guard is consumed by the first hit and the enemy phase runs before the next
  // snapshot, so guard itself is not observable here. A boss-applied freeze is:
  // it lasts a turn and is the status the player most needs explained.
  //
  // The party is grown to the boss's authored level first. Encounters no longer
  // scale to the party, so a level-1 hero is killed by a level-7 boss before it
  // reaches the phase that applies the status.
  it("reports a status with a player-readable label", async () => {
    const { bridge, saves } = createBridge();
    await bridge.newGame({ name: "Aster", ancestryId: "hearthborn", jobId: "vanguard", difficulty: "easy" });
    const state = await saves.load("autosave");
    if (!state) throw new Error("expected an autosave");
    await saves.save("autosave", {
      ...state,
      party: state.party.map((member) => grantExperience(member, totalExperienceForLevel(9)).character)
    });
    await bridge.continueGame();
    bridge.startEncounter("encounter.mire-antler");

    for (let turn = 0; turn < 12; turn += 1) {
      const battle = bridge.getSnapshot().battle;
      if (!battle || battle.phase !== "choosing") break;
      const hero = battle.actors.find((actor) => actor.isParty);
      if ((hero?.statuses.length ?? 0) > 0) break;
      await bridge.chooseBattleAction("attack");
    }

    const hero = bridge.getSnapshot().battle?.actors.find((actor) => actor.isParty);
    const status = hero?.statuses[0];
    expect(status).toBeDefined();
    // Every id maps to prose, so no status can reach the screen unexplained.
    expect(status?.label.length ?? 0).toBeGreaterThan(0);
    expect(status?.label).not.toBe(status?.id);
    expect(status?.remainingTurns).toBeGreaterThan(0);
  });
});
