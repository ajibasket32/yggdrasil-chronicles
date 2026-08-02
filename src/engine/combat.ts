import type {
  Combatant,
  Element,
  EntityId,
  RewardTier,
  StatusInstance
} from "../shared/types";
import { createRng, nextRandom, randomChance, randomInt, type RngState } from "./rng";

export type CombatSide = "party" | "enemy";
export type CombatOutcome = "ongoing" | "victory" | "defeat";

export interface StatusApplication {
  readonly id: StatusInstance["id"];
  readonly chance: number;
  readonly turns: number;
  readonly potency: number;
}

export interface CombatSkill {
  readonly id: EntityId;
  readonly name: string;
  readonly element: Element;
  readonly power: number;
  readonly accuracy: number;
  readonly mpCost: number;
  readonly target: "enemy" | "ally" | "self";
  /** Converts power into deterministic HP recovery instead of damage. */
  readonly healing?: boolean;
  readonly status?: StatusApplication;
}

export type CombatAction =
  | { readonly type: "attack"; readonly actorId: EntityId; readonly targetId: EntityId }
  | { readonly type: "skill"; readonly actorId: EntityId; readonly targetId: EntityId; readonly skillId: EntityId }
  | { readonly type: "guard"; readonly actorId: EntityId };

export type CombatEvent =
  | { readonly type: "damage"; readonly actorId: EntityId; readonly targetId: EntityId; readonly amount: number; readonly element: Element; readonly critical: boolean }
  | { readonly type: "healing"; readonly actorId: EntityId; readonly targetId: EntityId; readonly amount: number }
  | { readonly type: "miss"; readonly actorId: EntityId; readonly targetId: EntityId }
  | { readonly type: "guard"; readonly actorId: EntityId }
  | { readonly type: "status_applied"; readonly targetId: EntityId; readonly status: StatusInstance["id"] }
  | { readonly type: "status_damage"; readonly targetId: EntityId; readonly status: StatusInstance["id"]; readonly amount: number }
  | { readonly type: "status_expired"; readonly targetId: EntityId; readonly status: StatusInstance["id"] }
  | { readonly type: "insufficient_mp"; readonly actorId: EntityId; readonly skillId: EntityId }
  | { readonly type: "incapacitated"; readonly actorId: EntityId; readonly status: StatusInstance["id"] }
  | { readonly type: "battle_ended"; readonly outcome: Exclude<CombatOutcome, "ongoing"> };

export interface CombatState {
  readonly party: Combatant[];
  readonly enemies: Combatant[];
  readonly rng: RngState;
  readonly round: number;
  readonly outcome: CombatOutcome;
}

export interface CombatResolution {
  readonly state: CombatState;
  readonly events: CombatEvent[];
}

export interface BattleReward {
  readonly experience: number;
  readonly currency: number;
  readonly itemRoll: number;
}

const BASIC_ATTACK: CombatSkill = {
  id: "basic-attack",
  name: "Attack",
  element: "physical",
  power: 12,
  accuracy: 0.95,
  mpCost: 0,
  target: "enemy"
};

function copyCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    stats: { ...combatant.stats },
    skills: [...combatant.skills],
    elements: { ...combatant.elements },
    statuses: combatant.statuses.map((status) => ({ ...status }))
  };
}

function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0;
}

function findCombatant(state: CombatState, id: EntityId): { combatant: Combatant; side: CombatSide; index: number } | undefined {
  const partyIndex = state.party.findIndex((combatant) => combatant.id === id);
  if (partyIndex >= 0) {
    const combatant = state.party[partyIndex];
    return combatant ? { combatant, side: "party", index: partyIndex } : undefined;
  }
  const enemyIndex = state.enemies.findIndex((combatant) => combatant.id === id);
  const combatant = state.enemies[enemyIndex];
  return enemyIndex >= 0 && combatant ? { combatant, side: "enemy", index: enemyIndex } : undefined;
}

function withCombatant(state: CombatState, side: CombatSide, index: number, combatant: Combatant): CombatState {
  if (side === "party") {
    const party = state.party.map((entry, entryIndex) => entryIndex === index ? combatant : entry);
    return { ...state, party };
  }
  const enemies = state.enemies.map((entry, entryIndex) => entryIndex === index ? combatant : entry);
  return { ...state, enemies };
}

