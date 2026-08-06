import type { Difficulty, GameState } from "../shared/types";

/**
 * Difficulty scaling, as pure numbers.
 *
 * Chosen once at character creation and fixed for the life of the chronicle.
 * These multipliers scale enemy HP/offence and battle rewards without touching
 * `combat.ts`'s formulas: the deterministic engine stays difficulty-agnostic,
 * and the integration layer applies the scale before combat starts and after
 * rewards are computed.
 */
export const DIFFICULTY_ENEMY_MULTIPLIER: Readonly<Record<Difficulty, number>> = {
  easy: 0.8,
  normal: 1,
  hard: 1.25
};

export const DIFFICULTY_REWARD_MULTIPLIER: Readonly<Record<Difficulty, number>> = {
  easy: 0.85,
  normal: 1,
  hard: 1.2
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

/** Reads the persisted choice out of world flags, defaulting rather than trusting. */
export function difficultyOf(state: GameState): Difficulty {
  const value = state.world.flags.difficulty;
  return isDifficulty(value) ? value : "normal";
}

/**
 * Every combatant acts once per round, so a lone hero facing three enemies
 * takes three times the incoming actions while dealing one. Authored encounter
 * levels exposed this: `flooded-grove` (3 enemies) was unwinnable at its own
 * level while `mossroad-foragers` (2 enemies) was comfortable.
 *
 * Scaling each enemy's offence by the action ratio makes a group's TOTAL output
 * track the party's, so an encounter's difficulty comes from its authored level
 * rather than from how many bodies it fields. Health is untouched — a group
 * should still take longer to clear. Solo encounters (every boss) are
 * unaffected at ratio 1.
 */
export function actionEconomyScale(enemyCount: number, partySize: number): number {
  if (enemyCount <= partySize) return 1;
  // Square root, not the raw ratio: full normalisation would make a mob of six
  // feel like a single enemy, which removes the pressure a group should create.
  return Math.sqrt(Math.max(1, partySize) / enemyCount);
}
