import { BOSS_TIER_ENEMY_IDS, ENEMY_ELEMENTS, ENEMY_SKILLS } from "../content";
import { DIFFICULTY_ENEMY_MULTIPLIER, enemyMaxHealth, targetingProfileForStats } from "../engine";
import type { Combatant, Difficulty } from "../shared/types";
import { titleCase } from "./presentation";

/**
 * Assembles an authored enemy id into a battle-ready combatant: the boss/trash
 * health curve, difficulty and action-economy scaling, signature skills and
 * elemental identity, all read from content and engine tables rather than
 * decided here.
 */
export function enemyCombatant(
  id: string,
  index: number,
  boss: boolean,
  level: number,
  difficulty: Difficulty,
  economyScale = 1,
  attackers = 1
): Combatant {
  const scale = DIFFICULTY_ENEMY_MULTIPLIER[difficulty];
  const offenceScale = scale * economyScale;
  const bossTier = boss || BOSS_TIER_ENEMY_IDS.has(id);
  const maxHp = Math.max(1, Math.round(enemyMaxHealth(level, bossTier, attackers) * scale));
  // Taken from the authored shape, before scaling touches it. Difficulty and
  // action-economy move strength and intellect but not agility, so a scaled-down
  // group would otherwise read as fast-and-weak and hunt the frailest character
  // — a behavioural change nobody asked for when tuning a number.
  const targetingProfile = targetingProfileForStats(7 + level * 2, 4 + level, 6 + level);
  return {
    id: `${id}.${index}`,
    name: id.replace("enemy.", "").split("-").map(titleCase).join(" "),
    level,
    stats: {
      maxHp,
      maxMp: 0,
      strength: Math.max(1, Math.round((7 + level * 2) * offenceScale)),
      dexterity: 7 + level,
      agility: 6 + level,
      vitality: 6 + level,
      intellect: Math.max(1, Math.round((4 + level) * offenceScale)),
      wisdom: 5 + level,
      charisma: 1
    },
    hp: maxHp,
    mp: 0,
    skills: [...(ENEMY_SKILLS[id] ?? [])],
    elements: ENEMY_ELEMENTS[id] ?? (boss ? { nature: 0.2, fire: -0.2 } : { nature: -0.1 }),
    statuses: [],
    // Bosses resist turn denial. Without this, a party alternating two 40%
    // stuns silences a boss for most of its own fight and the authored phase
    // choreography never plays. Halving the chance keeps a status build
    // worthwhile without letting it replace the fight.
    statusResistance: bossTier ? { stun: 0.5, sleep: 0.5, freeze: 0.5 } : undefined,
    targetingProfile,
    isPlayerControlled: false
  };
}

/** Strips a combat instance suffix like ".0"/".1" back to the authored enemy content ID. */
export function enemyContentId(instanceId: string): string {
  const lastDot = instanceId.lastIndexOf(".");
  return lastDot === -1 ? instanceId : instanceId.slice(0, lastDot);
}
