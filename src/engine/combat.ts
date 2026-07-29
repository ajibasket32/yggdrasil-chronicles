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

function calculateDamage(actor: Combatant, target: Combatant, skill: CombatSkill, variance: number, critical: boolean): number {
  const offense = skill.element === "physical" ? actor.stats.strength : actor.stats.intellect;
  const defense = skill.element === "physical" ? target.stats.vitality : target.stats.wisdom;
  const base = Math.max(1, skill.power + offense * 1.7 - defense * 0.85);
  const resistanceMultiplier = 1 - clampResistance(target.elements[skill.element]);
  const guardMultiplier = target.statuses.some((status) => status.id === "guard") ? 0.5 : 1;
  return Math.max(1, Math.round(base * variance * resistanceMultiplier * guardMultiplier * (critical ? 1.5 : 1)));
}

function removeGuard(combatant: Combatant): Combatant {
  return { ...combatant, statuses: combatant.statuses.filter((status) => status.id !== "guard") };
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

export function getInitiativeOrder(state: CombatState): EntityId[] {
  return [...state.party, ...state.enemies]
    .filter(isAlive)
    .sort((left, right) => right.stats.agility - left.stats.agility || left.id.localeCompare(right.id))
    .map((combatant) => combatant.id);
}

export function chooseEnemyAction(state: CombatState, actorId: EntityId): CombatAction {
  const actor = findCombatant(state, actorId);
  if (!actor || actor.side !== "enemy" || !isAlive(actor.combatant)) {
    throw new Error(`Enemy actor '${actorId}' is unavailable`);
  }
  const targets = state.party.filter(isAlive).sort((left, right) => left.hp - right.hp || left.id.localeCompare(right.id));
  const target = targets[0];
  if (!target) {
    throw new Error("No living party target");
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
  const hitRoll = randomChance(state.rng, skill.accuracy + actorMatch.combatant.stats.dexterity * 0.002);
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
  let target = removeGuard({
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
    const statusRoll = randomChance(state.rng, skill.status.chance);
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

export function calculateBattleReward(tier: RewardTier, averageEnemyLevel: number, seed: string): BattleReward {
  const level = Math.max(1, Math.floor(averageEnemyLevel));
  const multiplier = REWARD_MULTIPLIERS[tier];
  let rng = createRng(`${seed}:${tier}:${level}`);
  const currencyVariance = randomInt(rng, 90, 110);
  rng = currencyVariance.rng;
  const itemRoll = randomInt(rng, 0, 999);
  return {
    experience: Math.round((30 + level * 18) * multiplier),
    currency: Math.round((12 + level * 7) * multiplier * currencyVariance.value / 100),
    itemRoll: itemRoll.value
  };
}
