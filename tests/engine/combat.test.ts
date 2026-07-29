import { describe, expect, it } from "vitest";
import {
  advanceCombatRound,
  calculateBattleReward,
  createCombatState,
  resolveCombatAction,
  type CombatSkill
} from "../../src/engine/combat";
import { makeCombatant } from "./fixtures";

const burningBlade: CombatSkill = {
  id: "burning-blade",
  name: "Burning Blade",
  element: "fire",
  power: 18,
  accuracy: 1,
  mpCost: 4,
  target: "enemy",
  status: { id: "burn", chance: 1, turns: 2, potency: 5 }
};

describe("deterministic combat", () => {
  it("produces identical state and events from the same seed and action", () => {
    const hero = makeCombatant("hero-one");
    const enemy = makeCombatant("mireling");
    const first = resolveCombatAction(
      createCombatState([hero], [enemy], "battle-seed"),
      { type: "skill", actorId: hero.id, targetId: enemy.id, skillId: burningBlade.id },
      { [burningBlade.id]: burningBlade }
    );
    const second = resolveCombatAction(
      createCombatState([hero], [enemy], "battle-seed"),
      { type: "skill", actorId: hero.id, targetId: enemy.id, skillId: burningBlade.id },
      { [burningBlade.id]: burningBlade }
    );
    expect(first).toEqual(second);
    expect(first.state.enemies[0]?.statuses[0]?.id).toBe("burn");
    expect(first.state.party[0]?.mp).toBe(hero.mp - burningBlade.mpCost);
  });

  it("honors resistance, weakness, and guard", () => {
    const hero = makeCombatant("hero-one");
    const resistant = makeCombatant("resistant", { elements: { physical: 0.5 } });
    const weak = makeCombatant("weak", { elements: { physical: -0.5 } });
    const guarded = makeCombatant("guarded", {
      statuses: [{ id: "guard", remainingTurns: 1, potency: 0.5 }]
    });
    const action = (targetId: string) => ({ type: "attack" as const, actorId: hero.id, targetId });
    const resistantHit = resolveCombatAction(createCombatState([hero], [resistant], "same"), action(resistant.id));
    const weakHit = resolveCombatAction(createCombatState([hero], [weak], "same"), action(weak.id));
    const guardedHit = resolveCombatAction(createCombatState([hero], [guarded], "same"), action(guarded.id));
    const damage = (resolution: typeof resistantHit) =>
      resolution.events.find((event) => event.type === "damage")?.amount ?? 0;
    expect(damage(weakHit)).toBeGreaterThan(damage(resistantHit));
    expect(damage(guardedHit)).toBeLessThan(damage(weakHit));
  });

  it("ticks damaging statuses and ends combat when the last enemy falls", () => {
    const enemy = makeCombatant("mireling", {
      hp: 4,
      statuses: [{ id: "poison", remainingTurns: 1, potency: 4 }]
    });
    const resolution = advanceCombatRound(createCombatState([makeCombatant("hero-one")], [enemy], "status"));
    expect(resolution.state.outcome).toBe("victory");
    expect(resolution.events).toContainEqual({ type: "battle_ended", outcome: "victory" });
  });

  it("uses deterministic reward tables owned by the engine", () => {
    expect(calculateBattleReward("boss", 8, "wyrm")).toEqual(calculateBattleReward("boss", 8, "wyrm"));
    expect(calculateBattleReward("boss", 8, "wyrm").experience)
      .toBeGreaterThan(calculateBattleReward("standard", 8, "wyrm").experience);
  });
});

