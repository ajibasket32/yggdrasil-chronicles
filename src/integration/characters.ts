import {
  advancedJobs,
  items,
  levelUpSkillsFor,
  npcs,
  SKILLS,
  startingBuildLoadouts,
  type RecruitProfile
} from "../content";
import {
  createEquipmentCatalog,
  equipItem,
  grantExperience,
  totalExperienceForLevel
} from "../engine";
import type { CharacterCreationDraft } from "../game";
import type { EquipmentBand, PlayerCharacter, Stats } from "../shared/types";
import { baseJobIdFor } from "./presentation";

/**
 * Character assembly: how an ancestry, a calling and a loadout become a
 * playable character, and how job changes revise one. Derivation only — the
 * authored inputs (loadouts, affinities, item stats) live in content.
 */

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

/**
 * Flat stat deltas applied on top of the base job's stats while a character
 * follows an advanced branch. Reversible: selectJob subtracts the previous
 * job's delta before adding the next one, so switching branches never
 * compounds bonuses. Base starting jobs have no entry (their stats are
 * already baked in by statsForBuild at character creation).
 */
const ADVANCED_JOB_STATS: Readonly<Record<string, Partial<Stats>>> = {
  bulwark: { maxHp: 10, vitality: 2 },
  banneret: { strength: 3, charisma: 2 },
  pathfinder: { dexterity: 3, agility: 2 },
  beastwarden: { strength: 2, dexterity: 3 },
  lifebinder: { maxMp: 8, wisdom: 3 },
  dawnkeeper: { wisdom: 2, intellect: 2 },
  stormcaller: { intellect: 4, maxMp: 4 },
  resonant: { intellect: 2, wisdom: 2, maxMp: 4 },
  veilhand: { dexterity: 2, agility: 3 },
  gambler: { strength: 2, dexterity: 2 },
  thornspeaker: { wisdom: 2, vitality: 2 },
  "green-sentinel": { maxHp: 8, wisdom: 2 }
};

export function jobStatDelta(jobId: string): Partial<Stats> {
  return ADVANCED_JOB_STATS[jobId] ?? {};
}

/**
 * Removes the character's current job stat delta and applies nextJobId's,
 * preserving the current HP/MP deficit. Must be called with the character's
 * still-current jobId (before it is switched) so the old delta is subtracted
 * correctly; the returned character has jobId already set to nextJobId.
 */
export function reviseStatsForJobChange(character: PlayerCharacter, nextJobId: string): PlayerCharacter {
  const previousDelta = jobStatDelta(character.jobId);
  const nextDelta = jobStatDelta(nextJobId);
  const statKeys = Object.keys(character.stats) as (keyof Stats)[];
  const nextStats = Object.fromEntries(statKeys.map((key) => {
    const value = character.stats[key] - (previousDelta[key] ?? 0) + (nextDelta[key] ?? 0);
    return [key, Math.max(key === "maxHp" ? 1 : 0, value)];
  })) as unknown as Stats;
  return {
    ...character,
    jobId: nextJobId,
    stats: nextStats,
    hp: Math.min(nextStats.maxHp, character.hp + Math.max(0, nextStats.maxHp - character.stats.maxHp)),
    mp: Math.min(nextStats.maxMp, character.mp + Math.max(0, nextStats.maxMp - character.stats.maxMp))
  };
}

/**
 * Two bands only. Per-job restriction on a catalog this size would make half
 * of it unwearable by any given character; martial/caster expresses the
 * identity difference the gear is actually authored around. Branch ids resolve
 * to their base job, so this never needs to enumerate the twelve branches.
 */
const BAND_BASE_JOB_IDS: Readonly<Record<EquipmentBand, readonly string[]>> = {
  martial: ["vanguard", "ranger"],
  caster: ["mender", "shaper", "trickster", "warden"]
};

function jobIdsForBands(bands: readonly EquipmentBand[]): string[] {
  const baseIds = new Set(bands.flatMap((band) => BAND_BASE_JOB_IDS[band]));
  // Branch ids must be listed explicitly: the engine compares against the
  // character's current jobId, which is the branch once one is chosen.
  return [
    ...baseIds,
    ...advancedJobs.filter((job) => baseIds.has(job.baseJobId)).map((job) => job.id)
  ];
}

/**
 * Built from the authored item catalog rather than re-declared here. The
 * previous shape duplicated nine items: name, description and price lived in
 * content while stats lived in this file, so rebalancing gear in content
 * changed its price and silently nothing else.
 */
export const EQUIPMENT = createEquipmentCatalog(
  items.flatMap((item) => {
    if (item.kind !== "weapon" && item.kind !== "armor" && item.kind !== "accessory") return [];
    return [{
      ...item,
      kind: item.kind,
      statModifiers: item.modifiers ?? {},
      minimumLevel: item.requiredLevel,
      allowedJobIds: item.allowedBands === undefined ? undefined : jobIdsForBands(item.allowedBands)
    }];
  })
);

