import type { EntityId, PlayerCharacter, Stats } from "../shared/types";

export interface JobDefinition {
  readonly id: EntityId;
  readonly name: string;
  readonly prerequisiteJobIds: EntityId[];
  readonly minimumLevel: number;
  readonly requiredSkillIds: EntityId[];
}

export interface ProgressionResult {
  readonly character: PlayerCharacter;
  readonly levelsGained: number;
}

export type JobUnlockBlocker =
  | { readonly type: "minimum_level"; readonly requiredLevel: number; readonly currentLevel: number }
  | { readonly type: "prerequisite_job"; readonly jobId: EntityId }
  | { readonly type: "required_skill"; readonly skillId: EntityId };

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

export function totalExperienceForLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return normalizedLevel <= 1 ? 0 : 50 * normalizedLevel * (normalizedLevel - 1);
}

export function levelForExperience(experience: number): number {
  const xp = Math.max(0, Math.floor(experience));
  let level = 1;
  while (totalExperienceForLevel(level + 1) <= xp) {
    level += 1;
  }
  return level;
}

function growStats(stats: Stats, levels: number): Stats {
  return {
    maxHp: stats.maxHp + STAT_GROWTH.maxHp * levels,
    maxMp: stats.maxMp + STAT_GROWTH.maxMp * levels,
    strength: stats.strength + STAT_GROWTH.strength * levels,
    dexterity: stats.dexterity + STAT_GROWTH.dexterity * levels,
    agility: stats.agility + STAT_GROWTH.agility * levels,
    vitality: stats.vitality + STAT_GROWTH.vitality * levels,
    intellect: stats.intellect + STAT_GROWTH.intellect * levels,
    wisdom: stats.wisdom + STAT_GROWTH.wisdom * levels,
    charisma: stats.charisma + STAT_GROWTH.charisma * levels
  };
}

export function grantExperience(character: PlayerCharacter, amount: number): ProgressionResult {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Experience grant must be a finite non-negative number");
  }
  const experience = character.experience + Math.floor(amount);
  const level = Math.max(character.level, levelForExperience(experience));
  const levelsGained = Math.max(0, level - character.level);
  const stats = growStats(character.stats, levelsGained);
  return {
    character: {
      ...character,
      experience,
      level,
      stats,
      hp: Math.min(stats.maxHp, character.hp + STAT_GROWTH.maxHp * levelsGained),
      mp: Math.min(stats.maxMp, character.mp + STAT_GROWTH.maxMp * levelsGained)
    },
    levelsGained
  };
}

export function canUnlockJob(
  character: PlayerCharacter,
  job: JobDefinition,
  unlockedJobIds: readonly EntityId[]
): boolean {
  return getJobUnlockBlockers(character, job, unlockedJobIds).length === 0;
}

/**
 * Lists every unmet requirement so the UI can explain a branch instead of
 * presenting a generic locked state. The active job is always treated as known.
 */
export function getJobUnlockBlockers(
  character: PlayerCharacter,
  job: JobDefinition,
  unlockedJobIds: readonly EntityId[]
): JobUnlockBlocker[] {
  const knownJobs = new Set([character.jobId, ...unlockedJobIds]);
  const blockers: JobUnlockBlocker[] = [];
  if (character.level < job.minimumLevel) {
    blockers.push({ type: "minimum_level", requiredLevel: job.minimumLevel, currentLevel: character.level });
  }
  for (const prerequisiteJobId of job.prerequisiteJobIds) {
    if (!knownJobs.has(prerequisiteJobId)) {
      blockers.push({ type: "prerequisite_job", jobId: prerequisiteJobId });
    }
  }
  for (const requiredSkillId of job.requiredSkillIds) {
    if (!character.skills.includes(requiredSkillId)) {
      blockers.push({ type: "required_skill", skillId: requiredSkillId });
    }
  }
  return blockers;
}

/** Returns eligible, not-yet-unlocked jobs in the supplied deterministic content order. */
export function listUnlockableJobs(
  character: PlayerCharacter,
  jobs: readonly JobDefinition[],
  unlockedJobIds: readonly EntityId[]
): JobDefinition[] {
  const knownJobs = new Set([character.jobId, ...unlockedJobIds]);
  return jobs.filter((job) => !knownJobs.has(job.id) && canUnlockJob(character, job, unlockedJobIds));
}

/** Adds a job branch to external progression state without changing the active job. */
export function unlockJob(
  character: PlayerCharacter,
  job: JobDefinition,
  unlockedJobIds: readonly EntityId[]
): EntityId[] {
  if (!canUnlockJob(character, job, unlockedJobIds)) {
    throw new Error(`Character '${character.id}' does not meet the requirements for job '${job.id}'`);
  }
  const knownJobs = new Set([character.jobId, ...unlockedJobIds]);
  return knownJobs.has(job.id) ? [...unlockedJobIds] : [...unlockedJobIds, job.id];
}

export function changeJob(character: PlayerCharacter, job: JobDefinition, unlockedJobIds: readonly EntityId[]): PlayerCharacter {
  if (!canUnlockJob(character, job, unlockedJobIds)) {
    throw new Error(`Character '${character.id}' does not meet the requirements for job '${job.id}'`);
  }
  return { ...character, jobId: job.id };
}
