import {
  auditCampaignReadiness,
  bossPhases,
  coreCampaign,
  encounterAvailability,
  encounterFinds,
  locationEncounters,
  locationFinds,
  recruitProfiles,
  startingBuildLoadouts,
  worldRoutes
} from "../src/content";
import {
  advanceCombatRound,
  chooseEnemyAction,
  createCombatState,
  resolveCombatAction,
  type CombatAction,
  type CombatSkill,
  type CombatState
} from "../src/engine";
import type { Combatant, Element, Stats } from "../src/shared/types";

/**
 * Offline release gate for authored campaign viability.
 *
 * The game bridge intentionally owns the runtime-only enemy factory and battle
 * presentation. This tool stays at the public pure-engine boundary, using a
 * small, explicit mirror of its published combat tuning so it can run in Node
 * without IndexedDB, Phaser, or network access. Update the calibration below
 * whenever EngineGameBridge's combat constants change.
 */

const BOSS_SEEDS = [
  "campaign-viability-amber",
  "campaign-viability-birch",
  "campaign-viability-cinder",
  "campaign-viability-dawn",
  "campaign-viability-ember",
  "campaign-viability-frost",
  "campaign-viability-grove",
  "campaign-viability-hollow"
] as const;

const STAT_GROWTH: Stats = {
  maxHp: 8,
  maxMp: 3,
  strength: 2,
  dexterity: 1,
  agility: 1,
  vitality: 2,
  intellect: 1,
  wisdom: 1,
  charisma: 1
};

const SKILLS: Readonly<Record<string, CombatSkill>> = {
  "skill.guard-line": { id: "skill.guard-line", name: "Guard Line", element: "physical", power: 14, accuracy: 0.98, mpCost: 3, target: "enemy", status: { id: "stun", chance: 0.2, turns: 1, potency: 0 } },
  "skill.shield-bash": { id: "skill.shield-bash", name: "Shield Bash", element: "physical", power: 20, accuracy: 0.88, mpCost: 5, target: "enemy", status: { id: "stun", chance: 0.3, turns: 1, potency: 0 } },
  "skill.aimed-shot": { id: "skill.aimed-shot", name: "Aimed Shot", element: "physical", power: 22, accuracy: 0.96, mpCost: 4, target: "enemy" },
  "skill.quickstep": { id: "skill.quickstep", name: "Quickstep Cut", element: "wind", power: 17, accuracy: 0.98, mpCost: 3, target: "enemy", status: { id: "bleed", chance: 0.25, turns: 2, potency: 3 } },
  "skill.mend": { id: "skill.mend", name: "Mending Light", element: "radiant", power: 18, accuracy: 1, mpCost: 4, target: "self", healing: true },
  "skill.ward-thread": { id: "skill.ward-thread", name: "Ward Thread", element: "aether", power: 15, accuracy: 1, mpCost: 3, target: "enemy", status: { id: "sleep", chance: 0.2, turns: 1, potency: 0 } },
  "skill.ember-spark": { id: "skill.ember-spark", name: "Ember Spark", element: "fire", power: 24, accuracy: 0.9, mpCost: 6, target: "enemy", status: { id: "burn", chance: 0.35, turns: 2, potency: 4 } },
  "skill.tide-pulse": { id: "skill.tide-pulse", name: "Tide Pulse", element: "water", power: 20, accuracy: 0.94, mpCost: 5, target: "enemy" },
  "skill.marked-quarry": { id: "skill.marked-quarry", name: "Marked Quarry", element: "wind", power: 21, accuracy: 0.95, mpCost: 5, target: "enemy", status: { id: "freeze", chance: 0.3, turns: 1, potency: 0 } },
  "skill.delvers-grit": { id: "skill.delvers-grit", name: "Delver's Grit", element: "earth", power: 24, accuracy: 1, mpCost: 5, target: "self", healing: true },
  "skill.bridgekeepers-warding": { id: "skill.bridgekeepers-warding", name: "Bridgekeeper's Warding", element: "nature", power: 19, accuracy: 0.94, mpCost: 5, target: "enemy", status: { id: "poison", chance: 0.4, turns: 2, potency: 4 } },
  "skill.antler-charge": { id: "skill.antler-charge", name: "Antler Charge", element: "water", power: 18, accuracy: 0.9, mpCost: 0, target: "enemy", status: { id: "bleed", chance: 0.3, turns: 2, potency: 4 } },
  "skill.crucible-flare": { id: "skill.crucible-flare", name: "Crucible Flare", element: "fire", power: 20, accuracy: 0.88, mpCost: 0, target: "enemy", status: { id: "burn", chance: 0.35, turns: 2, potency: 5 } },
  "skill.severance-cut": { id: "skill.severance-cut", name: "Severance Cut", element: "shadow", power: 22, accuracy: 0.9, mpCost: 0, target: "enemy", status: { id: "bleed", chance: 0.3, turns: 2, potency: 5 } }
};