function resolveOutcome(state: CombatState): CombatOutcome {
  if (!state.enemies.some(isAlive)) {
    return "victory";
  }
  if (!state.party.some(isAlive)) {
    return "defeat";
  }
  return "ongoing";
}

function clampResistance(value: number | undefined): number {
  return Math.max(-1, Math.min(0.9, value ?? 0));
}

function statusPotency(combatant: Combatant, id: StatusInstance["id"]): number | undefined {
  return combatant.statuses.find((status) => status.id === id)?.potency;
}

/**
 * Buff and debuff multipliers. `weaken` cuts what the actor deals, `fortify`
 * cuts what the target takes; both read the instance's own potency so a
 * stronger application is expressible without new status ids.
 */
function offenceMultiplier(actor: Combatant): number {
  const weaken = statusPotency(actor, "weaken");
  return weaken === undefined ? 1 : Math.max(0.1, 1 - weaken);
}

function defenceMultiplier(target: Combatant): number {
  const fortify = statusPotency(target, "fortify");
  const guard = target.statuses.some((status) => status.id === "guard") ? 0.5 : 1;
  const fortified = fortify === undefined ? 1 : Math.max(0.1, 1 - fortify);
  return guard * fortified;
}

function calculateDamage(actor: Combatant, target: Combatant, skill: CombatSkill, variance: number, critical: boolean): number {
  const offense = skill.element === "physical" ? actor.stats.strength : actor.stats.intellect;
  const defense = skill.element === "physical" ? target.stats.vitality : target.stats.wisdom;
  const base = Math.max(1, skill.power + offense * 1.7 - defense * 0.85);
  const resistanceMultiplier = 1 - clampResistance(target.elements[skill.element]);
  return Math.max(1, Math.round(
    base
    * variance
    * resistanceMultiplier
    * defenceMultiplier(target)
    * offenceMultiplier(actor)
    * (critical ? 1.5 : 1)
  ));
}

/**
 * Guard is spent by the hit it absorbs, and damage wakes a sleeping target —
 * the standard genre rule, and what distinguishes sleep from stun and freeze.
 * Without it, sleep is strictly the best turn-denial and the three are
 * mechanically identical.
 */
function applyDamageStatusRules(combatant: Combatant): Combatant {
  return {
    ...combatant,
    statuses: combatant.statuses.filter((status) => status.id !== "guard" && status.id !== "sleep")
  };
}

function addOrRefreshStatus(combatant: Combatant, incoming: StatusInstance): Combatant {
  const withoutExisting = combatant.statuses.filter((status) => status.id !== incoming.id);
  return { ...combatant, statuses: [...withoutExisting, incoming] };
}

function blockingStatus(combatant: Combatant): StatusInstance | undefined {
  return combatant.statuses.find((status) =>
    status.id === "stun" || status.id === "sleep" || status.id === "freeze"
  );
}

function assertValidCombatant(combatant: Combatant): void {
  if (!combatant.id.trim()) {
    throw new Error("Combatant IDs must not be empty");
  }
  if (!Number.isInteger(combatant.hp) || combatant.hp < 0 || combatant.hp > combatant.stats.maxHp) {
    throw new RangeError(`Combatant '${combatant.id}' has invalid HP`);
  }
  if (!Number.isInteger(combatant.mp) || combatant.mp < 0 || combatant.mp > combatant.stats.maxMp) {
    throw new RangeError(`Combatant '${combatant.id}' has invalid MP`);
  }
}

export function createCombatState(party: Combatant[], enemies: Combatant[], seed: string): CombatState {
  if (!seed.trim()) {
    throw new Error("A deterministic combat seed is required");
  }
  if (party.length === 0 || enemies.length === 0) {
    throw new Error("Combat requires at least one combatant on each side");
  }
  const combatants = [...party, ...enemies];
  for (const combatant of combatants) {
    assertValidCombatant(combatant);
  }
  if (new Set(combatants.map((combatant) => combatant.id)).size !== combatants.length) {
    throw new Error("Combatant IDs must be unique across both sides");
  }
  if (!party.some(isAlive) || !enemies.some(isAlive)) {
    throw new Error("Combat requires at least one living combatant on each side");
  }
  return {
    party: party.map(copyCombatant),
    enemies: enemies.map(copyCombatant),
    rng: createRng(seed),
    round: 1,
    outcome: "ongoing"
  };
}

