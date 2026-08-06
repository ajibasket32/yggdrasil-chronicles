import { advancedJobs } from "../content";
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
 * Enemy portraits use a small/humanoid/boss silhouette split (creature packs,
 * armed humanoids, named bosses) plus a per-enemy-ID tint so every authored
 * enemy reads as visually distinct rather than one repeated red silhouette.
 */
const ENEMY_SPRITE_KEYS: Readonly<Record<string, string>> = {
  "enemy.briar-wolf": "sprite.enemy.small",
  "enemy.root-gnawer": "sprite.enemy.small",
  "enemy.mireling": "sprite.enemy.small",
  "enemy.ash-mote": "sprite.enemy.small",
  "enemy.cinder-hound": "sprite.enemy.small",
  "enemy.rime-stag": "sprite.enemy.small",
  "enemy.frost-moth": "sprite.enemy.small",
  "enemy.star-echo": "sprite.enemy.small",
  "enemy.cinder-wraith": "sprite.enemy.humanoid",
  "enemy.brass-sentinel": "sprite.enemy.humanoid",
  "enemy.pale-custodian": "sprite.enemy.humanoid",
  "enemy.mire-antler": "sprite.enemy.boss",
  "enemy.kiln-heart": "sprite.enemy.boss",
  "enemy.varn-rootless": "sprite.enemy.boss",
  "enemy.varn-echo": "sprite.enemy.boss"
};

const ENEMY_TINTS: Readonly<Record<string, number>> = {
  "enemy.briar-wolf": 0xb0a08c,
  "enemy.root-gnawer": 0x8a9a6e,
  "enemy.mireling": 0x6f8f7a,
  "enemy.ash-mote": 0xd98c5a,
  "enemy.cinder-hound": 0xb8563f,
  "enemy.rime-stag": 0xb9c8d6,
  "enemy.frost-moth": 0xd8e6ec,
  "enemy.star-echo": 0xb0a2d8,
  "enemy.cinder-wraith": 0x8a5c8c,
  "enemy.brass-sentinel": 0xc9a24a,
  "enemy.pale-custodian": 0x9fb0c2,
  "enemy.mire-antler": 0x6f8f5a,
  "enemy.kiln-heart": 0xd9762f,
  "enemy.varn-rootless": 0x8c3a46,
  "enemy.varn-echo": 0x6f4a86
};

export function spriteForEnemyId(enemyId: string): { spriteKey: string; tint: number } {
  return {
    spriteKey: ENEMY_SPRITE_KEYS[enemyId] ?? "sprite.enemy.small",
    tint: ENEMY_TINTS[enemyId] ?? 0xffffff
  };
}

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
