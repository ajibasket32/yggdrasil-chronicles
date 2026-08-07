import { describe, expect, it } from "vitest";
import {
  chooseEnemyAction,
  createCombatState,
  damageOverTimeAmount,
  DAMAGE_OVER_TIME_CAP,
  enemyTargetingProfile
} from "../../src/engine/combat";
import type { Combatant } from "../../src/shared/types";

function combatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  return {
    name: overrides.id,
    level: 5,
    stats: {
      maxHp: 100,
      maxMp: 20,
      strength: 10,
      dexterity: 8,
      agility: 8,
      vitality: 10,
      intellect: 8,
      wisdom: 8,
      charisma: 5
    },
    hp: 100,
    mp: 20,
    skills: [],
    elements: {},
    statuses: [],
    isPlayerControlled: false,
    ...overrides
  };
}

describe("damage over time stays relevant as health pools grow", () => {
  it("uses the authored potency while it still matters", () => {
    // Against a small target the flat authored value is the larger of the two.
    expect(damageOverTimeAmount(5, 74)).toBe(5);
  });

  it("scales with the target instead of fading into irrelevance", () => {
    // Against a boss-sized pool a flat 5 is noise; the proportional floor takes over.
    const boss = damageOverTimeAmount(5, 900);
    expect(boss).toBeGreaterThan(5);
    expect(boss).toBe(Math.round(900 * 0.02));
  });

  it("caps a single tick so percentage damage cannot trivialise a long fight", () => {
    const huge = damageOverTimeAmount(500, 1000);
    expect(huge).toBe(Math.round(1000 * DAMAGE_OVER_TIME_CAP));
  });

  it("never ticks for less than one", () => {
    expect(damageOverTimeAmount(0, 10)).toBeGreaterThanOrEqual(1);
  });
});

describe("enemies do not all behave identically", () => {
  it("derives a profile from the enemy's own stat shape", () => {
    const quick = combatant({ id: "quick", stats: { ...combatant({ id: "x" }).stats, agility: 20 } });
    const caster = combatant({ id: "caster", stats: { ...combatant({ id: "x" }).stats, intellect: 20 } });
    const brute = combatant({ id: "brute", stats: { ...combatant({ id: "x" }).stats, strength: 20 } });

    expect(enemyTargetingProfile(quick)).toBe("opportunist");
    expect(enemyTargetingProfile(caster)).toBe("hunter");
    expect(enemyTargetingProfile(brute)).toBe("shifting");
  });

  it("sends an opportunist after the weakest character", () => {
    const base = combatant({ id: "x" }).stats;
    const party = [
      combatant({ id: "healthy", hp: 100, isPlayerControlled: true }),
      combatant({ id: "wounded", hp: 12, isPlayerControlled: true })
    ];
    const enemy = combatant({ id: "quick", stats: { ...base, agility: 20 } });
    const state = createCombatState(party, [enemy], "profiles");

    const action = chooseEnemyAction(state, "quick");
    expect(action.type === "attack" ? action.targetId : "").toBe("wounded");
  });

  it("sends a hunter after the biggest threat, not the weakest body", () => {
    const base = combatant({ id: "x" }).stats;
    const party = [
      combatant({ id: "threat", hp: 100, isPlayerControlled: true, stats: { ...base, strength: 30 } }),
      combatant({ id: "wounded", hp: 12, isPlayerControlled: true })
    ];
    const enemy = combatant({ id: "caster", stats: { ...base, intellect: 20 } });
    const state = createCombatState(party, [enemy], "profiles");

    const action = chooseEnemyAction(state, "caster");
    expect(action.type === "attack" ? action.targetId : "").toBe("threat");
  });

  it("stays deterministic for a given round", () => {
    const party = [
      combatant({ id: "a", isPlayerControlled: true }),
      combatant({ id: "b", isPlayerControlled: true })
    ];
    const enemy = combatant({ id: "brute" });
    const state = createCombatState(party, [enemy], "profiles");

    const first = chooseEnemyAction(state, "brute");
    const second = chooseEnemyAction(state, "brute");
    // Round-derived, never drawn from state.rng: repeated calls agree, and the
    // seeded campaign simulation stays reproducible.
    expect(first).toEqual(second);
  });
});

describe("a boss shows its whole kit", () => {
  const strike = {
    id: "skill.strike", name: "Strike", element: "physical" as const,
    power: 30, accuracy: 0.9, mpCost: 0, target: "enemy" as const
  };
  const ember = {
    id: "skill.ember", name: "Ember", element: "fire" as const,
    power: 30, accuracy: 0.9, mpCost: 0, target: "enemy" as const
  };
  const catalog = { [strike.id]: strike, [ember.id]: ember };

  function actionAtRound(round: number): string | undefined {
    const hero = combatant({ id: "hero", isPlayerControlled: true });
    const boss = combatant({ id: "boss", skills: [strike.id, ember.id], hp: 40 });
    const state = { ...createCombatState([hero], [boss], "kit-seed"), round };
    const action = chooseEnemyAction(state, "boss", catalog);
    return action.type === "skill" ? action.skillId : undefined;
  }

  it("rotates through every known skill instead of repeating the first", () => {
    const used = new Set([1, 2, 3, 4].map((round) => actionAtRound(round)));
    // Previously `skills.find` pinned every bloodied turn to the first entry,
    // so a boss's second authored form was content no fight ever showed.
    expect(used.has(strike.id)).toBe(true);
    expect(used.has(ember.id)).toBe(true);
  });

  it("stays deterministic: the same round always chooses the same form", () => {
    expect(actionAtRound(3)).toBe(actionAtRound(3));
  });

  it("still basic-attacks a combatant that knows no catalogued skill", () => {
    const hero = combatant({ id: "hero", isPlayerControlled: true });
    const boss = combatant({ id: "boss", skills: [], hp: 10 });
    const action = chooseEnemyAction(createCombatState([hero], [boss], "bare"), "boss", catalog);
    expect(action.type).toBe("attack");
  });
});

