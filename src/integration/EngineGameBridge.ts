import {
  addItem,
  adjustFactionStanding,
  advanceCombatRound,
  applyQuestConsequences,
  applyQuestObjective,
  calculateBattleReward,
  chooseEnemyAction,
  createCombatState,
  createEquipmentCatalog,
  createInitialGameState,
  deriveCharacterCombatStats,
  equipItem,
  failQuest,
  getInitiativeOrder,
  grantExperience,
  inventoryQuantity,
  refreshQuestAvailability,
  removeItem,
  resolveCombatAction,
  startQuest,
  type CombatEvent,
  type CombatSkill,
  type CombatState
} from "../engine";
import { applyGeneratedPatch, NarrativeCheckpointQueue } from "../ai";
import {
  encounterFinds,
  encounters,
  bossPhases,
  advancedJobs,
  ancestries,
  getDialogue,
  items,
  jobs,
  locationFinds,
  locations,
  npcs,
  quests,
  recruitProfiles,
  startingBuildLoadouts,
  vendorProfiles,
  type RecruitProfile
} from "../content";
import type {
  BattleAction,
  BattleView,
  CharacterCreationDraft,
  Difficulty,
  GameCommandResult,
  GameBridge,
  GameSaveSlot,
  GameSnapshot,
  InteractionView,
  PartyMemberView,
  BattleEventView,
  BattleStatusView,
  QuestView,
  SaveSlotSummaryView,
  ShopEntryView,
  ShopView,
  SnapshotListener
} from "../game";
import { SaveRepository, type SaveSlot } from "../save";
import type {
  Combatant,
  Element,
  EncounterDefinition,
  EquipmentBand,
  GameState,
  NarrativeContext,
  PlayerCharacter,
  QuestDefinition,
  Stats,
  StatusId,
  StatusInstance
} from "../shared/types";

const STARTING_LOCATION = "location.hearthcross";
const CORE_PACK_VERSION = "0.1.0";
const FIRST_QUEST = "quest.first-silence";
const CONCORD_QUEST = "quest.a-new-concord";
const CONCORD_FINAL_NPC = "npc.sable-voss";

/**
 * Each ending has a genuine trade-off, not just a single faction gain: the
 * opposedFactionId is the faction whose interests that future structurally
 * closes off, per WORLD_BIBLE.md's faction descriptions. epilogue is a
 * fourth chronicle line shown only in the journal/ending screen, naming a
 * concrete systemic consequence beyond the faction-standing numbers.
 */
const CONCORD_CHOICES = [
  {
    id: "ending.concord-remade",
    label: "Restore the Concord",
    description: "Bind the factions to a renewed shared covenant.",
    factionId: "faction.rootwardens",
    opposedFactionId: "faction.freebound",
    title: "THE CONCORD REMADE",
    resolution: "The old promise is rewritten with mortal voices at its center.",
    body: "The severed roads sing again—not as they once did, but in the voices of those who chose to mend them.",
    epilogue: "The Freebound Companies lose their independent routes to the renewed covenant's shared law; some comply, more scatter to the unmapped edges."
  },
  {
    id: "ending.rootways-freed",
    label: "Free the Rootways",
    description: "End central rule and let every region govern its own memories.",
    factionId: "faction.freebound",
    opposedFactionId: "faction.rootwardens",
    title: "THE ROOTWAYS FREED",
    resolution: "No single covenant owns the roads now; each settlement carries its own truth and risk.",
    body: "The rootways open without a throne above them. Their songs disagree, overlap, and finally belong to the people who travel them.",
    epilogue: "The Rootwardens' mandate to protect every living rootway ends with the central authority that enforced it; some roots go unwatched."
  },
  {
    id: "ending.lantern-covenant",
    label: "Entrust the Archive",
    description: "Create a transparent covenant of witnesses and public records.",
    factionId: "faction.lantern-archive",
    opposedFactionId: "faction.quiet-choir",
    title: "THE LANTERN COVENANT",
    resolution: "The Archive accepts stewardship under laws that make every hidden revision visible.",
    body: "Lanterns burn beside every living record. Memory has keepers again, but never again an unseen hand.",
    epilogue: "The Quiet Choir's belief that the tree must forget finds no shelter under public record; its remaining voices go quieter still, or go underground."
  }
] as const;

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

const COMBAT_SKILLS: readonly CombatSkill[] = [
  { id: "skill.guard-line", name: "Guard Line", element: "physical", power: 14, accuracy: 0.98, mpCost: 3, target: "enemy", status: { id: "stun", chance: 0.2, turns: 1, potency: 0 } },
  { id: "skill.shield-bash", name: "Shield Bash", element: "physical", power: 20, accuracy: 0.88, mpCost: 5, target: "enemy", status: { id: "stun", chance: 0.3, turns: 1, potency: 0 } },
  { id: "skill.aimed-shot", name: "Aimed Shot", element: "physical", power: 22, accuracy: 0.96, mpCost: 4, target: "enemy" },
  { id: "skill.quickstep", name: "Quickstep Cut", element: "wind", power: 17, accuracy: 0.98, mpCost: 3, target: "enemy", status: { id: "bleed", chance: 0.25, turns: 2, potency: 3 } },
  { id: "skill.mend", name: "Mending Light", element: "radiant", power: 18, accuracy: 1, mpCost: 4, target: "ally", healing: true },
  { id: "skill.ward-thread", name: "Ward Thread", element: "aether", power: 15, accuracy: 1, mpCost: 3, target: "enemy", status: { id: "sleep", chance: 0.2, turns: 1, potency: 0 } },
  { id: "skill.ember-spark", name: "Ember Spark", element: "fire", power: 24, accuracy: 0.9, mpCost: 6, target: "enemy", status: { id: "burn", chance: 0.35, turns: 2, potency: 4 } },
  { id: "skill.tide-pulse", name: "Tide Pulse", element: "water", power: 20, accuracy: 0.94, mpCost: 5, target: "enemy" },
  // The Trickster is advertised as "Debuffs and turn control". Feint weakens
  // what a foe deals; Slow Mark now actually applies `slow` rather than the
  // freeze its name never described.
  { id: "skill.feint", name: "Feint", element: "physical", power: 16, accuracy: 0.99, mpCost: 3, target: "enemy", status: { id: "weaken", chance: 0.45, turns: 3, potency: 0.3 } },
  { id: "skill.slow-mark", name: "Slow Mark", element: "shadow", power: 15, accuracy: 0.96, mpCost: 4, target: "enemy", status: { id: "slow", chance: 0.5, turns: 3, potency: 0.35 } },
  { id: "skill.thorn-bind", name: "Thorn Bind", element: "nature", power: 20, accuracy: 0.93, mpCost: 5, target: "enemy", status: { id: "poison", chance: 0.4, turns: 2, potency: 4 } },
  { id: "skill.rootward", name: "Rootward", element: "earth", power: 17, accuracy: 0.97, mpCost: 4, target: "enemy" },
  // Advanced job branch forms: each is a permanently new skill granted the
  // first time its branch is selected, distinct in element, target, or
  // status from every starting and sibling-branch skill.
  { id: "skill.bastion-slam", name: "Bastion Slam", element: "physical", power: 26, accuracy: 0.85, mpCost: 6, target: "enemy", status: { id: "stun", chance: 0.4, turns: 1, potency: 0 } },
  // The Banneret rallies rather than bleeds: a self-fortify that finally gives
  // the buff half of the buff/debuff set a caster, and distinguishes this
  // branch from the four other bleed-appliers.
  { id: "skill.rallying-strike", name: "Rallying Strike", element: "physical", power: 0, accuracy: 1, mpCost: 4, target: "self", status: { id: "fortify", chance: 1, turns: 3, potency: 0.3 } },
  // The Pathfinder's stride is the fourth buff/debuff caster: haste is the
  // only way a player moves themselves up the initiative order.
  { id: "skill.pathfinders-stride", name: "Pathfinder's Stride", element: "wind", power: 0, accuracy: 1, mpCost: 5, target: "self", status: { id: "haste", chance: 1, turns: 3, potency: 0.4 } },
  { id: "skill.piercing-arrow", name: "Piercing Arrow", element: "physical", power: 28, accuracy: 0.92, mpCost: 6, target: "enemy" },
  { id: "skill.hunting-mark", name: "Hunting Mark", element: "physical", power: 19, accuracy: 0.97, mpCost: 4, target: "enemy", status: { id: "bleed", chance: 0.5, turns: 3, potency: 4 } },
  { id: "skill.greater-mend", name: "Greater Mend", element: "radiant", power: 30, accuracy: 1, mpCost: 7, target: "ally", healing: true },
  { id: "skill.dawnfire-lance", name: "Dawnfire Lance", element: "radiant", power: 23, accuracy: 0.92, mpCost: 5, target: "enemy", status: { id: "burn", chance: 0.4, turns: 2, potency: 5 } },
  { id: "skill.storm-lance", name: "Storm Lance", element: "lightning", power: 26, accuracy: 0.88, mpCost: 7, target: "enemy", status: { id: "stun", chance: 0.35, turns: 1, potency: 0 } },
  // Rethemed from water to ice: it always applied freeze, and Pale Canopy is
  // an entire frost region that had no ice-element form to answer it.
  { id: "skill.deep-resonance", name: "Deep Resonance", element: "ice", power: 22, accuracy: 0.95, mpCost: 6, target: "enemy", status: { id: "freeze", chance: 0.3, turns: 1, potency: 0 } },
  { id: "skill.veil-strike", name: "Veil Strike", element: "shadow", power: 21, accuracy: 0.95, mpCost: 5, target: "enemy", status: { id: "sleep", chance: 0.35, turns: 2, potency: 0 } },
  { id: "skill.wild-gambit", name: "Wild Gambit", element: "physical", power: 32, accuracy: 0.8, mpCost: 6, target: "enemy" },
  { id: "skill.bramble-snare", name: "Bramble Snare", element: "nature", power: 22, accuracy: 0.9, mpCost: 6, target: "enemy", status: { id: "poison", chance: 0.5, turns: 3, potency: 5 } },
  { id: "skill.verdant-bulwark", name: "Verdant Bulwark", element: "nature", power: 22, accuracy: 1, mpCost: 5, target: "ally", healing: true },
  // Recruited companion signature forms: each grants a toolkit their base
  // Ranger/Vanguard/Mender kit otherwise entirely lacks (Tovin's Ranger kit
  // has no freeze; Keva's Vanguard kit has no sustain; Eira's Mender kit has
  // no damage-with-lasting-status), so recruiting them is a mechanically
  // distinct addition, not a stat-identical reskin of a self-made character.
  { id: "skill.marked-quarry", name: "Marked Quarry", element: "wind", power: 21, accuracy: 0.95, mpCost: 5, target: "enemy", status: { id: "freeze", chance: 0.3, turns: 1, potency: 0 } },
  { id: "skill.delvers-grit", name: "Delver's Grit", element: "earth", power: 24, accuracy: 1, mpCost: 5, target: "ally", healing: true },
  { id: "skill.bridgekeepers-warding", name: "Bridgekeeper's Warding", element: "nature", power: 19, accuracy: 0.94, mpCost: 5, target: "enemy", status: { id: "poison", chance: 0.4, turns: 2, potency: 4 } },
  // Boss-exclusive forms: zero MP cost (bosses never spend MP), each
  // matching that boss's own authored phase theme. chooseEnemyAction only
  // reaches for these once bloodied (<=60% HP), so a boss's own turn
  // becomes a genuine decision instead of only ever a basic attack, without
  // requiring any RNG roll or MP-pool bookkeeping.
  { id: "skill.antler-charge", name: "Antler Charge", element: "water", power: 18, accuracy: 0.9, mpCost: 0, target: "enemy", status: { id: "bleed", chance: 0.3, turns: 2, potency: 4 } },
  { id: "skill.crucible-flare", name: "Crucible Flare", element: "fire", power: 20, accuracy: 0.88, mpCost: 0, target: "enemy", status: { id: "burn", chance: 0.35, turns: 2, potency: 5 } },
  { id: "skill.severance-cut", name: "Severance Cut", element: "shadow", power: 22, accuracy: 0.9, mpCost: 0, target: "enemy", status: { id: "bleed", chance: 0.3, turns: 2, potency: 5 } }
];

