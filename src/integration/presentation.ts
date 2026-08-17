import { advancedJobs } from "../content";
// Re-exported so the bridge keeps one import site for appearance lookups.
export { spriteForEnemyId } from "../content";
import type { StatusId } from "../shared/types";
import type { GameSaveSlot } from "../game";

/**
 * Pure display lookups: sprite keys, tints, and player-facing labels. No
 * state, no rules — the strings and colours the presentation layer asks the
 * bridge for, kept out of the bridge so the bridge is about state.
 */

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Resolves an advanced branch to the base job whose sprite and level-up table it shares. */
export function baseJobIdFor(jobId: string): string {
  return advancedJobs.find((job) => job.id === jobId)?.baseJobId ?? jobId;
}

/** Battle portrait per starting job family, preloaded in BootScene. Advanced branches share their base job's sprite. */
const JOB_SPRITE_KEYS: Readonly<Record<string, string>> = {
  vanguard: "sprite.job.vanguard",
  ranger: "sprite.job.ranger",
  mender: "sprite.job.mender",
  shaper: "sprite.job.shaper",
  trickster: "sprite.job.trickster",
  warden: "sprite.job.warden"
};

export function spriteKeyForJob(jobId: string): string {
  return JOB_SPRITE_KEYS[baseJobIdFor(jobId)] ?? "sprite.player";
}

/** Distinct per-ancestry tint so party members sharing a job sprite still read as different characters. */
export const ANCESTRY_TINTS: Readonly<Record<string, number>> = {
  hearthborn: 0xffffff,
  sylvan: 0x9ad6a0,
  stonekin: 0xc2a878,
  wayfarer: 0xe8c992
};

/**
 * Player-facing status names. The game previously never explained what any
 * status did, so a freeze and a stun were indistinguishable to the player.
 */
export const STATUS_LABELS: Readonly<Record<StatusId, string>> = {
  guard: "Guarding — incoming harm reduced",
  poison: "Poisoned — losing vitality each round",
  burn: "Burning — losing vitality each round",
  bleed: "Bleeding — losing vitality each round",
  stun: "Stunned — cannot act",
  sleep: "Asleep — cannot act",
  freeze: "Frozen — cannot act",
  weaken: "Weakened — dealing less harm",
  fortify: "Fortified — taking less harm",
  haste: "Hastened — acting sooner",
  slow: "Slowed — acting later"
};

/**
 * Adjectives for the battle log, where the descriptions above cannot be
 * inlined: "Rowan is afflicted by Fortified — taking less harm" is not a
 * sentence. The log previously printed the raw status id instead, so the player
 * read "is afflicted by fortify" for a buff they had just chosen to cast.
 */
const STATUS_ADJECTIVES: Readonly<Record<StatusId, string>> = {
  guard: "guarding",
  poison: "poisoned",
  burn: "burning",
  bleed: "bleeding",
  stun: "stunned",
  sleep: "asleep",
  freeze: "frozen",
  weaken: "weakened",
  fortify: "fortified",
  haste: "hastened",
  slow: "slowed"
};

/** The nouns the recurring-damage statuses are named by. */
const STATUS_NOUNS: Readonly<Partial<Record<StatusId, string>>> = {
  poison: "poison",
  burn: "burning",
  bleed: "bleeding"
};

export function statusAdjective(status: StatusId): string {
  return STATUS_ADJECTIVES[status] ?? status;
}

export function statusNoun(status: StatusId): string {
  return STATUS_NOUNS[status] ?? statusAdjective(status);
}

const SLOT_LABELS: Readonly<Record<GameSaveSlot, string>> = {
  autosave: "Autosave",
  quick: "Quick Save",
  "manual-1": "Manual Slot 1",
  "manual-2": "Manual Slot 2",
  "manual-3": "Manual Slot 3"
};

export function slotLabel(slot: GameSaveSlot): string {
  return SLOT_LABELS[slot];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