/**
 * Effective agility for ordering. haste and slow scale it by their own
 * potency, which is what makes those two statuses worth casting at all —
 * without an order they affect, they would be inert.
 */
function initiativeAgility(combatant: Combatant): number {
  const haste = statusPotency(combatant, "haste") ?? 0;
  const slow = statusPotency(combatant, "slow") ?? 0;
  return combatant.stats.agility * (1 + haste) * Math.max(0.1, 1 - slow);
}

export function getInitiativeOrder(state: CombatState): EntityId[] {
  return [...state.party, ...state.enemies]
    .filter(isAlive)
    .sort((left, right) => initiativeAgility(right) - initiativeAgility(left) || left.id.localeCompare(right.id))
    .map((combatant) => combatant.id);
}

/**
 * An enemy with a known skill uses it once bloodied (at or below 60% HP)
 * instead of only ever basic-attacking, so a boss's own turn becomes a
 * real decision rather than mechanically identical to a trash mob's — while
 * staying fully deterministic (no RNG roll) so the offline campaign
 * simulation and this function's own callers never need a new RNG state.
 * `skills` is optional so existing callers that pass none keep the prior,
 * always-basic-attack behavior exactly.
 */
export function chooseEnemyAction(
  state: CombatState,
  actorId: EntityId,
  skills: Readonly<Record<EntityId, CombatSkill>> = {}
): CombatAction {
  const actor = findCombatant(state, actorId);
  if (!actor || actor.side !== "enemy" || !isAlive(actor.combatant)) {
    throw new Error(`Enemy actor '${actorId}' is unavailable`);
  }
  const targets = state.party.filter(isAlive).sort((left, right) => left.hp - right.hp || left.id.localeCompare(right.id));
  const target = targets[0];
  if (!target) {
    throw new Error("No living party target");
  }
  const bloodied = actor.combatant.hp / actor.combatant.stats.maxHp <= 0.6;
  const knownSkillId = actor.combatant.skills.find((candidate) => skills[candidate]);
  if (bloodied && knownSkillId) {
    return { type: "skill", actorId, targetId: target.id, skillId: knownSkillId };
  }
  return { type: "attack", actorId, targetId: target.id };
}