const BASE_STATS: Stats = {
  maxHp: 72,
  maxMp: 28,
  strength: 11,
  dexterity: 9,
  agility: 9,
  vitality: 11,
  intellect: 8,
  wisdom: 9,
  charisma: 8
};

const COMBAT_PROFILE = "EngineGameBridge combat tuning v0.1.0";

interface PartyBlueprint {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly stats: Partial<Stats>;
  readonly skills: readonly string[];
  readonly elements: Partial<Record<Element, number>>;
}

interface BossScenario {
  readonly encounterId: string;
  readonly description: string;
  readonly party: readonly PartyBlueprint[];
}

/**
 * These are campaign-valid roster members: the chosen Shaper protagonist plus
 * Tovin (Ranger), Keva (Vanguard), and Eira (Mender). Levels are conservative
 * checkpoints, not a claim about campaign duration or an assumed XP route.
 */
const BOSS_SCENARIOS: readonly BossScenario[] = [
  {
    encounterId: "encounter.mire-antler",
    description: "Level 4 Sylvan Shaper with recruited Wayfarer Ranger",
    party: [
      { id: "party.protagonist", name: "Rowan", level: 4, stats: { maxMp: 22, intellect: 6, wisdom: 1 }, skills: ["skill.ember-spark", "skill.tide-pulse"], elements: { nature: -0.2, fire: 0.15 } },
      { id: "party.tovin-ash", name: "Tovin", level: 4, stats: { dexterity: 5, agility: 5, vitality: -1, strength: 3 }, skills: ["skill.aimed-shot", "skill.quickstep", "skill.marked-quarry"], elements: { wind: -0.1 } }
    ]
  },
  {
    encounterId: "encounter.kiln-heart",
    description: "Level 7 Shaper, Ranger, and Vanguard expedition",
    party: [
      { id: "party.protagonist", name: "Rowan", level: 7, stats: { maxMp: 22, intellect: 6, wisdom: 1 }, skills: ["skill.ember-spark", "skill.tide-pulse"], elements: { nature: -0.2, fire: 0.15 } },
      { id: "party.tovin-ash", name: "Tovin", level: 7, stats: { dexterity: 5, agility: 5, vitality: -1, strength: 3 }, skills: ["skill.aimed-shot", "skill.quickstep", "skill.marked-quarry"], elements: { wind: -0.1 } },
      { id: "party.keva-dross", name: "Keva", level: 7, stats: { maxHp: 24, vitality: 6, agility: -2, strength: 2 }, skills: ["skill.guard-line", "skill.shield-bash", "skill.delvers-grit"], elements: { earth: -0.2, lightning: 0.1 } }
    ]
  },
  {
    encounterId: "encounter.varn-rootless",
    description: "Level 8 full party after optional companion recruitment",
    party: [
      { id: "party.protagonist", name: "Rowan", level: 8, stats: { maxMp: 22, intellect: 6, wisdom: 1 }, skills: ["skill.ember-spark", "skill.tide-pulse"], elements: { nature: -0.2, fire: 0.15 } },
      { id: "party.tovin-ash", name: "Tovin", level: 8, stats: { dexterity: 5, agility: 5, vitality: -1, strength: 3 }, skills: ["skill.aimed-shot", "skill.quickstep", "skill.marked-quarry"], elements: { wind: -0.1 } },
      { id: "party.keva-dross", name: "Keva", level: 8, stats: { maxHp: 24, vitality: 6, agility: -2, strength: 2 }, skills: ["skill.guard-line", "skill.shield-bash", "skill.delvers-grit"], elements: { earth: -0.2, lightning: 0.1 } },
      { id: "party.eira-lune", name: "Eira", level: 8, stats: { maxMp: 18, intellect: 3, wisdom: 5 }, skills: ["skill.mend", "skill.ward-thread", "skill.bridgekeepers-warding"], elements: { nature: -0.2, fire: 0.15 } }
    ]
  }
];

