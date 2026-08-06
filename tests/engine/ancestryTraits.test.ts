import { describe, expect, it } from "vitest";
import { ancestryTraits, traitForAncestry, traitIdsForAncestry } from "../../src/content/ancestryTraits";
import { ancestries } from "../../src/content/campaign";
import {
  createCombatState,
  getInitiativeOrder,
  resolveCombatAction,
  type CombatSkill
} from "../../src/engine";
import type { Combatant, TraitId } from "../../src/shared/types";
import { makePlayerCharacter } from "./fixtures";

function combatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  return { ...makePlayerCharacter(), ...overrides };
}

function enemy(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return combatant({ id, isPlayerControlled: false, ...overrides });
}

const HEAL: CombatSkill = { id: "skill.test-heal", name: "Test Heal", element: "radiant", power: 20, accuracy: 1, mpCost: 0, target: "ally", healing: true };
const AFFLICT: CombatSkill = {
  id: "skill.test-poison",
  name: "Test Poison",
  element: "nature",
  power: 10,
  accuracy: 1,
  mpCost: 0,
  target: "enemy",
  status: { id: "poison", chance: 1, turns: 3, potency: 2 }
};

/**
 * Runs one skill from party[0] onto the given target and returns the target's
 * post-action state. Seeded, so every assertion is deterministic.
 */
function castOnto(
  party: Combatant[],
  enemies: Combatant[],
  skill: CombatSkill,
  targetId: string,
  seed = "trait-test"
) {
  const caster = { ...party[0]!, skills: [...party[0]!.skills, skill.id] };
  const state = createCombatState([caster, ...party.slice(1)], enemies, seed);
  const result = resolveCombatAction(
    state,
    { type: "skill", actorId: caster.id, targetId, skillId: skill.id },
    { [skill.id]: skill }
  );
  return [...result.state.party, ...result.state.enemies].find(({ id }) => id === targetId)!;
}

describe("ancestry traits", () => {
  it("gives every ancestry exactly one trait, in its own words", () => {
    for (const ancestry of ancestries) {
      const trait = traitForAncestry(ancestry.id);
      expect(trait, ancestry.id).toBeDefined();
      expect(trait!.name.length).toBeGreaterThan(0);
      expect(trait!.description.length).toBeGreaterThan(10);
    }
    expect(new Set(ancestryTraits.map(({ id }) => id)).size).toBe(ancestryTraits.length);
    expect(traitIdsForAncestry("nobody")).toEqual([]);
  });

  it("Hearthfire: the same cast heals a hearthborn harder", () => {
    const healer = combatant({ id: "party.healer" });
    const plain = combatant({ id: "party.plain", hp: 10 });
    const hearth = combatant({ id: "party.hearth", hp: 10, traits: ["trait.hearthfire"] });
    const foe = enemy("enemy.dummy.0");

    const healedPlain = castOnto([healer, plain], [foe], HEAL, "party.plain");
    const healedHearth = castOnto([healer, hearth], [foe], HEAL, "party.hearth");
    expect(healedHearth.hp).toBeGreaterThan(healedPlain.hp);
  });

  it("Rootspeaker: an affliction lands but loses a round of its hold", () => {
    const caster = combatant({ id: "party.caster" });
    const plainFoe = enemy("enemy.plain.0");
    const rootFoe = enemy("enemy.root.0", { traits: ["trait.rootspeaker"] });

    const afflictedPlain = castOnto([caster], [plainFoe], AFFLICT, "enemy.plain.0");
    const afflictedRoot = castOnto([caster], [rootFoe], AFFLICT, "enemy.root.0");
    expect(afflictedPlain.statuses.find(({ id }) => id === "poison")?.remainingTurns).toBe(3);
    expect(afflictedRoot.statuses.find(({ id }) => id === "poison")?.remainingTurns).toBe(2);
  });

  it("Stoneguard: guarding blocks harder than an ordinary guard", () => {
    const attacker = combatant({ id: "party.attacker" });
    const guardStatus = { id: "guard" as const, remainingTurns: 1, potency: 0.5 };
    const plainGuard = enemy("enemy.guarding.0", { hp: 500, stats: { ...makePlayerCharacter().stats, maxHp: 500 }, statuses: [guardStatus] });
    const stoneGuard = enemy("enemy.stone.0", {
      hp: 500,
      stats: { ...makePlayerCharacter().stats, maxHp: 500 },
      statuses: [guardStatus],
      traits: ["trait.stoneguard"]
    });
    const STRIKE: CombatSkill = { id: "skill.test-strike", name: "Test Strike", element: "physical", power: 60, accuracy: 1, mpCost: 0, target: "enemy" };

    const struckPlain = castOnto([attacker], [plainGuard], STRIKE, "enemy.guarding.0");
    const struckStone = castOnto([attacker], [stoneGuard], STRIKE, "enemy.stone.0");
    expect(500 - struckStone.hp).toBeLessThan(500 - struckPlain.hp);
  });

  it("Wayfinder: equal agility, but the wayfarer acts first", () => {
    const stats = makePlayerCharacter().stats;
    const wayfarer = combatant({ id: "party.wayfarer", stats: { ...stats, agility: 10 }, traits: ["trait.wayfinder"] });
    const rival = enemy("enemy.rival.0", { stats: { ...stats, agility: 12 } });
    const state = createCombatState([wayfarer], [rival], "initiative-test");
    // 10 + 3 beats 12; without the trait, 12 would go first.
    expect(getInitiativeOrder(state)[0]).toBe("party.wayfarer");
  });

  it("keeps trait ids inside the engine's known union", () => {
    const known: readonly TraitId[] = ["trait.hearthfire", "trait.rootspeaker", "trait.stoneguard", "trait.wayfinder"];
    for (const trait of ancestryTraits) expect(known).toContain(trait.id);
  });
});
