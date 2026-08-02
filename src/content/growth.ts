/**
 * Forms learned by levelling, authored as content rather than derived.
 *
 * Before this table a character learned exactly two forms at creation and
 * nothing else for the rest of the campaign unless they took a branch — so
 * twenty levels of growth changed only numbers, and a level-up had nothing to
 * announce. Every entry names a skill that already exists in the combat
 * catalog; nothing here invents a mechanic.
 *
 * Levels are spread across the campaign's three regional bands (1-8, 7-15,
 * 14-22) so each region delivers a new option rather than clustering them all
 * early.
 */
export interface LevelUpSkillGrant {
  readonly jobId: string;
  readonly level: number;
  readonly skillId: string;
}

export const levelUpSkills: readonly LevelUpSkillGrant[] = [
  // Vanguard — holds a line, then learns to break one.
  { jobId: "vanguard", level: 6, skillId: "skill.rallying-strike" },
  { jobId: "vanguard", level: 12, skillId: "skill.bastion-slam" },
  { jobId: "vanguard", level: 18, skillId: "skill.bramble-snare" },

  // Ranger — reach, then precision, then control of the field.
  { jobId: "ranger", level: 6, skillId: "skill.hunting-mark" },
  { jobId: "ranger", level: 12, skillId: "skill.piercing-arrow" },
  { jobId: "ranger", level: 18, skillId: "skill.pathfinders-stride" },

  // Mender — a stronger restore, then an offensive answer of their own.
  { jobId: "mender", level: 6, skillId: "skill.greater-mend" },
  { jobId: "mender", level: 12, skillId: "skill.dawnfire-lance" },
  { jobId: "mender", level: 18, skillId: "skill.verdant-bulwark" },

  // Shaper — widens the elemental palette the job is named for.
  { jobId: "shaper", level: 6, skillId: "skill.deep-resonance" },
  { jobId: "shaper", level: 12, skillId: "skill.storm-lance" },
  { jobId: "shaper", level: 18, skillId: "skill.dawnfire-lance" },

  // Trickster — turn denial, then a gamble worth taking.
  { jobId: "trickster", level: 6, skillId: "skill.veil-strike" },
  { jobId: "trickster", level: 12, skillId: "skill.wild-gambit" },
  { jobId: "trickster", level: 18, skillId: "skill.marked-quarry" },

  // Root Warden — binding first, then the counters the job promises.
  { jobId: "warden", level: 6, skillId: "skill.bramble-snare" },
  { jobId: "warden", level: 12, skillId: "skill.bridgekeepers-warding" },
  { jobId: "warden", level: 18, skillId: "skill.verdant-bulwark" }
];

/**
 * Forms a character of `jobId` should know at `level`, in the order they are
 * learned. Callers pass the base job id: branches inherit their base job's
 * table and add their own signature form separately.
 */
export function levelUpSkillsFor(jobId: string, level: number): string[] {
  return levelUpSkills
    .filter((grant) => grant.jobId === jobId && grant.level <= level)
    .sort((left, right) => left.level - right.level)
    .map((grant) => grant.skillId);
}

/** Forms learned by crossing from `previousLevel` to `newLevel`. */
export function skillsLearnedBetween(jobId: string, previousLevel: number, newLevel: number): string[] {
  return levelUpSkills
    .filter((grant) => grant.jobId === jobId && grant.level > previousLevel && grant.level <= newLevel)
    .sort((left, right) => left.level - right.level)
    .map((grant) => grant.skillId);
}
