import type { CombatSkill } from "../engine/combat";
import type { Element } from "../shared/types";

/**
 * The authored combat vocabulary: every practiced form, every enemy signature,
 * every per-species elemental identity.
 *
 * This lived inside `EngineGameBridge.ts` for the whole project — authored
 * numbers in the integration layer, against AGENTS.md's rule that content is
 * data. Worse, `tools/campaign-simulation.ts` carried its own hand-copied
 * subset with a "must mirror" comment, so the balance gate could validate
 * numbers the game did not use. One table, two consumers, no mirror.
 */
export const COMBAT_SKILLS: readonly CombatSkill[] = [
  { id: "skill.guard-line", name: "Guard Line", element: "physical", power: 28, accuracy: 0.98, mpCost: 3, target: "enemy", status: { id: "stun", chance: 0.2, turns: 1, potency: 0 } },
  { id: "skill.shield-bash", name: "Shield Bash", element: "physical", power: 40, accuracy: 0.88, mpCost: 5, target: "enemy", status: { id: "stun", chance: 0.3, turns: 1, potency: 0 } },
  { id: "skill.aimed-shot", name: "Aimed Shot", element: "physical", power: 44, accuracy: 0.96, mpCost: 4, target: "enemy" },
  { id: "skill.quickstep", name: "Quickstep Cut", element: "wind", power: 34, accuracy: 0.98, mpCost: 3, target: "enemy", status: { id: "bleed", chance: 0.25, turns: 2, potency: 3 } },
  { id: "skill.mend", name: "Mending Light", element: "radiant", power: 18, accuracy: 1, mpCost: 4, target: "ally", healing: true },
  { id: "skill.ward-thread", name: "Ward Thread", element: "aether", power: 30, accuracy: 1, mpCost: 3, target: "enemy", status: { id: "sleep", chance: 0.2, turns: 1, potency: 0 } },
  { id: "skill.ember-spark", name: "Ember Spark", element: "fire", power: 48, accuracy: 0.9, mpCost: 6, target: "enemy", status: { id: "burn", chance: 0.35, turns: 2, potency: 4 } },
  { id: "skill.tide-pulse", name: "Tide Pulse", element: "water", power: 40, accuracy: 0.94, mpCost: 5, target: "enemy" },
  // The Trickster is advertised as "Debuffs and turn control". Feint weakens
  // what a foe deals; Slow Mark now actually applies `slow` rather than the
  // freeze its name never described.
  { id: "skill.feint", name: "Feint", element: "physical", power: 32, accuracy: 0.99, mpCost: 3, target: "enemy", status: { id: "weaken", chance: 0.45, turns: 3, potency: 0.3 } },
  { id: "skill.slow-mark", name: "Slow Mark", element: "shadow", power: 30, accuracy: 0.96, mpCost: 4, target: "enemy", status: { id: "slow", chance: 0.5, turns: 3, potency: 0.35 } },
  { id: "skill.thorn-bind", name: "Thorn Bind", element: "nature", power: 40, accuracy: 0.93, mpCost: 5, target: "enemy", status: { id: "poison", chance: 0.4, turns: 2, potency: 4 } },
  { id: "skill.rootward", name: "Rootward", element: "earth", power: 34, accuracy: 0.97, mpCost: 4, target: "enemy" },
  // Advanced job branch forms: each is a permanently new skill granted the
  // first time its branch is selected, distinct in element, target, or
  // status from every starting and sibling-branch skill.
  { id: "skill.bastion-slam", name: "Bastion Slam", element: "physical", power: 52, accuracy: 0.85, mpCost: 6, target: "enemy", status: { id: "stun", chance: 0.4, turns: 1, potency: 0 } },
  // The Banneret rallies rather than bleeds: a self-fortify that finally gives
  // the buff half of the buff/debuff set a caster, and distinguishes this
  // branch from the four other bleed-appliers.
  { id: "skill.rallying-strike", name: "Rallying Strike", element: "physical", power: 0, accuracy: 1, mpCost: 4, target: "self", status: { id: "fortify", chance: 1, turns: 3, potency: 0.3 } },
  // The Pathfinder's stride is the fourth buff/debuff caster: haste is the
  // only way a player moves themselves up the initiative order.
  { id: "skill.pathfinders-stride", name: "Pathfinder's Stride", element: "wind", power: 0, accuracy: 1, mpCost: 5, target: "self", status: { id: "haste", chance: 1, turns: 3, potency: 0.4 } },
  { id: "skill.piercing-arrow", name: "Piercing Arrow", element: "physical", power: 56, accuracy: 0.92, mpCost: 6, target: "enemy" },
  { id: "skill.hunting-mark", name: "Hunting Mark", element: "physical", power: 38, accuracy: 0.97, mpCost: 4, target: "enemy", status: { id: "bleed", chance: 0.5, turns: 3, potency: 4 } },
  { id: "skill.greater-mend", name: "Greater Mend", element: "radiant", power: 30, accuracy: 1, mpCost: 7, target: "ally", healing: true },
  { id: "skill.dawnfire-lance", name: "Dawnfire Lance", element: "radiant", power: 46, accuracy: 0.92, mpCost: 5, target: "enemy", status: { id: "burn", chance: 0.4, turns: 2, potency: 5 } },
  { id: "skill.storm-lance", name: "Storm Lance", element: "lightning", power: 52, accuracy: 0.88, mpCost: 7, target: "enemy", status: { id: "stun", chance: 0.35, turns: 1, potency: 0 } },
  // Rethemed from water to ice: it always applied freeze, and Pale Canopy is
  // an entire frost region that had no ice-element form to answer it.
  { id: "skill.deep-resonance", name: "Deep Resonance", element: "ice", power: 22, accuracy: 0.95, mpCost: 6, target: "enemy", status: { id: "freeze", chance: 0.3, turns: 1, potency: 0 } },
  { id: "skill.veil-strike", name: "Veil Strike", element: "shadow", power: 42, accuracy: 0.95, mpCost: 5, target: "enemy", status: { id: "sleep", chance: 0.35, turns: 2, potency: 0 } },
  { id: "skill.wild-gambit", name: "Wild Gambit", element: "physical", power: 64, accuracy: 0.8, mpCost: 6, target: "enemy" },
  { id: "skill.bramble-snare", name: "Bramble Snare", element: "nature", power: 44, accuracy: 0.9, mpCost: 6, target: "enemy", status: { id: "poison", chance: 0.5, turns: 3, potency: 5 } },
  { id: "skill.verdant-bulwark", name: "Verdant Bulwark", element: "nature", power: 22, accuracy: 1, mpCost: 5, target: "ally", healing: true },
  // Recruited companion signature forms: each grants a toolkit their base
  // Ranger/Vanguard/Mender kit otherwise entirely lacks (Tovin's Ranger kit
  // has no freeze; Keva's Vanguard kit has no sustain; Eira's Mender kit has
  // no damage-with-lasting-status), so recruiting them is a mechanically
  // distinct addition, not a stat-identical reskin of a self-made character.
  { id: "skill.marked-quarry", name: "Marked Quarry", element: "wind", power: 42, accuracy: 0.95, mpCost: 5, target: "enemy", status: { id: "freeze", chance: 0.3, turns: 1, potency: 0 } },
  { id: "skill.delvers-grit", name: "Delver's Grit", element: "earth", power: 24, accuracy: 1, mpCost: 5, target: "ally", healing: true },
  { id: "skill.bridgekeepers-warding", name: "Bridgekeeper's Warding", element: "nature", power: 38, accuracy: 0.94, mpCost: 5, target: "enemy", status: { id: "poison", chance: 0.4, turns: 2, potency: 4 } },
  // Boss-exclusive forms: zero MP cost (bosses never spend MP), each
  // matching that boss's own authored phase theme. chooseEnemyAction only
  // reaches for these once bloodied (<=60% HP), so a boss's own turn
  // becomes a genuine decision instead of only ever a basic attack, without
  // requiring any RNG roll or MP-pool bookkeeping.
  // Enemy signature skills sit on the original power scale. The player-side
  // pass that widened the gap between a form and a free attack does not apply
  // here: an enemy has no such choice to make, and doubling these turned a boss
  // into a two-hit kill against a party at its own level.
  { id: "skill.antler-charge", name: "Antler Charge", element: "water", power: 18, accuracy: 0.9, mpCost: 0, target: "enemy", status: { id: "bleed", chance: 0.3, turns: 2, potency: 4 } },
  { id: "skill.crucible-flare", name: "Crucible Flare", element: "fire", power: 20, accuracy: 0.88, mpCost: 0, target: "enemy", status: { id: "burn", chance: 0.35, turns: 2, potency: 5 } },
  { id: "skill.severance-cut", name: "Severance Cut", element: "shadow", power: 22, accuracy: 0.9, mpCost: 0, target: "enemy", status: { id: "bleed", chance: 0.3, turns: 2, potency: 5 } }
];

