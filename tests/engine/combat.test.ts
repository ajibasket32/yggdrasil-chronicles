import { describe, expect, it } from "vitest";
import {
  advanceCombatRound,
  calculateBattleReward,
  chooseEnemyAction,
  createCombatState,
  resolveCombatAction,
  type CombatSkill
} from "../../src/engine/combat";
import { baseStats, makeCombatant } from "./fixtures";

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
    const hero = makeCombatant("hero-one", { skills: [burningBlade.id] });
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

  it("gives a high-agility target a measurably lower chance to be hit than a low-agility one", () => {
    // Statistical check across many independent seeds: a target's agility
    // must reduce the attacker's effective hit chance (evasion), not just
    // exist as a decorative stat. Uses the default basic attack (accuracy
    // 0.95, unaffected by skill choice) so only target agility differs.
    const hero = makeCombatant("hero-one");
    const nimble = makeCombatant("nimble", { stats: { ...hero.stats, agility: 40 } });
    const sluggish = makeCombatant("sluggish", { stats: { ...hero.stats, agility: 0 } });
    const action = (targetId: string) => ({ type: "attack" as const, actorId: hero.id, targetId });

    let nimbleMisses = 0;
    let sluggishMisses = 0;
    const trials = 200;
    for (let trial = 0; trial < trials; trial += 1) {
      const seed = `evasion-trial-${trial}`;
      const nimbleResult = resolveCombatAction(createCombatState([hero], [nimble], seed), action(nimble.id));
      const sluggishResult = resolveCombatAction(createCombatState([hero], [sluggish], seed), action(sluggish.id));
      if (nimbleResult.events.some((event) => event.type === "miss")) nimbleMisses += 1;
      if (sluggishResult.events.some((event) => event.type === "miss")) sluggishMisses += 1;
    }
    expect(nimbleMisses).toBeGreaterThan(sluggishMisses);
  });

  it("never lets a self-targeted healing form miss its own actor regardless of agility", () => {
    const mend: CombatSkill = {
      id: "self-mend",
      name: "Self Mend",
      element: "radiant",
      power: 18,
      accuracy: 1,
      mpCost: 4,
      target: "self",
      healing: true
    };
    // Deliberately low dexterity, high agility: if evasion applied to
    // self-targeted skills this would be the case most likely to miss.
    const healer = makeCombatant("healer", {
      hp: 10,
      skills: [mend.id],
      stats: { ...baseStats, dexterity: 0, agility: 99 }
    });
    const enemy = makeCombatant("mireling");
    for (let trial = 0; trial < 20; trial += 1) {
      const resolution = resolveCombatAction(
        createCombatState([healer], [enemy], `self-heal-${trial}`),
        { type: "skill", actorId: healer.id, targetId: healer.id, skillId: mend.id },
        { [mend.id]: mend }
      );
      expect(resolution.events.some((event) => event.type === "miss")).toBe(false);
    }
  });

  it("resolves healing forms without damaging their allied target", () => {
    const mend: CombatSkill = {
      id: "mend",
      name: "Mend",
      element: "radiant",
      power: 18,
      accuracy: 1,
      mpCost: 4,
      target: "self",
      healing: true
    };
    const healer = makeCombatant("healer", { hp: 20, skills: [mend.id] });
    const enemy = makeCombatant("mireling");
    const resolution = resolveCombatAction(
      createCombatState([healer], [enemy], "healing"),
      { type: "skill", actorId: healer.id, targetId: healer.id, skillId: mend.id },
      { [mend.id]: mend }
    );

    expect(resolution.state.party[0]?.hp).toBeGreaterThan(healer.hp);
    expect(resolution.state.enemies[0]?.hp).toBe(enemy.hp);
    expect(resolution.events[0]?.type).toBe("healing");
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

  it("rejects ambiguous or impossible combat setup", () => {
    const hero = makeCombatant("same-id");
    const duplicateEnemy = makeCombatant("same-id");
    expect(() => createCombatState([hero], [duplicateEnemy], "duplicate"))
      .toThrow(/IDs must be unique/);

    const impossibleEnemy = makeCombatant("impossible", { hp: 101 });
    expect(() => createCombatState([hero], [impossibleEnemy], "invalid-health"))
      .toThrow(/invalid HP/);

    const defeatedEnemy = makeCombatant("defeated", { hp: 0 });
    expect(() => createCombatState([hero], [defeatedEnemy], "already-over"))
      .toThrow(/living combatant/);
  });

  it("only resolves skills learned by the acting combatant", () => {
    const hero = makeCombatant("hero-one");
    const enemy = makeCombatant("mireling");
    const state = createCombatState([hero], [enemy], "skill-ownership");

    expect(() => resolveCombatAction(
      state,
      { type: "skill", actorId: hero.id, targetId: enemy.id, skillId: burningBlade.id },
      { [burningBlade.id]: burningBlade }
    )).toThrow(/does not know skill/);
    expect(state.party[0]?.mp).toBe(hero.mp);
  });

  it("has an enemy with a known skill use it once bloodied, instead of only ever basic-attacking", () => {
    const hero = makeCombatant("hero-one");
    const healthyBoss = makeCombatant("boss", {
      skills: [burningBlade.id],
      stats: { ...baseStats, maxHp: 200 },
      hp: 200
    });
    const bloodiedBoss = makeCombatant("boss", {
      skills: [burningBlade.id],
      stats: { ...baseStats, maxHp: 200 },
      hp: 100
    });
    const catalog = { [burningBlade.id]: burningBlade };

    const healthyAction = chooseEnemyAction(
      createCombatState([hero], [healthyBoss], "boss-ai"),
      healthyBoss.id,
      catalog
    );
    const bloodiedAction = chooseEnemyAction(
      createCombatState([hero], [bloodiedBoss], "boss-ai"),
      bloodiedBoss.id,
      catalog
    );
    expect(healthyAction.type).toBe("attack");
    expect(bloodiedAction).toEqual({
      type: "skill",
      actorId: bloodiedBoss.id,
      targetId: hero.id,
      skillId: burningBlade.id
    });
  });

  it("keeps chooseEnemyAction's basic-attack behavior when no skill catalog is supplied, for backward compatibility", () => {
    const hero = makeCombatant("hero-one");
    const bloodiedBoss = makeCombatant("boss", {
      skills: [burningBlade.id],
      stats: { ...baseStats, maxHp: 200 },
      hp: 50
    });
    const action = chooseEnemyAction(createCombatState([hero], [bloodiedBoss], "no-catalog"), bloodiedBoss.id);
    expect(action.type).toBe("attack");
  });

  it("is fully deterministic: the same seed always produces the same enemy decision", () => {
    const hero = makeCombatant("hero-one");
    const bloodiedBoss = makeCombatant("boss", {
      skills: [burningBlade.id],
      stats: { ...baseStats, maxHp: 200 },
      hp: 90
    });
    const catalog = { [burningBlade.id]: burningBlade };
    const first = chooseEnemyAction(createCombatState([hero], [bloodiedBoss], "repeat-seed"), bloodiedBoss.id, catalog);
    const second = chooseEnemyAction(createCombatState([hero], [bloodiedBoss], "repeat-seed"), bloodiedBoss.id, catalog);
    expect(first).toEqual(second);
  });
});