export interface BossSimulationResult {
  readonly encounterId: string;
  readonly strategy: string;
  readonly wins: number;
  readonly attempts: number;
  readonly failedSeeds: readonly string[];
  readonly longestBattleRounds: number;
  readonly activatedPhases: readonly string[];
}

export interface CampaignSimulationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly combatProfile: string;
  readonly completedMainQuestIds: readonly string[];
  readonly authoredQuestCount: number;
  readonly bossResults: readonly BossSimulationResult[];
}

function grownStats(level: number, adjustment: Partial<Stats>): Stats {
  const levelsGained = Math.max(0, level - 1);
  return Object.fromEntries(
    Object.entries(BASE_STATS).map(([key, base]) => {
      const stat = key as keyof Stats;
      return [stat, base + (adjustment[stat] ?? 0) + STAT_GROWTH[stat] * levelsGained];
    })
  ) as Stats;
}

function createPartyCombatant(blueprint: PartyBlueprint): Combatant {
  const stats = grownStats(blueprint.level, blueprint.stats);
  return {
    id: blueprint.id,
    name: blueprint.name,
    level: blueprint.level,
    stats,
    hp: stats.maxHp,
    mp: stats.maxMp,
    skills: [...blueprint.skills],
    elements: { ...blueprint.elements },
    statuses: [],
    isPlayerControlled: true
  };
}

/** Must mirror ENEMY_SKILLS in src/integration/EngineGameBridge.ts exactly. */
const ENEMY_SKILLS: Readonly<Record<string, readonly string[]>> = {
  "enemy.mire-antler": ["skill.antler-charge"],
  "enemy.kiln-heart": ["skill.crucible-flare"],
  "enemy.varn-rootless": ["skill.severance-cut"]
};

function createBossCombatant(enemyId: string, level: number): Combatant {
  const maxHp = 150 + level * 12;
  return {
    id: `${enemyId}.0`,
    name: enemyId.replace("enemy.", "").replaceAll("-", " "),
    level,
    stats: {
      maxHp,
      maxMp: 0,
      strength: 7 + level * 2,
      dexterity: 7 + level,
      agility: 6 + level,
      vitality: 6 + level,
      intellect: 4 + level,
      wisdom: 5 + level,
      charisma: 1
    },
    hp: maxHp,
    mp: 0,
    skills: [...(ENEMY_SKILLS[enemyId] ?? [])],
    elements: { nature: 0.2, fire: -0.2 },
    statuses: [],
    isPlayerControlled: false
  };
}

function firstLivingEnemy(state: CombatState): Combatant | undefined {
  return state.enemies.find((enemy) => enemy.hp > 0);
}

function shouldMend(actor: Combatant): boolean {
  return actor.skills.includes("skill.mend")
    && actor.mp >= (SKILLS["skill.mend"]?.mpCost ?? Number.POSITIVE_INFINITY)
    && actor.hp / actor.stats.maxHp <= 0.55;
}

/** A simple deterministic AI approximation: mend when low, else the first affordable offensive form, else attack. */
function choosePartyAction(state: CombatState, actor: Combatant): CombatAction {
  const target = firstLivingEnemy(state);
  if (!target) throw new Error("No living enemy for party action");
  if (shouldMend(actor)) {
    return { type: "skill", actorId: actor.id, targetId: actor.id, skillId: "skill.mend" };
  }
  const skillId = actor.skills.find((candidate) => {
    const skill = SKILLS[candidate];
    return skill?.target === "enemy" && actor.mp >= skill.mpCost;
  });
  return skillId
    ? { type: "skill", actorId: actor.id, targetId: target.id, skillId }
    : { type: "attack", actorId: actor.id, targetId: target.id };
}