/** The same catalog keyed by id, which is how nearly every consumer reads it. */
export const SKILLS: Readonly<Record<string, CombatSkill>> = Object.fromEntries(
  COMBAT_SKILLS.map((skill) => [skill.id, skill])
);

/** Boss-exclusive forms matching each boss's own authored phase theme (see bossPhases in campaign.ts). */
export const ENEMY_SKILLS: Readonly<Record<string, readonly string[]>> = {
  "enemy.mire-antler": ["skill.antler-charge"],
  "enemy.kiln-heart": ["skill.crucible-flare"],
  "enemy.varn-rootless": ["skill.severance-cut"],
  // The echo keeps Varn's signature and adds turn denial, so the postgame
  // fight demands the status tools the campaign taught.
  "enemy.varn-echo": ["skill.severance-cut", "skill.deep-resonance"]
};

/**
 * Per-enemy elemental identity. Every enemy previously shared one of two
 * tables, so eleven elements resolved to a single decision the player could
 * never learn or exploit. Positive values resist, negative values are
 * weaknesses.
 *
 * This is also where `ice` earns its place in the element union: WORLD_BIBLE
 * names frost among the practiced forms and Pale Canopy is an entire frost
 * region, but no skill or resistance referenced the element, leaving it
 * declared in two type files and used nowhere.
 */