/** A self-buff shaped exactly like the authored Rallying Strike / Pathfinder's Stride. */
const selfBuff: CombatSkill = {
  id: "skill.self-buff",
  name: "Self Buff",
  element: "physical",
  power: 0,
  accuracy: 1,
  mpCost: 4,
  target: "self",
  status: { id: "fortify", chance: 1, turns: 3, potency: 0.3 }
};

describe("self-targeted forms", () => {
  function castSelfBuff(seed = "self-buff") {
    const hero = makeCombatant("hero-one", { skills: [selfBuff.id] });
    const foe = makeCombatant("foe");
    const state = createCombatState([hero], [foe], seed);
    return resolveCombatAction(
      state,
      { type: "skill", actorId: hero.id, targetId: hero.id, skillId: selfBuff.id },
      { [selfBuff.id]: selfBuff }
    );
  }

  it("buffs the caster instead of wounding them", () => {
    const { state, events } = castSelfBuff();
    const hero = state.party[0]!;
    expect(hero.hp).toBe(baseStats.maxHp);
    expect(events.some((event) => event.type === "damage")).toBe(false);
    expect(hero.statuses.map(({ id }) => id)).toContain("fortify");
  });

  it("charges the caster its MP cost rather than refunding it", () => {
    const { state } = castSelfBuff();
    expect(state.party[0]!.mp).toBe(baseStats.maxMp - selfBuff.mpCost);
  });

  it("still charges MP for a self-targeted heal", () => {
    const selfHeal: CombatSkill = {
      id: "skill.self-mend",
      name: "Self Mend",
      element: "radiant",
      power: 10,
      accuracy: 1,
      mpCost: 5,
      target: "self",
      healing: true
    };
    const hero = makeCombatant("hero-one", { skills: [selfHeal.id], hp: 40 });
    const foe = makeCombatant("foe");
    const { state } = resolveCombatAction(
      createCombatState([hero], [foe], "self-heal"),
      { type: "skill", actorId: hero.id, targetId: hero.id, skillId: selfHeal.id },
      { [selfHeal.id]: selfHeal }
    );
    expect(state.party[0]!.mp).toBe(baseStats.maxMp - selfHeal.mpCost);
    expect(state.party[0]!.hp).toBeGreaterThan(40);
  });
});
