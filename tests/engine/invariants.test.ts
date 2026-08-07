import { describe, expect, it } from "vitest";
import {
  advanceCombatRound,
  chooseEnemyAction,
  createCombatState,
  getInitiativeOrder,
  resolveCombatAction,
  type CombatSkill,
  type CombatState
} from "../../src/engine/combat";
import type { Combatant, StatusInstance } from "../../src/shared/types";
import { makeCombatant } from "./fixtures";

/**
 * The engine's own invariants, checked over many seeded battles played to the
 * end rather than over a handful of hand-picked situations.
 *
 * Combat is a long chain of clamps, multipliers and status interactions, and a
 * unit test only ever asserts the case its author already suspected. Driving
 * real fights and asserting what must be true after *every* action covers the
 * combinations nobody thought to write down — a pool going negative, a heal
 * pushing past a maximum, an arithmetic path producing NaN, a status that never
 * expires and hangs the battle.
 */

const SKILLS: Readonly<Record<string, CombatSkill>> = {
  "skill.strike": {
    id: "skill.strike", name: "Strike", element: "physical", power: 14,
    accuracy: 0.9, mpCost: 4, target: "enemy",
    status: { id: "bleed", chance: 0.5, turns: 3, potency: 4 }
  },
  "skill.ember": {
    id: "skill.ember", name: "Ember", element: "fire", power: 18,
    accuracy: 0.85, mpCost: 6, target: "enemy",
    status: { id: "burn", chance: 0.6, turns: 2, potency: 5 }
  },
  "skill.mend": {
    id: "skill.mend", name: "Mend", element: "radiant", power: 16,
    accuracy: 1, mpCost: 5, target: "ally", healing: true
  },
  "skill.brace": {
    id: "skill.brace", name: "Brace", element: "physical", power: 0,
    accuracy: 1, mpCost: 3, target: "self",
    status: { id: "fortify", chance: 1, turns: 3, potency: 0.3 }
  },
  "skill.hasten": {
    id: "skill.hasten", name: "Hasten", element: "radiant", power: 0,
    accuracy: 1, mpCost: 3, target: "self",
    status: { id: "haste", chance: 1, turns: 2, potency: 0.5 }
  },
  "skill.lull": {
    id: "skill.lull", name: "Lull", element: "shadow", power: 6,
    accuracy: 0.8, mpCost: 5, target: "enemy",
    status: { id: "sleep", chance: 0.7, turns: 2, potency: 0 }
  },
  "skill.wither": {
    id: "skill.wither", name: "Wither", element: "shadow", power: 9,
    accuracy: 0.85, mpCost: 4, target: "enemy",
    status: { id: "weaken", chance: 0.6, turns: 3, potency: 0.3 }
  }
};

const PARTY_SKILLS = Object.keys(SKILLS);
const ENEMY_SKILLS = ["skill.strike", "skill.ember", "skill.lull", "skill.wither"];