export const ENEMY_ELEMENTS: Readonly<Record<string, Partial<Record<Element, number>>>> = {
  // Verdant Reach: rain-soaked and root-bound. Fire clears them, nature does not.
  "enemy.briar-wolf": { nature: 0.3, fire: -0.35 },
  "enemy.root-gnawer": { nature: 0.35, fire: -0.3 },
  "enemy.mireling": { water: 0.35, lightning: -0.4 },
  "enemy.mire-antler": { nature: 0.3, fire: -0.25, ice: -0.2 },
  // Cinder March: kiln-born. Fire is their medium; water and ice undo them.
  "enemy.ash-mote": { fire: 0.45, water: -0.4 },
  "enemy.cinder-hound": { fire: 0.4, ice: -0.35 },
  "enemy.cinder-wraith": { fire: 0.35, shadow: 0.2, radiant: -0.4 },
  "enemy.brass-sentinel": { physical: 0.3, lightning: -0.35 },
  "enemy.kiln-heart": { fire: 0.4, water: -0.3, ice: -0.25 },
  // Pale Canopy: frost and starlight. Ice runs off them; fire answers.
  "enemy.rime-stag": { ice: 0.45, fire: -0.4 },
  "enemy.frost-moth": { ice: 0.4, wind: 0.2, fire: -0.45 },
  "enemy.star-echo": { aether: 0.4, shadow: -0.35 },
  "enemy.pale-custodian": { ice: 0.3, aether: 0.25, physical: -0.2 },
  "enemy.varn-rootless": { aether: 0.35, ice: 0.2, radiant: -0.3 },
  "enemy.varn-echo": { aether: 0.5, ice: 0.35, shadow: 0.2, radiant: -0.25 }
};

/**
 * Enemies that use the boss stat curve without being campaign bosses. The
 * post-game superboss is authored `boss: false` so it stays repeatable and so
 * the three-named-boss campaign shape is unchanged, but it must not fight like
 * a trash mob.
 */
export const BOSS_TIER_ENEMY_IDS: ReadonlySet<string> = new Set(["enemy.varn-echo"]);
