import { describe, expect, it } from "vitest";
import {
  createCombatState,
  getInitiativeOrder,
  resolveCombatAction,
  type CombatSkill
} from "../../src/engine/combat";
import type { Combatant } from "../../src/shared/types";

function combatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  return {
    name: overrides.id,
    level: 5,
    stats: {
      maxHp: 200,
      maxMp: 50,
      strength: 20,
      dexterity: 10,
      agility: 10,
      vitality: 10,
      intellect: 20,
      wisdom: 10,
      charisma: 5
    },
    hp: 200,
    mp: 50,
    // Every fixture knows every test skill; resolveCombatAction rejects an
    // actor that does not list the skill it is asked to use.
    skills: ["skill.test-strike", "skill.always-stun"],
    elements: {},
    statuses: [],
    isPlayerControlled: true,
    ...overrides
  };
}

const strike: CombatSkill = {
  id: "skill.test-strike",
  name: "Test Strike",
  element: "physical",
  power: 20,
  accuracy: 1,
  mpCost: 0,
  target: "enemy"
};

/** Damage dealt by a single attack, isolated from RNG by reading the event. */
function damageOf(actor: Combatant, target: Combatant): number {
  const state = createCombatState([actor], [target], "status-fixture");
  const { events } = resolveCombatAction(
    state,
    { type: "skill", actorId: actor.id, targetId: target.id, skillId: strike.id },
    { [strike.id]: strike }
  );
  const damage = events.find((event) => event.type === "damage");
  return damage && damage.type === "damage" ? damage.amount : 0;
}

describe("weaken and fortify change what a hit is worth", () => {
  it("cuts the damage a weakened actor deals", () => {
    const clean = damageOf(combatant({ id: "hero" }), combatant({ id: "foe", isPlayerControlled: false }));
    const weakened = damageOf(
      combatant({ id: "hero", statuses: [{ id: "weaken", remainingTurns: 3, potency: 0.3 }] }),
      combatant({ id: "foe", isPlayerControlled: false })
    );
    expect(clean).toBeGreaterThan(0);
    expect(weakened).toBeLessThan(clean);
  });

  it("cuts the damage a fortified target takes", () => {
    const clean = damageOf(combatant({ id: "hero" }), combatant({ id: "foe", isPlayerControlled: false }));
    const fortified = damageOf(
      combatant({ id: "hero" }),
      combatant({ id: "foe", isPlayerControlled: false, statuses: [{ id: "fortify", remainingTurns: 3, potency: 0.3 }] })
    );
    expect(fortified).toBeLessThan(clean);
  });

  it("never reduces damage below one", () => {
    const crushed = damageOf(
      combatant({ id: "hero", statuses: [{ id: "weaken", remainingTurns: 3, potency: 1 }] }),
      combatant({ id: "foe", isPlayerControlled: false, statuses: [{ id: "fortify", remainingTurns: 3, potency: 1 }] })
    );
    expect(crushed).toBeGreaterThanOrEqual(1);
  });
});

describe("haste and slow change the turn order", () => {
  it("moves a hastened combatant ahead of an equal-agility rival", () => {
    const state = createCombatState(
      [combatant({ id: "a.slowpoke" }), combatant({ id: "b.runner", statuses: [{ id: "haste", remainingTurns: 3, potency: 0.5 }] })],
      [combatant({ id: "foe", isPlayerControlled: false })],
      "initiative-fixture"
    );
    const order = getInitiativeOrder(state);
    expect(order.indexOf("b.runner")).toBeLessThan(order.indexOf("a.slowpoke"));
  });

  it("moves a slowed combatant behind an equal-agility rival", () => {
    const state = createCombatState(
      [combatant({ id: "a.dragging", statuses: [{ id: "slow", remainingTurns: 3, potency: 0.5 }] }), combatant({ id: "b.steady" })],
      [combatant({ id: "foe", isPlayerControlled: false })],
      "initiative-fixture"
    );
    const order = getInitiativeOrder(state);
    expect(order.indexOf("b.steady")).toBeLessThan(order.indexOf("a.dragging"));
  });
});

describe("status resistance", () => {
  const stunner: CombatSkill = {
    id: "skill.always-stun",
    name: "Always Stun",
    element: "physical",
    power: 1,
    accuracy: 1,
    mpCost: 0,
    target: "enemy",
    status: { id: "stun", chance: 1, turns: 2, potency: 0 }
  };

  it("lands a guaranteed status on an unresistant target", () => {
    const state = createCombatState(
      [combatant({ id: "hero" })],
      [combatant({ id: "foe", isPlayerControlled: false })],
      "resist-fixture"
    );
    const { state: next } = resolveCombatAction(
      state,
      { type: "skill", actorId: "hero", targetId: "foe", skillId: stunner.id },
      { [stunner.id]: stunner }
    );
    expect(next.enemies[0]?.statuses.map(({ id }) => id)).toContain("stun");
  });

  it("never lands it on a fully immune target", () => {
    const state = createCombatState(
      [combatant({ id: "hero" })],
      [combatant({ id: "foe", isPlayerControlled: false, statusResistance: { stun: 1 } })],
      "resist-fixture"
    );
    const { state: next } = resolveCombatAction(
      state,
      { type: "skill", actorId: "hero", targetId: "foe", skillId: stunner.id },
      { [stunner.id]: stunner }
    );
    expect(next.enemies[0]?.statuses.map(({ id }) => id)).not.toContain("stun");
  });

  it("reduces, rather than gates, a partial resistance", () => {
    // Averaged across seeds: a 0.5 resistance should land roughly half as often
    // as none, and crucially must sometimes land.
    let landed = 0;
    const trials = 60;
    for (let i = 0; i < trials; i += 1) {
      const state = createCombatState(
        [combatant({ id: "hero" })],
        [combatant({ id: "foe", isPlayerControlled: false, statusResistance: { stun: 0.5 } })],
        `resist-${i}`
      );
      const { state: next } = resolveCombatAction(
        state,
        { type: "skill", actorId: "hero", targetId: "foe", skillId: stunner.id },
        { [stunner.id]: stunner }
      );
      if (next.enemies[0]?.statuses.some(({ id }) => id === "stun")) landed += 1;
    }
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThan(trials);
  });
});

describe("sleep breaks on damage", () => {
  it("wakes a sleeping target when it is hit", () => {
    const state = createCombatState(
      [combatant({ id: "hero" })],
      [combatant({ id: "foe", isPlayerControlled: false, statuses: [{ id: "sleep", remainingTurns: 3, potency: 0 }] })],
      "sleep-fixture"
    );
    const { state: next } = resolveCombatAction(
      state,
      { type: "skill", actorId: "hero", targetId: "foe", skillId: strike.id },
      { [strike.id]: strike }
    );
    expect(next.enemies[0]?.statuses.map(({ id }) => id)).not.toContain("sleep");
  });

  it("leaves stun and freeze in place, keeping the three distinct", () => {
    const state = createCombatState(
      [combatant({ id: "hero" })],
      [combatant({
        id: "foe",
        isPlayerControlled: false,
        statuses: [
          { id: "stun", remainingTurns: 3, potency: 0 },
          { id: "freeze", remainingTurns: 3, potency: 0 }
        ]
      })],
      "sleep-fixture"
    );
    const { state: next } = resolveCombatAction(
      state,
      { type: "skill", actorId: "hero", targetId: "foe", skillId: strike.id },
      { [strike.id]: strike }
    );
    const ids = next.enemies[0]?.statuses.map(({ id }) => id) ?? [];
    expect(ids).toContain("stun");
    expect(ids).toContain("freeze");
  });
});