export function resolveCombatAction(
  currentState: CombatState,
  action: CombatAction,
  skills: Readonly<Record<EntityId, CombatSkill>> = {}
): CombatResolution {
  if (currentState.outcome !== "ongoing") {
    return { state: currentState, events: [] };
  }
  const actorMatch = findCombatant(currentState, action.actorId);
  if (!actorMatch || !isAlive(actorMatch.combatant)) {
    throw new Error(`Combat actor '${action.actorId}' is unavailable`);
  }

  const blocked = blockingStatus(actorMatch.combatant);
  if (blocked) {
    return {
      state: currentState,
      events: [{ type: "incapacitated", actorId: action.actorId, status: blocked.id }]
    };
  }

  if (action.type === "guard") {
    const guarded = addOrRefreshStatus(actorMatch.combatant, { id: "guard", remainingTurns: 1, potency: 0.5 });
    return {
      state: withCombatant(currentState, actorMatch.side, actorMatch.index, guarded),
      events: [{ type: "guard", actorId: action.actorId }]
    };
  }

  const skillId = action.type === "attack" ? BASIC_ATTACK.id : action.skillId;
  const skill = action.type === "attack" ? BASIC_ATTACK : skills[skillId];
  if (!skill) {
    throw new Error(`Unknown combat skill '${skillId}'`);
  }
  if (action.type === "skill" && !actorMatch.combatant.skills.includes(skill.id)) {
    throw new Error(`Combat actor '${action.actorId}' does not know skill '${skill.id}'`);
  }
  if (actorMatch.combatant.mp < skill.mpCost) {
    return {
      state: currentState,
      events: [{ type: "insufficient_mp", actorId: action.actorId, skillId: skill.id }]
    };
  }

  const targetMatch = findCombatant(currentState, action.targetId);
  if (!targetMatch || !isAlive(targetMatch.combatant)) {
    throw new Error(`Combat target '${action.targetId}' is unavailable`);
  }
  const hasSameSide = actorMatch.side === targetMatch.side;
  if ((skill.target === "ally" && !hasSameSide) || (skill.target === "enemy" && hasSameSide)) {
    throw new Error(`Invalid target '${action.targetId}' for '${skill.id}'`);
  }
  if (skill.target === "self" && action.actorId !== action.targetId) {
    throw new Error(`Skill '${skill.id}' must target its actor`);
  }

  let state = withCombatant(currentState, actorMatch.side, actorMatch.index, {
    ...actorMatch.combatant,
    mp: actorMatch.combatant.mp - skill.mpCost
  });
  // Self-targeted forms (all healing) never miss against their own actor;
  // evasion only applies when striking a genuinely separate combatant.
  const evasion = skill.target === "self" ? 0 : targetMatch.combatant.stats.agility * 0.002;
  const hitRoll = randomChance(state.rng, skill.accuracy + actorMatch.combatant.stats.dexterity * 0.002 - evasion);
  state = { ...state, rng: hitRoll.rng };
  if (!hitRoll.value) {
    return { state, events: [{ type: "miss", actorId: action.actorId, targetId: action.targetId }] };
  }

  const criticalRoll = randomChance(state.rng, Math.min(0.35, 0.05 + actorMatch.combatant.stats.dexterity * 0.003));
  const varianceRoll = nextRandom(criticalRoll.rng);
  state = { ...state, rng: varianceRoll.rng };
  if (skill.healing) {
    const amount = Math.max(
      1,
      Math.round((skill.power + actorMatch.combatant.stats.wisdom * 1.5) * (0.95 + varianceRoll.value * 0.1))
    );
    const healed = {
      ...targetMatch.combatant,
      hp: Math.min(targetMatch.combatant.stats.maxHp, targetMatch.combatant.hp + amount)
    };
    return {
      state: withCombatant(state, targetMatch.side, targetMatch.index, healed),
      events: [{
        type: "healing",
        actorId: action.actorId,
        targetId: action.targetId,
        amount: healed.hp - targetMatch.combatant.hp
      }]
    };
  }
  const damage = calculateDamage(actorMatch.combatant, targetMatch.combatant, skill, 0.9 + varianceRoll.value * 0.2, criticalRoll.value);
  let target = applyDamageStatusRules({
    ...targetMatch.combatant,
    hp: Math.max(0, targetMatch.combatant.hp - damage)
  });
  const events: CombatEvent[] = [{
    type: "damage",
    actorId: action.actorId,
    targetId: action.targetId,
    amount: damage,
    element: skill.element,
    critical: criticalRoll.value
  }];

  if (target.hp > 0 && skill.status) {
    // Resistance reduces the chance, it does not gate it. A boss with 0.5 stun
    // resistance is meaningfully harder to lock down without the player's
    // status build becoming useless; 1 is full immunity.
    const resistance = Math.max(0, Math.min(1, target.statusResistance?.[skill.status.id] ?? 0));
    const effectiveChance = skill.status.chance * (1 - resistance);
    const statusRoll = randomChance(state.rng, effectiveChance);
    state = { ...state, rng: statusRoll.rng };
    if (statusRoll.value) {
      target = addOrRefreshStatus(target, {
        id: skill.status.id,
        remainingTurns: Math.max(1, skill.status.turns),
        potency: Math.max(0, skill.status.potency)
      });
      events.push({ type: "status_applied", targetId: target.id, status: skill.status.id });
    }
  }

  state = withCombatant(state, targetMatch.side, targetMatch.index, target);
  const outcome = resolveOutcome(state);
  state = { ...state, outcome };
  if (outcome !== "ongoing") {
    events.push({ type: "battle_ended", outcome });
  }
  return { state, events };
}