/** A tiny deterministic generator, so the fuzz is reproducible from its seed. */
function makeSequence(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function buildBattle(seed: number): CombatState {
  const next = makeSequence(seed);
  const pick = <T>(pool: readonly T[], count: number): T[] =>
    Array.from({ length: count }, () => pool[Math.floor(next() * pool.length)]!);

  const partySize = 1 + Math.floor(next() * 4);
  const enemyCount = 1 + Math.floor(next() * 4);
  const scale = (base: number): number => Math.max(1, Math.round(base * (0.5 + next() * 1.5)));

  const build = (id: string, skills: readonly string[]): Combatant => {
    const maxHp = scale(90);
    const maxMp = scale(28);
    // Start some combatants wounded and some low on MP, so the fuzz reaches
    // insufficient-MP and near-death paths rather than only full-health ones.
    const statuses: StatusInstance[] = next() < 0.35
      ? [{
          id: (["poison", "burn", "bleed", "slow", "weaken", "fortify"] as const)[Math.floor(next() * 6)]!,
          remainingTurns: 1 + Math.floor(next() * 3),
          potency: Math.round(next() * 6)
        }]
      : [];
    return makeCombatant(id, {
      stats: {
        maxHp, maxMp,
        strength: scale(12), dexterity: scale(10), agility: scale(9),
        vitality: scale(8), intellect: scale(7), wisdom: scale(7), charisma: scale(6)
      },
      hp: Math.max(1, Math.round(maxHp * (0.2 + next() * 0.8))),
      mp: Math.round(maxMp * next()),
      skills: pick(skills, 1 + Math.floor(next() * 3)),
      elements: { fire: next() * 1.4 - 0.5, shadow: next() * 1.4 - 0.5 },
      statuses
    });
  };

  const party = Array.from({ length: partySize }, (_, index) => build(`hero-${index}`, PARTY_SKILLS));
  const enemies = Array.from({ length: enemyCount }, (_, index) => build(`foe-${index}`, ENEMY_SKILLS));
  return createCombatState(party, enemies, `fuzz:${seed}`);
}

function checkInvariants(state: CombatState, label: string): void {
  for (const combatant of [...state.party, ...state.enemies]) {
    const where = `${label} / ${combatant.id}`;
    expect(Number.isFinite(combatant.hp), `${where} hp is not finite`).toBe(true);
    expect(Number.isFinite(combatant.mp), `${where} mp is not finite`).toBe(true);
    expect(Number.isInteger(combatant.hp), `${where} hp is fractional`).toBe(true);
    expect(Number.isInteger(combatant.mp), `${where} mp is fractional`).toBe(true);
    expect(combatant.hp, `${where} hp below zero`).toBeGreaterThanOrEqual(0);
    expect(combatant.mp, `${where} mp below zero`).toBeGreaterThanOrEqual(0);
    expect(combatant.hp, `${where} hp above maximum`).toBeLessThanOrEqual(combatant.stats.maxHp);
    expect(combatant.mp, `${where} mp above maximum`).toBeLessThanOrEqual(combatant.stats.maxMp);
    for (const status of combatant.statuses) {
      expect(status.remainingTurns, `${where} status ${status.id} has non-positive turns`)
        .toBeGreaterThan(0);
      expect(Number.isFinite(status.potency), `${where} status ${status.id} potency is not finite`)
        .toBe(true);
    }
    // A status set may not carry the same id twice: two copies stack their
    // ticks and their expiry counts independently.
    const ids = combatant.statuses.map((status) => status.id);
    expect(new Set(ids).size, `${where} has duplicate statuses`).toBe(ids.length);
  }
}

/** Plays one battle to its end, asserting invariants after every single step. */
function playBattle(seed: number, seen?: Map<string, number>): { rounds: number; outcome: string } {
  let state = buildBattle(seed);
  checkInvariants(state, `seed ${seed} start`);

  let rounds = 0;
  const ROUND_LIMIT = 400;
  while (state.outcome === "ongoing" && rounds < ROUND_LIMIT) {
    for (const actorId of getInitiativeOrder(state)) {
      if (state.outcome !== "ongoing") break;
      const actor = [...state.party, ...state.enemies].find(({ id }) => id === actorId);
      if (!actor || actor.hp <= 0) continue;

      const livingFoes = (actor.isPlayerControlled ? state.enemies : state.party).filter((c) => c.hp > 0);
      const livingFriends = (actor.isPlayerControlled ? state.party : state.enemies).filter((c) => c.hp > 0);
      if (!livingFoes.length || !livingFriends.length) break;

      const action = actor.isPlayerControlled
        // Cycle deterministically through every action shape the player has,
        // so guard, self-buffs, heals and attacks all get exercised.
        ? (() => {
            const choice = (rounds + actorId.length) % 4;
            const skillId = actor.skills[rounds % actor.skills.length];
            const skill = skillId ? SKILLS[skillId] : undefined;
            if (choice === 0 || !skill) return { type: "attack" as const, actorId, targetId: livingFoes[0]!.id };
            if (choice === 1) return { type: "guard" as const, actorId };
            const targetId = skill.target === "enemy"
              ? livingFoes[rounds % livingFoes.length]!.id
              : skill.target === "self" ? actorId : livingFriends[rounds % livingFriends.length]!.id;
            return { type: "skill" as const, actorId, targetId, skillId: skill.id };
          })()
        : chooseEnemyAction(state, actorId, SKILLS);

      const resolution = resolveCombatAction(state, action, SKILLS);
      state = resolution.state;
      checkInvariants(state, `seed ${seed} round ${rounds} action ${action.type}`);
      for (const event of resolution.events) {
        if (seen) seen.set(event.type, (seen.get(event.type) ?? 0) + 1);
        if (event.type === "damage" || event.type === "healing" || event.type === "status_damage") {
          expect(Number.isFinite(event.amount), `seed ${seed} ${event.type} amount is not finite`).toBe(true);
          expect(event.amount, `seed ${seed} ${event.type} amount is negative`).toBeGreaterThanOrEqual(0);
        }
      }
    }
    if (state.outcome !== "ongoing") break;
    const advanced = advanceCombatRound(state);
    if (seen) for (const event of advanced.events) seen.set(event.type, (seen.get(event.type) ?? 0) + 1);
    state = advanced.state;
    checkInvariants(state, `seed ${seed} end of round ${rounds}`);
    rounds += 1;
  }

  expect(rounds, `seed ${seed} never terminated`).toBeLessThan(ROUND_LIMIT);
  return { rounds, outcome: state.outcome };
}

describe("combat engine invariants", () => {
  it("holds every pool, status and event invariant across 300 seeded battles", () => {
    const outcomes = new Map<string, number>();
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed += 1) {
      const { outcome } = playBattle(seed, seen);
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    }
    // A fuzz that never reaches the hard paths proves nothing, so it has to say
    // which ones it reached. Every branch that can produce a wrong number must
    // appear at least once, or this test is decoration.
    for (const required of [
      "damage", "healing", "miss", "guard", "status_applied",
      "status_damage", "status_expired", "insufficient_mp", "incapacitated", "battle_ended"
    ]) {
      expect(seen.get(required) ?? 0, `fuzz never produced a '${required}' event`).toBeGreaterThan(0);
    }
    // Both sides must be able to win, or the fuzz is only exercising one path.
    expect(outcomes.get("victory") ?? 0).toBeGreaterThan(0);
    expect(outcomes.get("defeat") ?? 0).toBeGreaterThan(0);
    expect(outcomes.get("ongoing") ?? 0).toBe(0);
    // Three hundred full battles take a few seconds; the default 5s budget is
    // sized for unit tests and this is not one.
  }, 60_000);

  it("replays a battle identically from the same seed", () => {
    const first = playBattle(4242);
    const second = playBattle(4242);
    expect(second).toEqual(first);
  });
});
