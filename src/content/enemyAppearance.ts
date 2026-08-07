/**
 * How each authored enemy looks: a silhouette sheet and a species tint.
 *
 * Same pattern as `portraits.ts` — appearance is content data keyed by id, so
 * both the battle scene and the world's encounter marker draw from one table.
 * The world marker previously used a generated red placeholder blob, which
 * read as a missing sprite standing where a monster should be.
 */
export interface EnemyAppearance {
  readonly spriteKey: string;
  readonly tint: number;
}

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

export function spriteForEnemyId(enemyId: string): EnemyAppearance {
  return {
    spriteKey: ENEMY_SPRITE_KEYS[enemyId] ?? "sprite.enemy.small",
    tint: ENEMY_TINTS[enemyId] ?? 0xffffff
  };
}

/** Ids the table answers for explicitly, so validation can prove no enemy falls to the default. */
export function knownEnemyAppearanceIds(): readonly string[] {
  return Object.keys(ENEMY_SPRITE_KEYS);
}