export function advanceCombatRound(currentState: CombatState): CombatResolution {
  if (currentState.outcome !== "ongoing") {
    return { state: currentState, events: [] };
  }
  const events: CombatEvent[] = [];
  const advance = (combatant: Combatant): Combatant => {
    if (!isAlive(combatant)) {
      return combatant;
    }
    let hp = combatant.hp;
    const statuses: StatusInstance[] = [];
    for (const status of combatant.statuses) {
      if (status.id === "poison" || status.id === "burn" || status.id === "bleed") {
        const amount = Math.max(1, Math.round(status.potency));
        hp = Math.max(0, hp - amount);
        events.push({ type: "status_damage", targetId: combatant.id, status: status.id, amount });
      }
      const remainingTurns = status.remainingTurns - 1;
      if (remainingTurns > 0 && hp > 0) {
        statuses.push({ ...status, remainingTurns });
      } else {
        events.push({ type: "status_expired", targetId: combatant.id, status: status.id });
      }
    }
    return { ...combatant, hp, statuses };
  };

  let state: CombatState = {
    ...currentState,
    party: currentState.party.map(advance),
    enemies: currentState.enemies.map(advance),
    round: currentState.round + 1
  };
  const outcome = resolveOutcome(state);
  state = { ...state, outcome };
  if (outcome !== "ongoing") {
    events.push({ type: "battle_ended", outcome });
  }
  return { state, events };
}

const REWARD_MULTIPLIERS: Record<RewardTier, number> = {
  minor: 0.6,
  standard: 1,
  major: 1.8,
  boss: 3.5
};

/**
 * Enemy vitality by level, shared by the integration layer and the offline
 * campaign simulation so a balance change cannot land in one and not the other.
 * The simulation previously carried its own copy of the boss curve.
 *
 * Boss numbers are set so a party of four at the boss's own level needs roughly
 * eight to twelve rounds. At the previous 150 + 12/level a boss died in about
 * two rounds, which meant the authored multi-phase choreography — thresholds at
 * 60%, 50%, 45% and 25% health — was almost never reached.
 */
export const ENEMY_HEALTH_CURVE = {
  trash: { base: 30, perLevel: 7 },
  /** Per attacker, so a boss lasts a comparable number of rounds at any party size. */
  boss: { base: 150, perLevel: 26 }
} as const;

/**
 * `attackers` scales a boss's health with the number of characters hitting it.
 * A lone hero and a party of four otherwise experience completely different
 * fights: the same health pool falls four times faster, which is why a boss
 * facing a full party died in about two rounds and skipped straight past its
 * authored phase thresholds.
 *
 * This is the mirror of the action-economy scaling applied to enemy groups —
 * there, many enemies each hit softer; here, one enemy absorbs proportionally
 * more. Trash health is untouched, since a group already scales by count.
 */
export function enemyMaxHealth(level: number, bossTier: boolean, attackers = 1): number {
  const curve = bossTier ? ENEMY_HEALTH_CURVE.boss : ENEMY_HEALTH_CURVE.trash;
  const scale = bossTier ? Math.max(1, attackers) : 1;
  return Math.max(1, Math.round((curve.base + Math.max(1, level) * curve.perLevel) * scale));
}

/**
 * Experience must grow with the square of the level because the level curve
 * does: `totalExperienceForLevel` is 50*L*(L-1), so each level costs about
 * 100*L more than the last. A purely linear reward therefore falls further
 * behind at every level by construction — a completionist finished the
 * campaign around level 16 against an authored final band of 14-22, having
 * done everything the game offers.
 *
 * The quadratic term is deliberately small (1 per level squared): it closes
 * the gap without making late content trivial, and it moves rewards rather
 * than the curve. Changing `totalExperienceForLevel` would silently change
 * what the `experience` value in every existing save means.
 */
export function calculateBattleReward(tier: RewardTier, averageEnemyLevel: number, seed: string): BattleReward {
  const level = Math.max(1, Math.floor(averageEnemyLevel));
  const multiplier = REWARD_MULTIPLIERS[tier];
  let rng = createRng(`${seed}:${tier}:${level}`);
  const currencyVariance = randomInt(rng, 90, 110);
  rng = currencyVariance.rng;
  const itemRoll = randomInt(rng, 0, 999);
  return {
    experience: Math.round((30 + level * 18 + level * level) * multiplier),
    currency: Math.round((12 + level * 7) * multiplier * currencyVariance.value / 100),
    itemRoll: itemRoll.value
  };
}
