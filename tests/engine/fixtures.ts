import type { Combatant, PlayerCharacter, Stats } from "../../src/shared/types";

export const baseStats: Stats = {
  maxHp: 100,
  maxMp: 30,
  strength: 12,
  dexterity: 10,
  agility: 9,
  vitality: 8,
  intellect: 7,
  wisdom: 7,
  charisma: 6
};

export function makeCombatant(
  id: string,
  overrides: Partial<Combatant> = {}
): Combatant {
  return {
    id,
    name: id,
    level: 1,
    stats: { ...baseStats },
    hp: baseStats.maxHp,
    mp: baseStats.maxMp,
    skills: [],
    elements: {},
    statuses: [],
    isPlayerControlled: id.startsWith("hero"),
    ...overrides
  };
}

export function makePlayerCharacter(id = "hero-one"): PlayerCharacter {
  return {
    ...makeCombatant(id, { isPlayerControlled: true }),
    raceId: "race-emberkin",
    jobId: "job-vanguard",
    experience: 0,
    equipment: {}
  };
}