function applyBossPhases(
  encounterId: string,
  currentState: CombatState,
  activated: string[]
): CombatState {
  if (currentState.outcome !== "ongoing") return currentState;
  let state = currentState;
  const candidates = bossPhases
    .filter((phase) => phase.encounterId === encounterId && !activated.includes(phase.phaseName))
    .sort((left, right) => right.beginsAtHealthPercent - left.beginsAtHealthPercent);
  for (const phase of candidates) {
    const enemyIndex = state.enemies.findIndex(({ id }) => id.startsWith(`${phase.enemyId}.`));
    const enemy = state.enemies[enemyIndex];
    if (!enemy || enemy.hp <= 0 || enemy.hp / enemy.stats.maxHp * 100 > phase.beginsAtHealthPercent) continue;
    let empowered: Combatant = {
      ...enemy,
      stats: { ...enemy.stats },
      elements: { ...enemy.elements },
      statuses: enemy.statuses.map((status) => ({ ...status }))
    };
    let party = state.party;
    if (phase.mechanic === "empower") {
      empowered.stats.strength += 3;
      empowered.stats.agility += 2;
      empowered.stats.intellect += 3;
    } else if (phase.mechanic === "fortify") {
      empowered.stats.vitality += 4;
      empowered.stats.wisdom += 4;
    } else if (phase.mechanic === "root_party") {
      party = party.map((member) => member.hp > 0
        ? { ...member, statuses: [...member.statuses.filter(({ id }) => id !== "freeze"), { id: "freeze", remainingTurns: 2, potency: 0 }] }
        : member);
    } else if (phase.mechanic === "scorch_party") {
      party = party.map((member) => member.hp > 0
        ? { ...member, statuses: [...member.statuses.filter(({ id }) => id !== "burn"), { id: "burn", remainingTurns: 2, potency: 4 }] }
        : member);
    } else if (phase.mechanic === "restore_boss") {
      empowered = { ...empowered, hp: Math.min(empowered.stats.maxHp, empowered.hp + Math.round(empowered.stats.maxHp * 0.15)) };
    } else if (phase.mechanic === "elemental_shift") {
      empowered.elements = { ...empowered.elements, nature: 0.4, fire: 0.4, aether: -0.25 };
    }
    state = { ...state, party, enemies: state.enemies.map((candidate, index) => index === enemyIndex ? empowered : candidate) };
    activated.push(phase.phaseName);
  }
  return state;
}