const SKILLS: Readonly<Record<string, CombatSkill>> = Object.fromEntries(
  COMBAT_SKILLS.map((skill) => [skill.id, skill])
);

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

function jobStatDelta(jobId: string): Partial<Stats> {
  return ADVANCED_JOB_STATS[jobId] ?? {};
}

/**
 * Removes the character's current job stat delta and applies nextJobId's,
 * preserving the current HP/MP deficit. Must be called with the character's
 * still-current jobId (before it is switched) so the old delta is subtracted
 * correctly; the returned character has jobId already set to nextJobId.
 */
function reviseStatsForJobChange(character: PlayerCharacter, nextJobId: string): PlayerCharacter {
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
const EQUIPMENT = createEquipmentCatalog(
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

const RECOVERY_ITEMS: Readonly<Record<string, Readonly<{ hp: number; mp: number }>>> = {
  "item.vesleaf": { hp: 18, mp: 0 },
  "item.root-tonic": { hp: 42, mp: 0 },
  "item.aether-drop": { hp: 0, mp: 18 },
  "item.frost-resin": { hp: 24, mp: 8 },
  "item.cold-ember": { hp: 10, mp: 16 }
};

/**
 * Statuses this item clears from one target in battle. The only counter-play
 * to boss phases that inflict party-wide freeze/burn (root_party/scorch_party,
 * see bossPhases) — otherwise those statuses can only be waited out.
 */
const STATUS_CURE_ITEMS: Readonly<Record<string, readonly StatusInstance["id"][]>> = {
  "item.ash-spice": ["stun", "sleep", "freeze", "poison", "burn", "bleed"]
};

function commandFailure(message: string): GameCommandResult {
  return { success: false, message };
}

function jobUnlockFlag(memberId: string, jobId: string): string {
  return `progression.job.${memberId}.${jobId}`;
}

function baseJobIdFor(jobId: string): string {
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

function spriteKeyForJob(jobId: string): string {
  return JOB_SPRITE_KEYS[baseJobIdFor(jobId)] ?? "sprite.player";
}

/** Distinct per-ancestry tint so party members sharing a job sprite still read as different characters. */
const ANCESTRY_TINTS: Readonly<Record<string, number>> = {
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
  "enemy.varn-rootless": "sprite.enemy.boss"
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
  "enemy.varn-rootless": 0x8c3a46
};

function spriteForEnemyId(enemyId: string): { spriteKey: string; tint: number } {
  return {
    spriteKey: ENEMY_SPRITE_KEYS[enemyId] ?? "sprite.enemy.small",
    tint: ENEMY_TINTS[enemyId] ?? 0xffffff
  };
}

/** Strips a combat instance suffix like ".0"/".1" back to the authored enemy content ID. */
function enemyContentId(instanceId: string): string {
  const lastDot = instanceId.lastIndexOf(".");
  return lastDot === -1 ? instanceId : instanceId.slice(0, lastDot);
}

function reorderSignatureSkill(skills: readonly string[], signatureSkillId: string): string[] {
  return skills.includes(signatureSkillId)
    ? [signatureSkillId, ...skills.filter((skillId) => skillId !== signatureSkillId)]
    : [...skills];
}

/** Grants a branch's bonus form the first time it is learned; never duplicates it. */
function withBonusSkill(skills: readonly string[], bonusSkillId: string): string[] {
  return skills.includes(bonusSkillId) ? [...skills] : [...skills, bonusSkillId];
}

interface ActiveBattle {
  encounterId: string;
  state: CombatState;
  phase: BattleView["phase"];
  log: string[];
  /** Index of the party member whose player turn is awaiting an action. */
  partyTurnIndex: number;
  activatedBossPhases: string[];
  /** Engine events from the most recent action, projected onto the view for animation. */
  events: CombatEvent[];
  /**
   * Last enemy the player aimed at. Remembered across turns and cleared when
   * that enemy dies, so a repeat attack in a multi-enemy fight costs no
   * keypresses — the genre convention.
   */
  lastTargetId?: string;
}

function statsForBuild(ancestryId: string, jobId: string): Stats {
  const ancestry = ANCESTRY_STATS[ancestryId] ?? {};
  const job = JOB_STATS[jobId] ?? {};
  return Object.fromEntries(
    Object.entries(BASE_STATS).map(([key, value]) => [
      key,
      Math.max(key === "maxHp" ? 1 : 0, value + (ancestry[key as keyof Stats] ?? 0) + (job[key as keyof Stats] ?? 0))
    ])
  ) as unknown as Stats;
}

function equipStartingItems(character: PlayerCharacter, startingItems: readonly string[]): PlayerCharacter {
  return startingItems.reduce((current, itemId) => {
    const equipment = EQUIPMENT[itemId];
    return equipment ? equipItem(current, equipment) : current;
  }, character);
}

function isEquipmentItem(itemId: string): boolean {
  return EQUIPMENT[itemId] !== undefined;
}

function createPartyCharacter(options: {
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
    elements: options.ancestryId === "sylvan"
      ? { nature: -0.2, fire: 0.15 }
      : options.ancestryId === "stonekin"
        ? { earth: -0.2, lightning: 0.1 }
        : options.ancestryId === "wayfarer"
          ? { wind: -0.1 }
          : { aether: -0.1 },
    statuses: [],
    isPlayerControlled: true,
    equipment: {}
  };
  return equipStartingItems(character, options.startingItems);
}

function playerFromDraft(draft: CharacterCreationDraft): PlayerCharacter {
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

function recruitCharacter(profile: RecruitProfile): PlayerCharacter {
  const npc = npcs.find(({ id }) => id === profile.npcId);
  return createPartyCharacter({
    id: profile.id.replace("recruit.", "party."),
    name: npc?.name.split(" ")[0] ?? profile.id,
    ancestryId: profile.ancestryId,
    jobId: profile.jobId,
    skills: profile.startingSkills,
    startingItems: profile.startingItems
  });
}

/** Boss-exclusive forms matching each boss's own authored phase theme (see bossPhases in campaign.ts). */
const ENEMY_SKILLS: Readonly<Record<string, readonly string[]>> = {
  "enemy.mire-antler": ["skill.antler-charge"],
  "enemy.kiln-heart": ["skill.crucible-flare"],
  "enemy.varn-rootless": ["skill.severance-cut"]
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
const ENEMY_ELEMENTS: Readonly<Record<string, Partial<Record<Element, number>>>> = {
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
  "enemy.varn-rootless": { aether: 0.35, ice: 0.2, radiant: -0.3 }
};

/**
 * Chosen once at character creation and fixed for the life of the
 * chronicle (see newGame). Scales enemy HP/offense and battle rewards
 * without touching combat.ts's formulas, keeping the deterministic engine
 * itself difficulty-agnostic — the integration layer applies the scale
 * before combat starts and after rewards are computed.
 */
const DIFFICULTY_ENEMY_MULTIPLIER: Readonly<Record<Difficulty, number>> = {
  easy: 0.8,
  normal: 1,
  hard: 1.25
};

const DIFFICULTY_REWARD_MULTIPLIER: Readonly<Record<Difficulty, number>> = {
  easy: 0.85,
  normal: 1,
  hard: 1.2
};

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

function difficultyOf(state: GameState): Difficulty {
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
function actionEconomyScale(enemyCount: number, partySize: number): number {
  if (enemyCount <= partySize) return 1;
  // Square root, not the raw ratio: full normalisation would make a mob of six
  // feel like a single enemy, which removes the pressure a group should create.
  return Math.sqrt(Math.max(1, partySize) / enemyCount);
}

function enemyCombatant(
  id: string,
  index: number,
  boss: boolean,
  level: number,
  difficulty: Difficulty,
  economyScale = 1
): Combatant {
  const scale = DIFFICULTY_ENEMY_MULTIPLIER[difficulty];
  const offenceScale = scale * economyScale;
  const maxHp = Math.max(1, Math.round((boss ? 150 + level * 12 : 38 + level * 9) * scale));
  return {
    id: `${id}.${index}`,
    name: id.replace("enemy.", "").replaceAll("-", " "),
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
    statusResistance: boss ? { stun: 0.5, sleep: 0.5, freeze: 0.5 } : undefined,
    isPlayerControlled: false
  };
}

/**
 * Player-facing status names. The game previously never explained what any
 * status did, so a freeze and a stun were indistinguishable to the player.
 */
const STATUS_LABELS: Readonly<Record<StatusId, string>> = {
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

function slotLabel(slot: GameSaveSlot): string {
  return SLOT_LABELS[slot];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class EngineGameBridge implements GameBridge {
  readonly #listeners = new Set<SnapshotListener>();
  readonly #saves: SaveRepository;
  #state?: GameState;
  #battle?: ActiveBattle;
  /** The vendor whose ledger is currently open, if any. Closed on travel/battle/title-return. */
  #openVendorId?: string;
  #autosave: GameSnapshot["autosave"] = "idle";
  #autosaveSlot?: GameSaveSlot;
  #hasSave = false;
  /**
   * False once persistence has proven unusable. The game stays fully playable —
   * it simply stops pretending saves are happening.
   */
  #storageAvailable = true;
  readonly #saveSlots = new Set<GameSaveSlot>();
  readonly #newSeed: () => string;
  #saveSummaries: SaveSlotSummaryView[] = [];
  readonly #narrative = new NarrativeCheckpointQueue({
    validationCatalog: {
      knownEntityIds: new Set([
        ...locations.map(({ id }) => id),
        ...npcs.map(({ id }) => id),
        ...encounters.map(({ id }) => id),
        ...items.map(({ id }) => id)
      ]),
      knownNpcIds: new Set(npcs.map(({ id }) => id)),
      forbiddenCanonTerms: ["world item", "super-tier", "ainz", "nazarick"]
    }
  });

  /**
   * `newSeed` exists so tests and tools can pin the chronicle seed. Production
   * keeps the random default; without the seam, any test comparing two
   * chronicles is comparing two different RNG streams and cannot isolate the
   * variable it means to measure.
   */
  constructor(saves = new SaveRepository(), newSeed: () => string = () => crypto.randomUUID()) {
    this.#saves = saves;
    this.#newSeed = newSeed;
  }

  /**
   * Never throws. A storage backend that cannot open (private browsing, quota,
   * blocked upgrade) degrades to an explicit no-persistence mode rather than
   * aborting startup and leaving the player with a blank page.
   */
  async initialize(): Promise<void> {
    try {
      await this.refreshSaveIndex();
    } catch (error) {
      console.error("Save storage unavailable; continuing without persistence.", error);
      this.#storageAvailable = false;
      this.#saveSlots.clear();
      this.#saveSummaries = [];
      this.#hasSave = false;
    }
  }

  private async refreshSaveIndex(): Promise<void> {
    const records = await this.#saves.list();
    this.#saveSlots.clear();
    for (const record of records) this.#saveSlots.add(record.slot);
    this.#saveSummaries = records.map((record) => ({
      slot: record.slot,
      updatedAt: record.updatedAt,
      locationName: locations.find(({ id }) => id === record.locationId)?.name ?? record.locationId,
      partyLevel: record.partyLevel,
      playTimeMinutes: record.playTimeMinutes
    }));
    this.#hasSave = this.#saveSlots.has("autosave");
  }

  getSnapshot(): Readonly<GameSnapshot> {
    if (!this.#state) {
      return {
        hasSave: this.#hasSave,
        playerName: "",
        locationId: STARTING_LOCATION,
        locationName: "Hearthcross",
        worldMinutes: 480,
        currency: 0,
        difficulty: "normal",
        party: [],
        inventory: [],
        quests: [],
        saveSlots: [...this.#saveSlots],
        saveSummaries: this.#saveSummaries,
        autosave: this.#autosave,
        autosaveSlot: this.#autosaveSlot,
        storageAvailable: this.#storageAvailable,
        chronicleHint: "A rain-heavy morning in Hearthcross."
      };
    }
    const party = this.#state.party;
    const location = locations.find(({ id }) => id === this.#state?.world.currentLocationId);
    const mainQuestIds = new Set(quests.filter(({ mainStory }) => mainStory).map(({ id }) => id));
    const completedMainQuests = this.#state.quests.filter(({ questId, state }) =>
      mainQuestIds.has(questId) && state === "completed"
    ).length;
    const endingChoice = CONCORD_CHOICES.find(({ id }) => this.#state?.world.flags[id] === true);
    return {
      hasSave: this.#hasSave,
      playerName: party[0]?.name ?? "",
      locationId: this.#state.world.currentLocationId,
      locationName: location?.name ?? "Unknown road",
      worldMinutes: this.#state.world.worldMinutes + 480,
      currency: Number(this.#state.world.flags.currency ?? 0),
      difficulty: difficultyOf(this.#state),
      party: party.map((member, index) => this.toPartyView(member, index)),
      inventory: this.#state.inventory.flatMap((stack) => {
        const definition = items.find(({ id }) => id === stack.itemId);
        const equippedBy = party
          .filter((member) => Object.values(member.equipment).includes(stack.itemId))
          .map(({ id }) => id);
        return definition ? [{
          itemId: stack.itemId,
          name: definition.name,
          description: definition.description,
          quantity: stack.quantity,
          kind: definition.kind,
          equippedBy
        }] : [];
      }),
      quests: this.#state.quests.flatMap((progress) => {
        const definition = quests.find(({ id }) => id === progress.questId);
        return definition ? [this.toQuestView(definition, progress.currentStep, progress.state)] : [];
      }),
      battle: this.#battle ? this.toBattleView(this.#battle) : undefined,
      shop: this.#openVendorId ? this.toShopView(this.#openVendorId) : undefined,
      campaign: {
        completedMainQuests,
        totalMainQuests: mainQuestIds.size,
        complete: mainQuestIds.size > 0 && completedMainQuests === mainQuestIds.size,
        ending: endingChoice ? {
          id: endingChoice.id,
          title: endingChoice.title,
          body: endingChoice.body,
          epilogue: endingChoice.epilogue
        } : undefined
      },
      reputation: {
        factions: Object.entries(this.#state.world.factionStanding)
          .filter(([, standing]) => standing !== 0)
          .map(([id, standing]) => ({
            id,
            name: id.replace("faction.", "").replaceAll("-", " "),
            standing
          }))
          .sort((left, right) => Math.abs(right.standing) - Math.abs(left.standing)),
        relationships: this.#state.world.relationships
          .filter(({ trust, respect, fear }) => trust !== 0 || respect !== 0 || fear !== 0)
          .map((relationship) => ({
            npcId: relationship.npcId,
            name: npcs.find(({ id }) => id === relationship.npcId)?.name
              ?? relationship.npcId.replace("npc.", "").replaceAll("-", " "),
            trust: relationship.trust,
            respect: relationship.respect,
            fear: relationship.fear
          }))
          .sort((left, right) =>
            Math.max(Math.abs(right.trust), Math.abs(right.respect), Math.abs(right.fear))
            - Math.max(Math.abs(left.trust), Math.abs(left.respect), Math.abs(left.fear))
          )
      },
      saveSlots: [...this.#saveSlots],
      saveSummaries: this.#saveSummaries,
      autosave: this.#autosave,
      autosaveSlot: this.#autosaveSlot,
      storageAvailable: this.#storageAvailable,
      chronicleHint: this.#state.world.chronicle.at(-1)?.body ?? "The road is waiting."
    };
  }

  subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async newGame(draft: CharacterCreationDraft): Promise<void> {
    const loadout = startingBuildLoadouts.find(
      (candidate) => candidate.ancestryId === draft.ancestryId && candidate.jobId === draft.jobId
    );
    if (!loadout) throw new Error(`Unknown starting build '${draft.ancestryId}/${draft.jobId}'`);
    let state = createInitialGameState({
      seed: `${draft.name || "Rowan"}-${this.#newSeed()}`,
      startingLocationId: STARTING_LOCATION,
      party: [playerFromDraft(draft)],
      contentPackVersions: { "core.yggdrasil-chronicles": CORE_PACK_VERSION },
      quests
    });
    let startingInventory = addItem(addItem(state.inventory, "item.vesleaf", 3), "item.root-tonic", 2);
    for (const itemId of loadout.startingItems) {
      if (!isEquipmentItem(itemId)) {
        startingInventory = this.addWithinStackLimit(startingInventory, itemId, 1);
      }
    }
    state = {
      ...state,
      inventory: startingInventory,
      quests: startQuest(state.quests, FIRST_QUEST),
      world: {
        ...state.world,
        flags: { ...state.world.flags, difficulty: draft.difficulty },
        chronicle: [{
          id: crypto.randomUUID(),
          worldMinute: 0,
          title: "A Chronicle Begins",
          body: `${draft.name || "Rowan"} answered Hearthcross's call beneath an unseasonable rain.`,
          tags: ["main-story", "hearthcross"]
        }]
      }
    };
    this.#state = state;
    this.#battle = undefined;
    await this.persist("autosave");
  }

  async continueGame(): Promise<GameCommandResult> {
    return this.load("autosave");
  }

  /**
   * A corrupt or unreadable slot reports failure and leaves the previously
   * loaded state untouched, so one bad record costs the player that record
   * rather than access to every other save.
   */
  async load(slot: GameSaveSlot): Promise<GameCommandResult> {
    let loaded: GameState | undefined;
    try {
      loaded = await this.#saves.load(slot);
    } catch (error) {
      console.error(`Load failed for slot '${slot}'`, error);
      this.emit();
      return {
        success: false,
        message: `${slotLabel(slot)} could not be read: ${errorMessage(error)}`
      };
    }
    if (!loaded) {
      this.#saveSlots.delete(slot);
      if (slot === "autosave") this.#hasSave = false;
      this.emit();
      return { success: false, message: `${slotLabel(slot)} is empty.` };
    }
    this.#state = loaded;
    this.#saveSlots.add(slot);
    this.#hasSave = true;
    const recoveredCanonicalState = this.applyCompletedQuestRewards();
    const recoveredLegacyEnding = this.backfillLegacyEndingChoice();
    if (recoveredCanonicalState || recoveredLegacyEnding) await this.persist(slot);
    else this.emit();
    return { success: true, message: `${slotLabel(slot)} loaded.` };
  }

  async deleteSave(slot: GameSaveSlot): Promise<GameCommandResult> {
    if (!this.#saveSlots.has(slot)) {
      return { success: false, message: `${slotLabel(slot)} is already empty.` };
    }
    try {
      await this.#saves.delete(slot);
    } catch (error) {
      console.error(`Delete failed for slot '${slot}'`, error);
      return { success: false, message: `${slotLabel(slot)} could not be deleted.` };
    }
    this.#saveSlots.delete(slot);
    this.#saveSummaries = this.#saveSummaries.filter((entry) => entry.slot !== slot);
    if (slot === "autosave") this.#hasSave = false;
    this.emit();
    return { success: true, message: `${slotLabel(slot)} deleted.` };
  }

  async travel(locationId: string): Promise<void> {
    const state = this.requireState();
    const current = locations.find(({ id }) => id === state.world.currentLocationId);
    if (!current?.connections.includes(locationId)) return;
    const discovered = state.world.discoveredLocationIds.includes(locationId)
      ? state.world.discoveredLocationIds
      : [...state.world.discoveredLocationIds, locationId];
    const findFlag = this.findFlag("location", locationId);
    const hasClaimedFinds = state.world.flags[findFlag] === true;
    let inventory = state.inventory;
    if (!hasClaimedFinds) {
      for (const [itemId, quantity] of locationFinds[locationId] ?? []) {
        inventory = this.addWithinStackLimit(inventory, itemId, quantity);
      }
    }
    this.#state = {
      ...state,
      inventory,
      quests: this.applyObjectiveToActiveQuests(state.quests, "travel", locationId),
      world: {
        ...state.world,
        currentLocationId: locationId,
        discoveredLocationIds: discovered,
        worldMinutes: state.world.worldMinutes + 35,
        flags: hasClaimedFinds
          ? state.world.flags
          : { ...state.world.flags, [findFlag]: true }
      }
    };
    this.applyInventoryObjectives();
    this.advanceCampaign();
    this.applyCompletedQuestRewards();
    await this.persist("autosave");
    this.enqueueNarrativeCheckpoint("world_event", `The party crossed into ${locationId.replace("location.", "").replaceAll("-", " ")}.`);
  }

  async interactNpc(npcId: string): Promise<InteractionView> {
    const state = this.requireState();
    const conversationFlag = this.npcConversationFlag(npcId);
    const previousConversationCount = Number(state.world.flags[conversationFlag] ?? 0);
    const conversationCount = (Number.isFinite(previousConversationCount) ? previousConversationCount : 0) + 1;
    let progress = state.quests;
    // Remember which quest this conversation started so the scene can announce
    // it. Quests were previously acquired in complete silence.
    let startedQuestId: string | undefined;
    for (const definition of quests) {
      const entry = progress.find(({ questId }) => questId === definition.id);
      const introducesQuest = definition.steps[0]?.kind === "talk" && definition.steps[0].targetId === npcId;
      if (entry?.state === "available" && introducesQuest) {
        progress = startQuest(progress, definition.id);
        startedQuestId ??= definition.id;
      }
    }
    const awaitsConcordChoice = this.isAwaitingConcordChoice(progress, npcId);
    this.#state = {
      ...state,
      quests: this.applyObjectiveToActiveQuests(
        progress,
        "talk",
        npcId,
        1,
        awaitsConcordChoice ? new Set([CONCORD_QUEST]) : undefined
      ),
      world: {
        ...state.world,
        flags: {
          ...state.world.flags,
          [conversationFlag]: conversationCount
        }
      }
    };
    this.applyInventoryObjectives();
    this.applyDeliveryObjectives(npcId);
    this.advanceCampaign();
    this.applyCompletedQuestRewards();
    let recruitedMember: PartyMemberView | undefined;
    const profile = recruitProfiles.find((candidate) => candidate.npcId === npcId);
    if (profile && this.#state.party.length < 4) {
      const completed = this.#state.quests.some(
        ({ questId, state: questState }) => questId === profile.recruitmentQuestId && questState === "completed"
      );
      const partyId = profile.id.replace("recruit.", "party.");
      if (completed && !this.#state.party.some(({ id }) => id === partyId)) {
        const recruited = recruitCharacter(profile);
        const party = [...this.#state.party, recruited];
        this.#state = {
          ...this.#state,
          party,
          inventory: profile.startingItems.reduce(
            (inventory, itemId) => isEquipmentItem(itemId)
              ? inventory
              : this.addWithinStackLimit(inventory, itemId, 1),
            this.#state.inventory
          )
        };
        recruitedMember = this.toPartyView(recruited, party.length - 1);
      }
    }
    const vendor = vendorProfiles.find((candidate) => candidate.npcId === npcId);
    if (vendor) this.#openVendorId = vendor.id;
    await this.persist("autosave");
    const npc = npcId.replace("npc.", "").split("-").map((word) =>
      `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`
    ).join(" ");
    return {
      speaker: npc,
      lines: awaitsConcordChoice
        ? [
            ...this.responsiveDialogue(npcId),
            "Three futures remain possible. The last word belongs to the chronicle you have made."
          ]
        : this.responsiveDialogue(npcId),
      choices: awaitsConcordChoice
        ? CONCORD_CHOICES.map(({ id, label, description }) => ({ id, label, description }))
        : undefined,
      // The Concord choice ends the campaign and closes two of three futures.
      // Flagging it lets the scene demand an explicit confirmation instead of
      // committing it on the same keypress as any other dialogue line.
      pointOfNoReturn: awaitsConcordChoice
        ? "This decision ends the chronicle and closes the futures you do not choose."
        : undefined,
      startedQuestId,
      startedQuestTitle: startedQuestId
        ? quests.find(({ id }) => id === startedQuestId)?.title
        : undefined,
      recruitedMember,
      opensVendorId: vendor?.id
    };
  }

  async resolveInteractionChoice(choiceId: string): Promise<InteractionView> {
    const state = this.requireState();
    const choice = CONCORD_CHOICES.find(({ id }) => id === choiceId);
    if (!choice || !this.isAwaitingConcordChoice(state.quests, CONCORD_FINAL_NPC)) {
      return {
        speaker: "Sable Voss",
        lines: ["That decision is no longer available to this chronicle."]
      };
    }
    const worldMinute = state.world.worldMinutes;
    // The chosen future both strengthens its own faction and structurally
    // closes off the opposing one; endings are a trade-off, not a pure gain.
    const factionStanding = adjustFactionStanding(
      adjustFactionStanding(state.world.factionStanding, choice.factionId, 8),
      choice.opposedFactionId,
      -5
    );
    this.#state = {
      ...state,
      quests: this.applyObjectiveToActiveQuests(state.quests, "talk", CONCORD_FINAL_NPC),
      world: {
        ...state.world,
        factionStanding,
        flags: {
          ...state.world.flags,
          [choice.id]: true
        },
        chronicle: [
          ...state.world.chronicle,
          {
            id: crypto.randomUUID(),
            worldMinute,
            title: choice.label,
            body: choice.resolution,
            tags: ["main-story", "ending", choice.id]
          },
          {
            id: crypto.randomUUID(),
            worldMinute,
            title: "What the Choice Cost",
            body: choice.epilogue,
            tags: ["main-story", "ending", "epilogue", choice.id]
          }
        ]
      }
    };
    this.applyInventoryObjectives();
    this.advanceCampaign();
    this.applyCompletedQuestRewards();
    await this.persist("autosave");
    return {
      speaker: "Sable Voss",
      lines: [
        choice.resolution,
        "Then let every witness remember that this future was chosen, not inherited."
      ]
    };
  }

  private responsiveDialogue(npcId: string): readonly string[] {
    const state = this.requireState();
    const definition = npcs.find(({ id }) => id === npcId);
    const relationship = state.world.relationships.find(({ npcId: candidate }) => candidate === npcId);
    const factionStanding = definition ? state.world.factionStanding[definition.factionId] ?? 0 : 0;
    const scripted = getDialogue(npcId);
    const conversationCount = Number(state.world.flags[this.npcConversationFlag(npcId)] ?? 1);
    const rotatingIndex = scripted.length > 1
      ? 1 + ((Math.max(1, Math.floor(conversationCount)) - 1) % (scripted.length - 1))
      : 0;
    const lines = scripted.length > 1
      ? [scripted[0] ?? "", scripted[rotatingIndex] ?? scripted[0] ?? ""]
      : [...scripted];
    if ((relationship?.trust ?? 0) >= 8) {
      lines.push("You kept faith when the road made that difficult. I have not forgotten.");
    } else if ((relationship?.trust ?? 0) <= -8) {
      lines.push("I remember what your choice cost. Do not mistake conversation for trust.");
    }
    if ((relationship?.respect ?? 0) >= 12) {
      lines.push("Your deeds now arrive before you. That earns a hearing, if not agreement.");
    } else if ((relationship?.fear ?? 0) >= 12) {
      lines.push("People lower their voices when your chronicle is named. I wonder if that pleases you.");
    }
    if (definition && factionStanding >= 10) {
      const factionName = definition.factionId.replace("faction.", "").replaceAll("-", " ");
      lines.push(`Word has traveled through the ${factionName}. Its people now count you among their proven allies.`);
    } else if (definition && factionStanding <= -10) {
      const factionName = definition.factionId.replace("faction.", "").replaceAll("-", " ");
      lines.push(`The ${factionName} has not forgiven your interference. Tread carefully.`);
    }
    return lines;
  }

  private npcConversationFlag(npcId: string): string {
    return `memory.${npcId}.conversations`;
  }

  /**
   * Authored level wins. Falling back to the party average is only for
   * encounters not yet authored with one — and it is deliberately NOT a floor
   * or a clamp against the party, because scaling enemies to the party is
   * exactly the inversion the authored level exists to remove: enemy stats
   * grew faster than the player's, so levelling narrowed the party's margin.
   */
  private encounterLevel(encounter: EncounterDefinition, state: GameState): number {
    if (typeof encounter.level === "number") return Math.max(1, encounter.level);
    const total = state.party.reduce((sum, member) => sum + member.level, 0);
    return Math.max(1, Math.round(total / Math.max(1, state.party.length)));
  }

  startEncounter(encounterId: string): void {
    const state = this.requireState();
    const encounter = encounters.find(({ id }) => id === encounterId);
    if (!encounter) throw new Error(`Unknown encounter '${encounterId}'`);
    if (encounter.boss && state.world.defeatedBossIds.includes(encounterId)) return;
    // Fail safe rather than throwing out of an awaited scene call: createCombatState
    // rejects an all-incapacitated party, and that rejection would strand the caller
    // mid-transition with its input gate still closed.
    if (!state.party.some((member) => member.hp > 0)) return;
    const encounterLevel = this.encounterLevel(encounter, state);
    const difficulty = difficultyOf(state);
    const livingParty = state.party.filter((member) => member.hp > 0).length;
    const economyScale = actionEconomyScale(encounter.enemyIds.length, livingParty);
    const enemies = encounter.enemyIds.map((id, index) =>
      enemyCombatant(id, index, encounter.boss, encounterLevel, difficulty, economyScale));
    const party = state.party.map((member) => {
      const stats = deriveCharacterCombatStats(member, EQUIPMENT);
      return {
        ...member,
        stats,
        hp: Math.min(stats.maxHp, member.hp + Math.max(0, stats.maxHp - member.stats.maxHp)),
        mp: Math.min(stats.maxMp, member.mp + Math.max(0, stats.maxMp - member.stats.maxMp))
      };
    });
    this.#battle = {
      encounterId,
      state: createCombatState(party, enemies, `${state.seed}:${encounterId}:${state.world.worldMinutes}`),
      phase: "choosing",
      log: [`${encounter.name} bars the road.`],
      partyTurnIndex: this.firstLivingPartyIndex(party),
      activatedBossPhases: [],
      events: []
    };
    this.applyBossPhaseTransitions(this.#battle);
    this.emit();
  }

  async chooseBattleAction(action: BattleAction, skillOrItemId?: string, targetId?: string): Promise<void> {
    const active = this.#battle;
    if (!active || active.phase !== "choosing") return;
    const actor = active.state.party[active.partyTurnIndex];
    const target = active.state.enemies.find(({ hp }) => hp > 0);
    if (!actor || actor.hp <= 0 || !target) return;
    // Each action replaces the previous frame's events, so the scene animates
    // what just happened rather than replaying the whole battle.
    active.events = [];
    if (action === "escape") {
      const encounter = encounters.find(({ id }) => id === active.encounterId);
      if (!encounter?.boss) {
        this.#battle = { ...active, phase: "escaped", log: [...active.log, "The party found a safe route away."] };
        this.emit();
        return;
      }
      // Return without falling through to the enemy-turn tail: a refused escape
      // must cost nothing. Falling through made it identical to skipping a turn,
      // and with a solo party that handed the enemy a free round.
      active.log.push("There is no safe route away from this foe.");
      this.emit();
      return;
    } else if (action === "item") {
      const state = this.requireState();
      const requestedItemId = skillOrItemId && inventoryQuantity(state.inventory, skillOrItemId) > 0
        && (RECOVERY_ITEMS[skillOrItemId] || STATUS_CURE_ITEMS[skillOrItemId])
        ? skillOrItemId
        : undefined;
      const itemId = requestedItemId
        ?? (inventoryQuantity(state.inventory, "item.root-tonic") > 0 ? "item.root-tonic" : undefined);
      const cureList = itemId ? STATUS_CURE_ITEMS[itemId] : undefined;
      const recovery = itemId ? RECOVERY_ITEMS[itemId] : undefined;
      if (itemId && (recovery || cureList)) {
        const itemName = items.find(({ id }) => id === itemId)?.name ?? itemId;
        // Items may now be handed to an ally. The branch used to hard-filter to
        // the acting member, so a downed companion could never be reached and
        // the dedicated healer could only ever treat themselves.
        const recipientId = this.resolveActionTarget(active, actor.id, "ally", targetId, actor.id);
        const recipient = active.state.party.find(({ id }) => id === recipientId);
        const healedParty = active.state.party.map((member) => {
          if (member.id !== recipientId) return member;
          const hp = recovery ? Math.min(member.stats.maxHp, member.hp + recovery.hp) : member.hp;
          const mp = recovery ? Math.min(member.stats.maxMp, member.mp + recovery.mp) : member.mp;
          const statuses = cureList
            ? member.statuses.filter((status) => !cureList.includes(status.id))
            : member.statuses;
          return { ...member, hp, mp, statuses };
        });
        active.state = { ...active.state, party: healedParty };
        this.#state = { ...state, inventory: removeItem(state.inventory, itemId) };
        const onSelf = recipientId === actor.id;
        const recipientName = recipient?.name ?? "an ally";
        active.log.push(cureList
          ? onSelf
            ? `${actor.name} uses ${itemName} and shakes off the affliction.`
            : `${actor.name} uses ${itemName} on ${recipientName}, clearing the affliction.`
          : onSelf
            ? `${actor.name} uses ${itemName} and restores vitality.`
            : `${actor.name} uses ${itemName} on ${recipientName}, restoring vitality.`);
      } else {
        active.log.push("No usable item remains in the pack.");
      }
    } else {
      const requestedSkillId = action === "skill" && skillOrItemId && actor.skills.includes(skillOrItemId) && SKILLS[skillOrItemId]
        ? skillOrItemId
        : undefined;
      const activeSkillId = requestedSkillId ?? actor.skills.find((candidate) => SKILLS[candidate]);
      const activeSkill = activeSkillId ? SKILLS[activeSkillId] : undefined;
      const scope = action === "skill" ? activeSkill?.target ?? "enemy" : "enemy";
      const chosenTargetId = this.resolveActionTarget(active, actor.id, scope, targetId, target.id);
      if (scope === "enemy") active.lastTargetId = chosenTargetId;
      const resolution = resolveCombatAction(
        active.state,
        action === "guard"
          ? { type: "guard", actorId: actor.id }
          : action === "skill" && activeSkillId
            ? { type: "skill", actorId: actor.id, targetId: chosenTargetId, skillId: activeSkillId }
            : { type: "attack", actorId: actor.id, targetId: chosenTargetId },
        SKILLS
      );
      active.state = resolution.state;
      active.events.push(...resolution.events);
      active.log.push(...resolution.events.map((event) => this.describeEvent(event, active.state)));
      this.recordObservedElements(resolution.events);
      this.applyBossPhaseTransitions(active);
    }

    if (active.state.outcome === "ongoing" && this.advancePartyTurn(active)) {
      this.emit();
      return;
    }

    if (active.state.outcome === "ongoing") {
      for (const enemy of active.state.enemies.filter(({ hp }) => hp > 0)) {
        const enemyAction = chooseEnemyAction(active.state, enemy.id, SKILLS);
        const resolution = resolveCombatAction(active.state, enemyAction, SKILLS);
        active.state = resolution.state;
        active.events.push(...resolution.events);
        active.log.push(...resolution.events.map((event) => this.describeEvent(event, active.state)));
        if (active.state.outcome !== "ongoing") break;
      }
    }
    if (active.state.outcome === "ongoing") {
      const advanced = advanceCombatRound(active.state);
      active.state = advanced.state;
      active.events.push(...advanced.events);
      active.log.push(...advanced.events.map((event) => this.describeEvent(event, active.state)));
      if (active.state.outcome === "ongoing") {
        active.partyTurnIndex = this.firstLivingPartyIndex(active.state.party);
      }
    }
    if (active.state.outcome === "victory") await this.resolveVictory(active);
    if (active.state.outcome === "defeat") active.phase = "defeat";
    this.emit();
  }

  /**
   * Records which elements the player has actually landed on each enemy
   * species, so weaknesses become learnable through play rather than being
   * numbers the player can never see. Stored as world flags, which already
   * carry the per-species defeat counts, so this needs no schema change.
   */
  private recordObservedElements(events: readonly CombatEvent[]): void {
    const state = this.#state;
    const battle = this.#battle;
    if (!state || !battle) return;
    let flags = state.world.flags;
    let changed = false;
    for (const event of events) {
      if (event.type !== "damage") continue;
      // Only the player's own hits teach anything; an enemy hitting an ally
      // says nothing about that enemy's own resistances.
      const target = battle.state.enemies.find(({ id }) => id === event.targetId);
      if (!target) continue;
      const key = `progress.element.${enemyContentId(target.id)}.${event.element}`;
      if (flags[key] === true) continue;
      flags = { ...flags, [key]: true };
      changed = true;
    }
    if (changed) this.#state = { ...state, world: { ...state.world, flags } };
  }

  /** Elements the player has already landed on this species, split by sign. */
  private knownElementsFor(contentId: string): { weaknesses: Element[]; resistances: Element[] } {
    const flags = this.#state?.world.flags ?? {};
    const table = ENEMY_ELEMENTS[contentId] ?? {};
    const weaknesses: Element[] = [];
    const resistances: Element[] = [];
    for (const [element, value] of Object.entries(table) as Array<[Element, number]>) {
      if (flags[`progress.element.${contentId}.${element}`] !== true) continue;
      if (value < 0) weaknesses.push(element);
      else if (value > 0) resistances.push(element);
    }
    return { weaknesses, resistances };
  }

  /**
   * Picks the combatant an action lands on. An explicit, still-valid request
   * always wins; otherwise the remembered target is reused, and only then does
   * it fall back to the first living enemy. Self-scoped skills ignore all of
   * this and hit the actor.
   */
  private resolveActionTarget(
    active: ActiveBattle,
    actorId: string,
    scope: "enemy" | "ally" | "self",
    requestedId: string | undefined,
    defaultEnemyId: string
  ): string {
    if (scope === "self") return actorId;
    const pool = scope === "ally" ? active.state.party : active.state.enemies;
    const living = pool.filter(({ hp }) => hp > 0);
    const requested = requestedId ? living.find(({ id }) => id === requestedId) : undefined;
    if (requested) return requested.id;
    if (scope === "ally") {
      // Default to the ally who most needs it, which is what an unaimed heal means.
      const neediest = [...living].sort((left, right) =>
        (left.hp / left.stats.maxHp) - (right.hp / right.stats.maxHp) || left.id.localeCompare(right.id));
      return neediest[0]?.id ?? actorId;
    }
    const remembered = active.lastTargetId
      ? living.find(({ id }) => id === active.lastTargetId)
      : undefined;
    return remembered?.id ?? defaultEnemyId;
  }

  async leaveBattle(): Promise<void> {
    if (this.#battle?.phase === "escaped" && this.#state) {
      const escapedParty = this.#battle.state.party;
      this.#state = {
        ...this.#state,
        party: this.#state.party.map((member) => {
          const combatant = escapedParty.find(({ id }) => id === member.id);
          if (!combatant) return member;
          const missingHp = Math.max(0, combatant.stats.maxHp - combatant.hp);
          const missingMp = Math.max(0, combatant.stats.maxMp - combatant.mp);
          return {
            ...member,
            hp: Math.max(1, member.stats.maxHp - missingHp),
            mp: Math.max(0, member.stats.maxMp - missingMp),
            statuses: combatant.statuses
          };
        })
      };
    } else if (this.#battle?.phase === "defeat" && this.#state) {
      this.#state = {
        ...this.#state,
        party: this.#state.party.map((member) => ({
          ...member,
          hp: Math.max(1, Math.round(member.stats.maxHp * 0.5)),
          mp: Math.round(member.stats.maxMp * 0.5),
          statuses: []
        }))
      };
      // A wipe must not overwrite the pre-battle autosave: that snapshot is the
      // player's only route back to the state they lost from. The revived party
      // stays in memory so play can continue, and the next ordinary autosave
      // (travel, victory, purchase) commits it deliberately.
      this.#battle = undefined;
      this.emit();
      return;
    }
    this.#battle = undefined;
    await this.persist("autosave");
  }

  async rest(): Promise<void> {
    const state = this.requireState();
    if (this.#battle) return;
    this.#state = {
      ...state,
      party: state.party.map((member) => ({
        ...member,
        hp: member.stats.maxHp,
        mp: member.stats.maxMp,
        statuses: []
      })),
      world: {
        ...state.world,
        worldMinutes: state.world.worldMinutes + 480,
        chronicle: [...state.world.chronicle, {
          id: crypto.randomUUID(),
          worldMinute: state.world.worldMinutes + 480,
          title: "A Quiet Rest",
          body: "The party made camp, tended its wounds, and listened to the rootways.",
          tags: ["rest", state.world.currentLocationId]
        }]
      }
    };
    await this.persist("autosave");
    this.enqueueNarrativeCheckpoint("world_event", "The party rested and gave the world time to answer.");
  }

  async save(slot: SaveSlot): Promise<void> {
    await this.persist(slot);
  }

  async useInventoryItem(itemId: string, memberId: string): Promise<GameCommandResult> {
    if (this.#battle) return commandFailure("Items can only be used while the party is out of battle.");
    const state = this.requireState();
    const memberIndex = state.party.findIndex(({ id }) => id === memberId);
    const member = state.party[memberIndex];
    if (!member) return commandFailure("That party member is unavailable.");
    const recovery = RECOVERY_ITEMS[itemId];
    if (!recovery) return commandFailure("That item has no usable restorative effect.");
    if (inventoryQuantity(state.inventory, itemId) < 1) return commandFailure("That item is not in the inventory.");

    const hp = Math.min(member.stats.maxHp, member.hp + recovery.hp);
    const mp = Math.min(member.stats.maxMp, member.mp + recovery.mp);
    if (hp === member.hp && mp === member.mp) {
      return commandFailure(`${member.name} cannot benefit from that item right now.`);
    }

    const updatedMember: PlayerCharacter = { ...member, hp, mp };
    this.#state = {
      ...state,
      party: state.party.map((candidate, index) => index === memberIndex ? updatedMember : candidate),
      inventory: removeItem(state.inventory, itemId)
    };
    await this.persist("autosave");
    return { success: true, message: `${member.name} uses ${items.find((item) => item.id === itemId)?.name ?? itemId}.` };
  }

  async setEquipment(
    memberId: string,
    slot: "weapon" | "armor" | "accessory",
    itemId?: string
  ): Promise<GameCommandResult> {
    if (this.#battle) return commandFailure("Equipment can only be changed while the party is out of battle.");
    const state = this.requireState();
    const memberIndex = state.party.findIndex(({ id }) => id === memberId);
    const member = state.party[memberIndex];
    if (!member) return commandFailure("That party member is unavailable.");
    const currentlyEquipped = member.equipment[slot];

    if (itemId === undefined) {
      if (currentlyEquipped === undefined) return commandFailure(`No ${slot} is equipped.`);
      if (inventoryQuantity(state.inventory, currentlyEquipped) >= 99) {
        return commandFailure("There is no inventory space to unequip that item.");
      }
      const equipment = { ...member.equipment };
      delete equipment[slot];
      this.#state = {
        ...state,
        party: state.party.map((candidate, index) => index === memberIndex ? { ...member, equipment } : candidate),
        inventory: addItem(state.inventory, currentlyEquipped)
      };
      await this.persist("autosave");
      return { success: true, message: `${member.name} unequips ${currentlyEquipped}.` };
    }

    const equipmentItem = EQUIPMENT[itemId];
    if (!equipmentItem) return commandFailure("That item cannot be equipped.");
    if (equipmentItem.kind !== slot) return commandFailure(`That item does not fit the ${slot} slot.`);
    if (currentlyEquipped === itemId) return commandFailure(`${member.name} already has that item equipped.`);
    if (inventoryQuantity(state.inventory, itemId) < 1) return commandFailure("That item is not in the inventory.");
    if (currentlyEquipped !== undefined && inventoryQuantity(state.inventory, currentlyEquipped) >= 99) {
      return commandFailure("There is no inventory space to replace that equipment.");
    }

    try {
      const updatedMember = equipItem(member, equipmentItem);
      let inventory = removeItem(state.inventory, itemId);
      if (currentlyEquipped !== undefined) inventory = addItem(inventory, currentlyEquipped);
      this.#state = {
        ...state,
        party: state.party.map((candidate, index) => index === memberIndex ? updatedMember : candidate),
        inventory
      };
    } catch (error) {
      return commandFailure(error instanceof Error ? error.message : "Unable to change equipment.");
    }
    await this.persist("autosave");
    return { success: true, message: `${member.name} equips ${equipmentItem.name}.` };
  }

  async buyItem(itemId: string): Promise<GameCommandResult> {
    if (this.#battle) return commandFailure("The shop is closed while the party is in battle.");
    const state = this.requireState();
    if (!this.#openVendorId) return commandFailure("No shop is open.");
    const vendor = vendorProfiles.find(({ id }) => id === this.#openVendorId);
    if (!vendor || !vendor.catalogItemIds.includes(itemId)) {
      return commandFailure("That vendor does not sell that item.");
    }
    const definition = items.find(({ id }) => id === itemId);
    if (!definition) return commandFailure("That item does not exist.");
    if (inventoryQuantity(state.inventory, itemId) >= 99) {
      return commandFailure("There is no inventory space for another one of those.");
    }
    const currency = Number(state.world.flags.currency ?? 0);
    if (currency < definition.value) {
      return commandFailure(`${vendor.shopName} wants ${definition.value} marks; the party carries only ${currency}.`);
    }
    this.#state = {
      ...state,
      inventory: this.addWithinStackLimit(state.inventory, itemId, 1),
      world: { ...state.world, flags: { ...state.world.flags, currency: currency - definition.value } }
    };
    await this.persist("autosave");
    return { success: true, message: `Bought ${definition.name} for ${definition.value} marks.` };
  }

  async sellItem(itemId: string): Promise<GameCommandResult> {
    if (this.#battle) return commandFailure("The shop is closed while the party is in battle.");
    const state = this.requireState();
    if (!this.#openVendorId) return commandFailure("No shop is open.");
    const vendor = vendorProfiles.find(({ id }) => id === this.#openVendorId);
    if (!vendor || !vendor.catalogItemIds.includes(itemId)) {
      return commandFailure("That vendor is not interested in that item.");
    }
    const definition = items.find(({ id }) => id === itemId);
    if (!definition) return commandFailure("That item does not exist.");
    if (inventoryQuantity(state.inventory, itemId) < 1) {
      // Equipped copies live on the character, not the shared pack, so this
      // also correctly rejects selling a character's only equipped item.
      return commandFailure("The party does not carry a spare of that item.");
    }
    const sellPrice = Math.max(1, Math.round(definition.value * vendor.sellRate));
    const currency = Number(state.world.flags.currency ?? 0);
    this.#state = {
      ...state,
      inventory: removeItem(state.inventory, itemId),
      world: { ...state.world, flags: { ...state.world.flags, currency: currency + sellPrice } }
    };
    await this.persist("autosave");
    return { success: true, message: `Sold ${definition.name} for ${sellPrice} marks.` };
  }

  async leaveShop(): Promise<void> {
    this.#openVendorId = undefined;
    this.emit();
  }

  async selectJob(memberId: string, jobId: string): Promise<GameCommandResult> {
    if (this.#battle) return commandFailure("Jobs can only be changed while the party is out of battle.");
    const state = this.requireState();
    const memberIndex = state.party.findIndex(({ id }) => id === memberId);
    const member = state.party[memberIndex];
    if (!member) return commandFailure("That party member is unavailable.");
    const baseJobId = baseJobIdFor(member.jobId);
    const baseJob = jobs.find(({ id }) => id === baseJobId);
    if (!baseJob) return commandFailure("That character has an unknown job path.");
    if (jobId === member.jobId) return commandFailure(`${member.name} is already a ${member.jobId}.`);

    let nextMember: PlayerCharacter;
    let flags = state.world.flags;
    if (jobId === baseJob.id) {
      nextMember = reviseStatsForJobChange(member, baseJob.id);
    } else {
      const advancedJob = advancedJobs.find((job) => job.id === jobId && job.baseJobId === baseJob.id);
      if (!advancedJob) return commandFailure("That job is not part of this character's branch.");
      if (member.level < advancedJob.minimumLevel) {
        return commandFailure(`${advancedJob.name} unlocks at level ${advancedJob.minimumLevel}.`);
      }
      flags = { ...flags, [jobUnlockFlag(member.id, advancedJob.id)]: true };
      const withForms = withBonusSkill(
        reorderSignatureSkill(member.skills, advancedJob.signatureSkillId),
        advancedJob.bonusSkillId
      );
      nextMember = reviseStatsForJobChange({ ...member, skills: withForms }, advancedJob.id);
    }
    this.#state = {
      ...state,
      party: state.party.map((candidate, index) => index === memberIndex ? nextMember : candidate),
      world: { ...state.world, flags }
    };
    await this.persist("autosave");
    return { success: true, message: `${member.name} now follows the ${nextMember.jobId} path.` };
  }

  async exportSave(slot: GameSaveSlot): Promise<string> {
    return this.#saves.exportJson(slot);
  }

  async importSave(slot: GameSaveSlot, json: string): Promise<GameCommandResult> {
    try {
      await this.#saves.importJson(slot, json);
      const state = await this.#saves.load(slot);
      if (!state) throw new Error(`Imported save slot '${slot}' could not be loaded`);
      const summaries = await this.#saves.list();
      this.#state = state;
      this.#battle = undefined;
      this.#saveSlots.clear();
      for (const summary of summaries) this.#saveSlots.add(summary.slot);
      this.#hasSave = this.#saveSlots.has("autosave");
      this.#autosave = "saved";
      this.emit();
      return { success: true, message: `Imported save into ${slot}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import save.";
      return commandFailure(`Import failed: ${message}`);
    }
  }

  private requireState(): GameState {
    if (!this.#state) throw new Error("No active chronicle");
    return this.#state;
  }

  private async resolveVictory(active: ActiveBattle): Promise<void> {
    const state = this.requireState();
    const encounter = encounters.find(({ id }) => id === active.encounterId);
    if (!encounter) return;
    const averageLevel = Math.max(1, Math.round(active.state.enemies.reduce((sum, enemy) => sum + enemy.level, 0) / active.state.enemies.length));
    const baseReward = calculateBattleReward(encounter.rewardTier, averageLevel, `${state.seed}:${active.encounterId}`);
    const rewardScale = DIFFICULTY_REWARD_MULTIPLIER[difficultyOf(state)];
    const reward = {
      ...baseReward,
      experience: Math.round(baseReward.experience * rewardScale),
      currency: Math.round(baseReward.currency * rewardScale)
    };
    const party = active.state.party.map((member) => {
      const original = state.party.find(({ id }) => id === member.id);
      if (!original) return member as PlayerCharacter;
      const missingHp = Math.max(0, member.stats.maxHp - member.hp);
      const missingMp = Math.max(0, member.stats.maxMp - member.mp);
      // Floor at 1. resolveOutcome checks enemies before party, so a damage-over-time
      // tick that kills both sides in the same round reports "victory" with a dead
      // party; without this floor that 0 HP persists and the next startEncounter
      // throws "Combat requires at least one living combatant on each side".
      return grantExperience({
        ...original,
        hp: Math.max(1, original.stats.maxHp - missingHp),
        mp: Math.max(0, original.stats.maxMp - missingMp),
        statuses: member.statuses
      }, reward.experience).character;
    });
    let inventory = state.inventory;
    if (reward.itemRoll < 350) inventory = this.addWithinStackLimit(inventory, "item.root-tonic", 1);
    let progress = state.quests;
    let flags = state.world.flags;
    for (const enemyId of new Set(encounter.enemyIds)) {
      const defeatedThisBattle = encounter.enemyIds.filter((id) => id === enemyId).length;
      const countFlag = `progress.defeat.${enemyId}`;
      const lifetimeCount = Number(flags[countFlag] ?? 0) + defeatedThisBattle;
      flags = { ...flags, [countFlag]: lifetimeCount };
      progress = this.applyObjectiveToActiveQuests(progress, "defeat", enemyId, lifetimeCount);
    }
    // A `survive` step is satisfied by lasting the authored number of rounds in
    // a named encounter, so an objective can ask the player to endure rather
    // than to kill.
    progress = this.applyObjectiveToActiveQuests(
      progress,
      "survive",
      active.encounterId,
      active.state.round
    );
    // Ordinary encounters are explicitly repeatable gameplay abstractions.
    // Bosses cannot be started again once defeated, so their drops remain
    // naturally one-time without suppressing the materials needed by quests.
    for (const [itemId, quantity] of encounterFinds[encounter.id] ?? []) {
      inventory = this.addWithinStackLimit(inventory, itemId, quantity);
    }
    const defeatedBossIds = encounter.boss && !state.world.defeatedBossIds.includes(encounter.id)
      ? [...state.world.defeatedBossIds, encounter.id]
      : state.world.defeatedBossIds;
    this.#state = {
      ...state,
      party,
      inventory,
      quests: progress,
      world: {
        ...state.world,
        defeatedBossIds,
        flags: {
          ...flags,
          currency: Number(flags.currency ?? 0) + reward.currency
        },
        chronicle: encounter.boss ? [...state.world.chronicle, {
          id: crypto.randomUUID(),
          worldMinute: state.world.worldMinutes,
          title: encounter.name,
          body: `${encounter.name} fell, and the world kept the mark.`,
          tags: ["battle", "boss"]
        }] : state.world.chronicle
      }
    };
    this.applyInventoryObjectives();
    this.advanceCampaign();
    this.applyCompletedQuestRewards();
    active.phase = "victory";
    active.log.push(`Victory. The party earns ${reward.experience} experience and ${reward.currency} marks.`);
    await this.persist("autosave");
  }

  private applyObjectiveToActiveQuests(
    progress: GameState["quests"],
    kind: QuestDefinition["steps"][number]["kind"],
    targetId: string,
    count = 1,
    excludedQuestIds: ReadonlySet<string> = new Set()
  ): GameState["quests"] {
    let next = progress;
    for (const definition of quests) {
      if (excludedQuestIds.has(definition.id)) continue;
      const entry = next.find(({ questId }) => questId === definition.id);
      const firstObjective = definition.steps[0];
      if (
        entry?.state === "available"
        && firstObjective?.kind === kind
        && firstObjective.targetId === targetId
      ) {
        next = startQuest(next, definition.id);
      }
      next = applyQuestObjective(next, definition, { kind, targetId, count });
    }
    return next;
  }

  private isAwaitingConcordChoice(progress: GameState["quests"], npcId: string): boolean {
    if (npcId !== CONCORD_FINAL_NPC) return false;
    if (CONCORD_CHOICES.some(({ id }) => this.#state?.world.flags[id] === true)) return false;
    const definition = quests.find(({ id }) => id === CONCORD_QUEST);
    const entry = progress.find(({ questId }) => questId === CONCORD_QUEST);
    const objective = definition?.steps[entry?.currentStep ?? -1];
    return entry?.state === "active"
      && objective?.kind === "talk"
      && objective.targetId === CONCORD_FINAL_NPC;
  }

  private backfillLegacyEndingChoice(): boolean {
    const state = this.#state;
    if (!state) return false;
    const finalQuestComplete = state.quests.some(
      ({ questId, state: questState }) => questId === CONCORD_QUEST && questState === "completed"
    );
    const hasEndingChoice = CONCORD_CHOICES.some(({ id }) => state.world.flags[id] === true);
    if (!finalQuestComplete || hasEndingChoice) return false;
    this.#state = {
      ...state,
      world: {
        ...state.world,
        flags: {
          ...state.world.flags,
          "ending.concord-remade": true
        }
      }
    };
    return true;
  }

  /**
   * Fails any active quest whose authored failure condition now holds, and
   * unlocks its recovery branch. GAME_DESIGN promises that main-story failure
   * always exposes a recovery path; the engine's failQuest/resetFailedQuest
   * pair existed and was tested but had no caller anywhere, so the `failed`
   * state was unreachable and the promise was unimplemented.
   */
  private applyQuestFailures(): boolean {
    const state = this.#state;
    if (!state) return false;
    let progress = state.quests;
    let changed = false;
    for (const definition of quests) {
      const failure = definition.failure;
      if (!failure) continue;
      const entry = progress.find(({ questId }) => questId === definition.id);
      if (entry?.state !== "active") continue;
      if (state.world.flags[failure.whenFlag] !== failure.equals) continue;
      progress = failQuest(progress, definition.id);
      changed = true;
      if (failure.recoveryQuestId) {
        progress = progress.map((quest) =>
          quest.questId === failure.recoveryQuestId && quest.state === "locked"
            ? { ...quest, state: "available" as const }
            : quest
        );
      }
    }
    if (changed) this.#state = { ...state, quests: progress };
    return changed;
  }

  private advanceCampaign(): void {
    if (!this.#state) return;
    this.applyQuestFailures();
    let progress = refreshQuestAvailability(this.#state.quests, quests, this.#state.world.flags);
    const nextMain = quests.find((definition) =>
      definition.mainStory && progress.some((entry) => entry.questId === definition.id && entry.state === "available")
    );
    if (nextMain) {
      progress = startQuest(progress, nextMain.id);
      // Credit a first objective the player has already satisfied. A quest that
      // starts while standing in the location it asks you to travel to reads as
      // broken, even though walking out and back would clear it.
      progress = this.applyObjectiveToActiveQuests(
        progress,
        "travel",
        this.#state.world.currentLocationId,
        1
      );
    }
    this.#state = { ...this.#state, quests: progress };
  }

  /**
   * A `deliver` step completes when the player brings the named item to the
   * named recipient, and consumes what was handed over. This is what separates
   * it from `collect`, which the objective vocabulary was 76% composed of:
   * delivery gives the item a destination and takes it back out of the pack.
   */
  private applyDeliveryObjectives(npcId: string): void {
    const state = this.#state;
    if (!state) return;
    let progress = state.quests;
    let inventory = state.inventory;
    let changed = false;

    for (const definition of quests) {
      const entry = progress.find(({ questId }) => questId === definition.id);
      if (entry?.state !== "active") continue;
      const step = definition.steps[entry.currentStep];
      if (step?.kind !== "deliver" || step.recipientId !== npcId) continue;
      const required = Math.max(1, step.count);
      if (inventoryQuantity(inventory, step.targetId) < required) continue;

      for (let taken = 0; taken < required; taken += 1) {
        inventory = removeItem(inventory, step.targetId);
      }
      progress = applyQuestObjective(progress, definition, {
        kind: "deliver",
        targetId: step.targetId,
        count: required
      });
      changed = true;
    }

    if (changed) this.#state = { ...state, quests: progress, inventory };
  }

  private applyInventoryObjectives(): void {
    if (!this.#state) return;
    let progress = this.#state.quests;
    for (const stack of this.#state.inventory) {
      progress = this.applyObjectiveToActiveQuests(
        progress,
        "collect",
        stack.itemId,
        stack.quantity
      );
    }
    this.#state = { ...this.#state, quests: progress };
  }

  /**
   * Quest rewards are canonical campaign state, so a completed quest is paid
   * from its stable seed once and marked in the saved world flags. This also
   * lets older saves with completed-but-unpaid quests recover safely.
   */
  private applyCompletedQuestRewards(): boolean {
    const state = this.#state;
    if (!state) return false;
    const averageLevel = Math.max(
      1,
      Math.round(state.party.reduce((sum, member) => sum + member.level, 0) / state.party.length)
    );
    let party = state.party;
    let inventory = state.inventory;
    let flags = state.world.flags;
    let chronicle = state.world.chronicle;
    let relationships = state.world.relationships;
    let factionStanding = state.world.factionStanding;
    let changed = false;

    for (const definition of quests) {
      const progress = state.quests.find(({ questId }) => questId === definition.id);
      const rewardFlag = `content.quest-reward.${definition.id}`;
      const consequenceFlag = `content.quest-consequence.${definition.id}`;
      if (progress?.state !== "completed") continue;

      if (flags[consequenceFlag] !== true) {
        changed = true;
        const consequenceWorld = applyQuestConsequences(
          {
            ...state.world,
            flags,
            chronicle,
            relationships,
            factionStanding
          },
          definition.consequences
        );
        relationships = consequenceWorld.relationships;
        factionStanding = consequenceWorld.factionStanding;
        flags = { ...consequenceWorld.flags, [consequenceFlag]: true };
      }

      if (flags[rewardFlag] !== true) {
        changed = true;
        const reward = calculateBattleReward(
          definition.rewardTier,
          averageLevel,
          `${state.seed}:quest:${definition.id}`
        );
        party = party.map((member) => grantExperience(member, reward.experience).character);
        if (reward.itemRoll < 350) {
          inventory = this.addWithinStackLimit(inventory, "item.root-tonic", 1);
        }
        flags = {
          ...flags,
          [rewardFlag]: true,
          currency: Number(flags.currency ?? 0) + reward.currency
        };
        chronicle = [...chronicle, {
          id: crypto.randomUUID(),
          worldMinute: state.world.worldMinutes,
          title: `${definition.title} resolved`,
          body: `The party claimed the reward for ${definition.title}.`,
          tags: ["quest", "reward", definition.rewardTier]
        }];
      }
    }

    if (!changed) return false;
    this.#state = {
      ...state,
      party,
      inventory,
      world: {
        ...state.world,
        flags,
        chronicle,
        relationships,
        factionStanding
      }
    };
    return true;
  }

  private addWithinStackLimit(
    inventory: GameState["inventory"],
    itemId: string,
    quantity: number
  ): GameState["inventory"] {
    const room = 99 - inventoryQuantity(inventory, itemId);
    return room > 0 ? addItem(inventory, itemId, Math.min(quantity, room)) : inventory;
  }

  private firstLivingPartyIndex(party: readonly Combatant[]): number {
    const index = party.findIndex(({ hp }) => hp > 0);
    if (index < 0) throw new Error("A battle requires a living party member");
    return index;
  }

  private applyBossPhaseTransitions(active: ActiveBattle): void {
    if (active.state.outcome !== "ongoing") return;
    const candidates = bossPhases
      .filter((phase) =>
        phase.encounterId === active.encounterId
        && !active.activatedBossPhases.includes(phase.phaseName)
      )
      .sort((left, right) => right.beginsAtHealthPercent - left.beginsAtHealthPercent);
    for (const phase of candidates) {
      const enemyIndex = active.state.enemies.findIndex(({ id }) => id.startsWith(`${phase.enemyId}.`));
      const enemy = active.state.enemies[enemyIndex];
      if (!enemy || enemy.hp <= 0 || enemy.hp / enemy.stats.maxHp * 100 > phase.beginsAtHealthPercent) continue;
      const empowered = {
        ...enemy,
        stats: { ...enemy.stats },
        elements: { ...enemy.elements },
        statuses: enemy.statuses.map((status) => ({ ...status }))
      };
      let party = active.state.party;
      if (phase.mechanic === "empower") {
        empowered.stats.strength += 3;
        empowered.stats.agility += 2;
        empowered.stats.intellect += 3;
      } else if (phase.mechanic === "fortify") {
        empowered.stats.vitality += 4;
        empowered.stats.wisdom += 4;
      } else if (phase.mechanic === "root_party") {
        party = party.map((member) => member.hp > 0
          ? {
              ...member,
              statuses: [
                ...member.statuses.filter(({ id }) => id !== "freeze"),
                { id: "freeze" as const, remainingTurns: 2, potency: 0 }
              ]
            }
          : member);
      } else if (phase.mechanic === "scorch_party") {
        party = party.map((member) => member.hp > 0
          ? {
              ...member,
              statuses: [
                ...member.statuses.filter(({ id }) => id !== "burn"),
                { id: "burn" as const, remainingTurns: 2, potency: 4 }
              ]
            }
          : member);
      } else if (phase.mechanic === "restore_boss") {
        empowered.hp = Math.min(
          empowered.stats.maxHp,
          empowered.hp + Math.round(empowered.stats.maxHp * 0.15)
        );
      } else if (phase.mechanic === "elemental_shift") {
        empowered.elements = {
          ...empowered.elements,
          nature: 0.4,
          fire: 0.4,
          aether: -0.25
        };
      }
      active.state = {
        ...active.state,
        party,
        enemies: active.state.enemies.map((candidate, index) => index === enemyIndex ? empowered : candidate)
      };
      active.activatedBossPhases.push(phase.phaseName);
      active.log.push(`${phase.phaseName}: ${phase.telegraph}`);
      active.log.push(phase.tacticalChange);
    }
  }

  /** Returns true when another living party member must act before enemies. */
  private advancePartyTurn(active: ActiveBattle): boolean {
    for (let index = active.partyTurnIndex + 1; index < active.state.party.length; index += 1) {
      const member = active.state.party[index];
      if (member && member.hp > 0) {
        active.partyTurnIndex = index;
        return true;
      }
    }
    return false;
  }

  private findFlag(source: "location" | "encounter", id: string): string {
    return `content.find.${source}.${id}`;
  }

  private enqueueNarrativeCheckpoint(
    kind: "unexpected_action" | "relationship_change" | "quest_outcome" | "world_event",
    summary: string
  ): void {
    if (!this.#state) return;
    const trigger = {
      id: crypto.randomUUID(),
      kind,
      summary,
      actorIds: this.#state.party.map(({ id }) => id),
      locationId: this.#state.world.currentLocationId,
      worldMinute: this.#state.world.worldMinutes,
      createdAt: new Date().toISOString()
    } as const;
    this.#state = {
      ...this.#state,
      pendingTriggers: [...this.#state.pendingTriggers, trigger]
    };
    const context: NarrativeContext = {
      promptVersion: "living-world-v1",
      canonSummary: "Yggdrasil is an original living world tree. The Rootbound Concord is failing as rootways are deliberately severed.",
      trigger,
      worldDigest: JSON.stringify({
        location: this.#state.world.currentLocationId,
        flags: this.#state.world.flags,
        quests: this.#state.quests.filter(({ state }) => state === "active" || state === "completed")
      }),
      relevantFlags: this.#state.world.flags,
      npcMemories: this.#state.world.relationships.map(({ npcId }) => ({ npcId, memories: [] })),
      factionState: this.#state.world.factionStanding,
      availableResources: {
        assetTags: [...new Set(npcs.map(({ assetTag }) => assetTag))],
        encounterIds: encounters.map(({ id }) => id),
        rewardTiers: ["minor", "standard", "major", "boss"]
      }
    };
    void this.#narrative.enqueue(context).then(async ({ patch, report }) => {
      if (!this.#state) return;
      const applied = applyGeneratedPatch(this.#state, patch, report);
      if (applied.applied) {
        this.#state = applied.state;
        await this.persist("autosave");
      }
    });
  }

  /**
   * Reports which slot the status refers to so a failed manual save is not
   * rendered as an autosave failure, and marks storage unavailable on failure
   * so the UI can say why saving stopped working.
   */
  private async persist(slot: SaveSlot): Promise<boolean> {
    if (!this.#state) return false;
    this.#autosave = "saving";
    this.#autosaveSlot = slot;
    this.emit();
    try {
      const record = await this.#saves.save(slot, this.#state);
      this.#saveSlots.add(slot);
      this.#saveSummaries = [
        ...this.#saveSummaries.filter((entry) => entry.slot !== slot),
        {
          slot,
          updatedAt: record.updatedAt,
          locationName: locations.find(({ id }) => id === this.#state?.world.currentLocationId)?.name
            ?? this.#state.world.currentLocationId,
          partyLevel: Math.max(...this.#state.party.map((member) => member.level)),
          playTimeMinutes: this.#state.world.worldMinutes
        }
      ];
      this.#hasSave = this.#saveSlots.has("autosave");
      this.#storageAvailable = true;
      this.#autosave = "saved";
      this.emit();
      return true;
    } catch (error) {
      console.error(`Save failed for slot '${slot}'`, error);
      this.#autosave = "error";
      this.#storageAvailable = false;
      this.emit();
      return false;
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }

  private toPartyView(member: PlayerCharacter, index: number): PartyMemberView {
    const tints = [0x72d6a1, 0xe8a95a, 0x8eb7df, 0xc29adb];
    const baseJobId = baseJobIdFor(member.jobId);
    const baseJob = jobs.find(({ id }) => id === baseJobId);
    const displayStats = deriveCharacterCombatStats(member, EQUIPMENT);
    const displayHp = Math.max(0, displayStats.maxHp - (member.stats.maxHp - member.hp));
    const displayMp = Math.max(0, displayStats.maxMp - (member.stats.maxMp - member.mp));
    const ancestryName = ancestries.find(({ id }) => id === member.raceId)?.name ?? member.raceId;
    const jobName = advancedJobs.find(({ id }) => id === member.jobId)?.name
      ?? jobs.find(({ id }) => id === member.jobId)?.name
      ?? member.jobId;
    const equipment = Object.fromEntries(
      Object.entries(member.equipment).flatMap(([slot, itemId]) => {
        const item = items.find(({ id }) => id === itemId);
        return item ? [[slot, { itemId, name: item.name }]] : [];
      })
    ) as PartyMemberView["equipment"];
    const jobOptions = baseJob === undefined ? [] : [
      {
        id: baseJob.id,
        name: baseJob.name,
        state: member.jobId === baseJob.id ? "active" as const : "unlocked" as const,
        requirement: "Starting job"
      },
      ...advancedJobs
        .filter((job) => job.baseJobId === baseJob.id)
        .map((job) => {
          const unlocked = this.#state?.world.flags[jobUnlockFlag(member.id, job.id)] === true;
          return {
            id: job.id,
            name: job.name,
            state: member.jobId === job.id
              ? "active" as const
              : unlocked
                ? "unlocked" as const
                : member.level >= job.minimumLevel
                  ? "available" as const
                  : "locked" as const,
            requirement: unlocked ? "Unlocked" : `Level ${job.minimumLevel}`
          };
        })
    ];
    return {
      id: member.id,
      name: member.name,
      ancestry: ancestryName,
      job: jobName,
      level: member.level,
      hp: displayHp,
      maxHp: displayStats.maxHp,
      mp: displayMp,
      maxMp: displayStats.maxMp,
      portraitTint: tints[index % tints.length] ?? 0xffffff,
      stats: {
        strength: displayStats.strength,
        dexterity: displayStats.dexterity,
        agility: displayStats.agility,
        vitality: displayStats.vitality,
        intellect: displayStats.intellect,
        wisdom: displayStats.wisdom,
        charisma: displayStats.charisma
      },
      equipment,
      jobOptions
    };
  }

  private toQuestView(definition: QuestDefinition, currentStep: number, state: QuestView["state"]): QuestView {
    const objective = definition.steps[currentStep];
    const target = objective?.targetId.replace(/^(npc|enemy|item|location)\./, "").replaceAll("-", " ");
    return {
      id: definition.id,
      title: definition.title,
      summary: definition.summary,
      state,
      objective: objective ? `${objective.kind} ${objective.count > 1 ? `${objective.count} × ` : ""}${target}` : "Completed",
      objectiveKind: objective?.kind,
      objectiveTargetId: objective?.targetId
    };
  }

  private toShopView(vendorId: string): ShopView | undefined {
    const vendor = vendorProfiles.find(({ id }) => id === vendorId);
    if (!vendor || !this.#state) return undefined;
    const inventory = this.#state.inventory;
    const catalog: ShopEntryView[] = vendor.catalogItemIds.flatMap((itemId) => {
      const definition = items.find(({ id }) => id === itemId);
      if (!definition || definition.kind === "key") return [];
      const ownedQuantity = inventoryQuantity(inventory, itemId);
      return [{
        itemId,
        name: definition.name,
        description: definition.description,
        kind: definition.kind,
        buyPrice: definition.value,
        sellPrice: ownedQuantity > 0 ? Math.max(1, Math.round(definition.value * vendor.sellRate)) : undefined,
        ownedQuantity
      }];
    });
    return { vendorId: vendor.id, shopName: vendor.shopName, catalog };
  }

  private toBattleView(active: ActiveBattle): BattleView {
    const encounter = encounters.find(({ id }) => id === active.encounterId);
    const roster = this.#state?.party ?? [];
    const acting = active.state.party[active.partyTurnIndex];
    const toStatuses = (combatant: Combatant): BattleStatusView[] =>
      combatant.statuses.map((status) => ({
        id: status.id,
        remainingTurns: status.remainingTurns,
        label: STATUS_LABELS[status.id]
      }));
    return {
      encounterId: active.encounterId,
      title: encounter?.name ?? "Encounter",
      phase: active.phase,
      actors: [...active.state.party, ...active.state.enemies].map((actor) => {
        const shared = {
          id: actor.id,
          name: actor.name,
          hp: actor.hp,
          maxHp: actor.stats.maxHp,
          mp: actor.mp,
          maxMp: actor.stats.maxMp,
          statuses: toStatuses(actor),
          alive: actor.hp > 0,
          targetable: actor.hp > 0
        };
        if (actor.isPlayerControlled) {
          const member = roster.find(({ id }) => id === actor.id);
          return {
            ...shared,
            isParty: true,
            knownWeaknesses: [],
            knownResistances: [],
            spriteKey: member ? spriteKeyForJob(member.jobId) : "sprite.player",
            tint: member ? ANCESTRY_TINTS[member.raceId] ?? 0xffffff : 0xffffff
          };
        }
        const contentId = enemyContentId(actor.id);
        const { spriteKey, tint } = spriteForEnemyId(contentId);
        const known = this.knownElementsFor(contentId);
        return {
          ...shared,
          isParty: false,
          knownWeaknesses: known.weaknesses,
          knownResistances: known.resistances,
          spriteKey,
          tint
        };
      }),
      activeActorId: active.phase === "choosing" ? acting?.id : undefined,
      activeSkills: acting
        ? acting.skills
          .map((skillId) => SKILLS[skillId])
          .filter((skill): skill is CombatSkill => skill !== undefined)
          .map((skill) => ({
            id: skill.id,
            name: skill.name,
            mpCost: skill.mpCost,
            element: skill.element,
            power: skill.power,
            target: skill.target,
            status: skill.status?.id,
            affordable: acting.mp >= skill.mpCost
          }))
        : [],
      activeItems: (this.#state?.inventory ?? [])
        .filter(({ itemId }) => RECOVERY_ITEMS[itemId] || STATUS_CURE_ITEMS[itemId])
        .map(({ itemId, quantity }) => {
          const definition = items.find(({ id }) => id === itemId);
          return {
            id: itemId,
            name: definition?.name ?? itemId,
            description: definition?.description ?? "",
            quantity,
            target: "ally" as const
          };
        }),
      events: active.events.map((event) => this.toBattleEventView(event)),
      turnOrder: getInitiativeOrder(active.state),
      bossPhase: active.activatedBossPhases.at(-1),
      escapable: !encounter?.boss,
      log: active.log.slice(-8),
      round: active.state.round
    };
  }

  /** Structural projection of an engine event; the prose form stays in describeEvent for the log. */
  private toBattleEventView(event: CombatEvent): BattleEventView {
    if (event.type === "battle_ended") {
      return { type: "battle_ended", outcome: event.outcome };
    }
    return event as BattleEventView;
  }

  private describeEvent(event: CombatEvent, state: CombatState): string {
    const actors = [...state.party, ...state.enemies];
    const name = (id: string): string => actors.find((actor) => actor.id === id)?.name ?? id;
    switch (event.type) {
      case "damage":
        return `${name(event.actorId)} deals ${event.amount} ${event.element} damage to ${name(event.targetId)}${event.critical ? " — critical!" : "."}`;
      case "healing":
        return `${name(event.actorId)} restores ${event.amount} vitality to ${name(event.targetId)}.`;
      case "miss":
        return `${name(event.actorId)} misses ${name(event.targetId)}.`;
      case "guard":
        return `${name(event.actorId)} guards.`;
      case "status_applied":
        return `${name(event.targetId)} is afflicted by ${event.status}.`;
      case "status_damage":
        return `${name(event.targetId)} suffers ${event.amount} ${event.status} damage.`;
      case "status_expired":
        return `${event.status} fades from ${name(event.targetId)}.`;
      case "insufficient_mp":
        return `${name(event.actorId)} lacks the focus for ${event.skillId}.`;
      case "incapacitated":
        return `${name(event.actorId)} loses the turn to ${event.status}.`;
      case "battle_ended":
        return event.outcome === "victory" ? "The last enemy falls." : "The party can fight no longer.";
    }
  }
}