const ANCESTRY_STATS: Readonly<Record<string, Partial<Stats>>> = {
  hearthborn: { maxHp: 4, charisma: 2 },
  sylvan: { maxMp: 8, intellect: 2, wisdom: 1 },
  stonekin: { maxHp: 12, vitality: 3, agility: -2 },
  wayfarer: { dexterity: 2, agility: 2, charisma: 1 }
};

const JOB_STATS: Readonly<Record<string, Partial<Stats>>> = {
  vanguard: { maxHp: 12, strength: 2, vitality: 3 },
  ranger: { dexterity: 3, agility: 3, vitality: -1 },
  mender: { maxMp: 10, intellect: 1, wisdom: 4 },
  shaper: { maxMp: 14, intellect: 4, vitality: -2 },
  trickster: { maxMp: 5, dexterity: 3, agility: 2 },
  warden: { maxHp: 6, maxMp: 7, vitality: 1, wisdom: 3 }
};

export function statsForBuild(ancestryId: string, jobId: string): Stats {
  const ancestry = ANCESTRY_STATS[ancestryId] ?? {};
  const job = JOB_STATS[jobId] ?? {};
  return Object.fromEntries(
    Object.entries(BASE_STATS).map(([key, value]) => [
      key,
      Math.max(key === "maxHp" ? 1 : 0, value + (ancestry[key as keyof Stats] ?? 0) + (job[key as keyof Stats] ?? 0))
    ])
  ) as unknown as Stats;
}

export function equipStartingItems(character: PlayerCharacter, startingItems: readonly string[]): PlayerCharacter {
  return startingItems.reduce((current, itemId) => {
    const equipment = EQUIPMENT[itemId];
    return equipment ? equipItem(current, equipment) : current;
  }, character);
}

export function isEquipmentItem(itemId: string): boolean {
  return EQUIPMENT[itemId] !== undefined;
}

export function createPartyCharacter(options: {
  id: string;
  name: string;
  ancestryId: string;
  jobId: string;
  skills: readonly string[];
  startingItems: readonly string[];
}): PlayerCharacter {
  const stats = statsForBuild(options.ancestryId, options.jobId);
  const character: PlayerCharacter = {
    id: options.id,
    name: options.name,
    raceId: options.ancestryId,
    jobId: options.jobId,
    experience: 0,
    level: 1,
    stats,
    hp: stats.maxHp,
    mp: stats.maxMp,
    skills: [...options.skills],
    // Authored per build in campaign.ts rather than decided here: an ancestry's
    // elemental identity is content, and the build preview has to be able to
    // state it before the player commits.
    elements: { ...(startingBuildLoadouts.find(({ ancestryId }) => ancestryId === options.ancestryId)?.elementalAffinities ?? {}) },
    statuses: [],
    isPlayerControlled: true,
    equipment: {}
  };
  return equipStartingItems(character, options.startingItems);
}

export function playerFromDraft(draft: CharacterCreationDraft): PlayerCharacter {
  const loadout = startingBuildLoadouts.find(
    (candidate) => candidate.ancestryId === draft.ancestryId && candidate.jobId === draft.jobId
  );
  if (!loadout) throw new Error(`Unknown starting build '${draft.ancestryId}/${draft.jobId}'`);
  return createPartyCharacter({
    id: "party.protagonist",
    name: draft.name.trim() || "Rowan",
    ancestryId: draft.ancestryId,
    jobId: draft.jobId,
    skills: loadout.startingSkills,
    startingItems: loadout.startingItems
  });
}

/**
 * `joinLevel` brings a companion in at the party's own standing rather than at
 * level 1. A recruit who joined a level-9 party arrived nine levels behind,
 * could not survive the content they were recruited into, and diluted the
 * party's experience share — so recruiting was a penalty.
 *
 * Levels are granted through `grantExperience` so stats grow with them:
 * writing `level` directly leaves level-1 numbers behind, because `growStats`
 * only runs on levels actually gained.
 */
export function recruitCharacter(profile: RecruitProfile, joinLevel = 1): PlayerCharacter {
  const npc = npcs.find(({ id }) => id === profile.npcId);
  const base = createPartyCharacter({
    id: profile.id.replace("recruit.", "party."),
    name: npc?.name.split(" ")[0] ?? profile.id,
    ancestryId: profile.ancestryId,
    jobId: profile.jobId,
    skills: profile.startingSkills,
    startingItems: profile.startingItems
  });
  if (joinLevel <= 1) return base;

  const grown = grantExperience(base, totalExperienceForLevel(joinLevel)).character;
  const taught = levelUpSkillsFor(baseJobIdFor(grown.jobId), grown.level)
    .filter((skillId) => SKILLS[skillId] && !grown.skills.includes(skillId));
  return taught.length > 0 ? { ...grown, skills: [...grown.skills, ...taught] } : grown;
}