function simulateBossAttempt(scenario: BossScenario, seed: string): { outcome: "victory" | "defeat" | "timeout"; rounds: number; phases: string[] } {
  const encounter = coreCampaign.encounters.find(({ id }) => id === scenario.encounterId);
  if (!encounter?.boss || encounter.enemyIds.length !== 1) {
    throw new Error(`${scenario.encounterId} must be a single-enemy boss encounter`);
  }
  const party = scenario.party.map(createPartyCombatant);
  const averageLevel = Math.max(1, Math.round(party.reduce((total, member) => total + member.level, 0) / party.length));
  let state = createCombatState(party, [createBossCombatant(encounter.enemyIds[0]!, averageLevel)], seed);
  const activated: string[] = [];
  state = applyBossPhases(scenario.encounterId, state, activated);

  for (let round = 1; round <= 80 && state.outcome === "ongoing"; round += 1) {
    // Presentation grants each living party member one action before the enemy phase.
    for (const actorId of state.party.map(({ id }) => id)) {
      const actor = state.party.find(({ id }) => id === actorId);
      if (!actor || actor.hp <= 0 || state.outcome !== "ongoing") continue;
      state = resolveCombatAction(state, choosePartyAction(state, actor), SKILLS).state;
      state = applyBossPhases(scenario.encounterId, state, activated);
    }
    for (const enemyId of state.enemies.filter(({ hp }) => hp > 0).map(({ id }) => id)) {
      if (state.outcome !== "ongoing") break;
      state = resolveCombatAction(state, chooseEnemyAction(state, enemyId, SKILLS), SKILLS).state;
    }
    if (state.outcome === "ongoing") state = advanceCombatRound(state).state;
    if (state.outcome !== "ongoing") return { outcome: state.outcome, rounds: round, phases: activated };
  }
  return { outcome: state.outcome === "victory" || state.outcome === "defeat" ? state.outcome : "timeout", rounds: state.round, phases: activated };
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Ensures the simulated roster cannot silently drift away from authored builds. */
function validateScenarioRoster(scenario: BossScenario): string[] {
  const errors: string[] = [];
  const protagonist = scenario.party.find(({ id }) => id === "party.protagonist");
  const shaperLoadout = startingBuildLoadouts.find(({ ancestryId, jobId }) => ancestryId === "sylvan" && jobId === "shaper");
  if (!protagonist || !shaperLoadout || !sameValues(protagonist.skills, shaperLoadout.startingSkills)) {
    errors.push(`${scenario.encounterId} does not use the authored Sylvan Shaper protagonist loadout`);
  }
  for (const member of scenario.party.filter(({ id }) => id !== "party.protagonist")) {
    const profile = recruitProfiles.find(({ id }) => id.replace("recruit.", "party.") === member.id);
    if (!profile || !sameValues(member.skills, profile.startingSkills)) {
      errors.push(`${scenario.encounterId} uses an unauthored recruit loadout for ${member.id}`);
      continue;
    }
    if (!coreCampaign.quests.some(({ id }) => id === profile.recruitmentQuestId)) {
      errors.push(`${scenario.encounterId} recruit ${member.id} has no authored recruitment quest`);
    }
  }
  return errors;
}

export function simulateCampaignViability(): CampaignSimulationResult {
  const readiness = auditCampaignReadiness(coreCampaign, {
    startLocationId: "location.hearthcross",
    routes: worldRoutes,
    locationEncounters,
    locationFinds,
    encounterFinds,
    encounterAvailability
  });
  const errors = [...readiness.errors];
  const expectedBossIds = coreCampaign.encounters.filter(({ boss }) => boss).map(({ id }) => id);
  const scenarioBossIds = BOSS_SCENARIOS.map(({ encounterId }) => encounterId);
  for (const bossId of expectedBossIds) {
    if (!scenarioBossIds.includes(bossId)) errors.push(`Boss ${bossId} has no viability scenario`);
  }
  for (const scenario of BOSS_SCENARIOS) errors.push(...validateScenarioRoster(scenario));
  const bossResults = BOSS_SCENARIOS.map((scenario): BossSimulationResult => {
    const attempts = BOSS_SEEDS.map((seed) => ({ seed, result: simulateBossAttempt(scenario, `${scenario.encounterId}:${seed}`) }));
    const failedSeeds = attempts.filter(({ result }) => result.outcome !== "victory").map(({ seed }) => seed);
    const activatedPhases = [...new Set(attempts.flatMap(({ result }) => result.phases))];
    const requiredPhases = bossPhases.filter(({ encounterId }) => encounterId === scenario.encounterId).map(({ phaseName }) => phaseName);
    const missingPhases = requiredPhases.filter((phase) => !activatedPhases.includes(phase));
    if (failedSeeds.length > 0) errors.push(`${scenario.encounterId} fails deterministic seeds: ${failedSeeds.join(", ")}`);
    if (missingPhases.length > 0) errors.push(`${scenario.encounterId} did not activate phases: ${missingPhases.join(", ")}`);
    return {
      encounterId: scenario.encounterId,
      strategy: scenario.description,
      wins: attempts.length - failedSeeds.length,
      attempts: attempts.length,
      failedSeeds,
      longestBattleRounds: Math.max(...attempts.map(({ result }) => result.rounds)),
      activatedPhases
    };
  });
  return {
    valid: errors.length === 0,
    errors,
    combatProfile: COMBAT_PROFILE,
    completedMainQuestIds: readiness.completedMainQuestIds,
    authoredQuestCount: readiness.completedQuestIds.length,
    bossResults
  };
}

function printResult(result: CampaignSimulationResult): void {
  console.log(`Campaign simulation (${result.combatProfile})`);
  console.log(`Authored quests walked: ${result.authoredQuestCount}; main quests walked: ${result.completedMainQuestIds.length}.`);
  for (const boss of result.bossResults) {
    console.log(`${boss.encounterId}: ${boss.wins}/${boss.attempts} victories; longest ${boss.longestBattleRounds} rounds; phases ${boss.activatedPhases.join(" → ")}.`);
  }
  if (!result.valid) {
    for (const error of result.errors) console.error(`error: ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/campaign-simulation.ts")) {
  printResult(simulateCampaignViability());
}
