import { z } from "zod";
import { generatedContentPatchSchema, narrativeTriggerSchema } from "../shared/schemas";
import type { GameState } from "../shared/types";
import { CURRENT_GAME_SCHEMA_VERSION } from "../engine/state";

const elementSchema = z.enum([
  "physical",
  "fire",
  "water",
  "ice",
  "earth",
  "wind",
  "lightning",
  "radiant",
  "shadow",
  "aether",
  "nature"
]);

const statsSchema = z.object({
  maxHp: z.number().int().positive(),
  maxMp: z.number().int().nonnegative(),
  strength: z.number().int().nonnegative(),
  dexterity: z.number().int().nonnegative(),
  agility: z.number().int().nonnegative(),
  vitality: z.number().int().nonnegative(),
  intellect: z.number().int().nonnegative(),
  wisdom: z.number().int().nonnegative(),
  charisma: z.number().int().nonnegative()
}).strict();

const statusIdSchema = z.enum([
  "guard",
  "poison",
  "burn",
  "bleed",
  "stun",
  "sleep",
  "freeze",
  "weaken",
  "fortify",
  "haste",
  "slow"
]);

const statusSchema = z.object({
  id: statusIdSchema,
  remainingTurns: z.number().int().positive(),
  potency: z.number().nonnegative()
}).strict();

const playerCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().positive(),
  stats: statsSchema,
  hp: z.number().int().nonnegative(),
  mp: z.number().int().nonnegative(),
  skills: z.array(z.string()),
  elements: z.partialRecord(elementSchema, z.number().min(-1).max(1)),
  statuses: z.array(statusSchema),
  // Optional to match the contract: characters created before Wave 2, and every
  // character the game authors today, simply have no resistances.
  statusResistance: z.partialRecord(statusIdSchema, z.number().min(0).max(1)).optional(),
  isPlayerControlled: z.boolean(),
  raceId: z.string().min(1),
  jobId: z.string().min(1),
  experience: z.number().int().nonnegative(),
  equipment: z.object({
    weapon: z.string().optional(),
    armor: z.string().optional(),
    accessory: z.string().optional()
  }).strict()
}).strict().superRefine((character, context) => {
  if (character.hp > character.stats.maxHp) {
    context.addIssue({ code: "custom", message: "hp exceeds maxHp", path: ["hp"] });
  }
  if (character.mp > character.stats.maxMp) {
    context.addIssue({ code: "custom", message: "mp exceeds maxMp", path: ["mp"] });
  }
});

const questProgressSchema = z.object({
  questId: z.string().min(1),
  state: z.enum(["locked", "available", "active", "completed", "failed"]),
  currentStep: z.number().int().nonnegative()
}).strict();

const relationshipSchema = z.object({
  npcId: z.string().min(1),
  trust: z.number().int().min(-100).max(100),
  respect: z.number().int().min(-100).max(100),
  fear: z.number().int().min(-100).max(100)
}).strict();

const chronicleEntrySchema = z.object({
  id: z.string().min(1),
  worldMinute: z.number().int().nonnegative(),
  title: z.string().min(1),
  body: z.string(),
  tags: z.array(z.string())
}).strict();

const worldStateSchema = z.object({
  currentLocationId: z.string().min(1),
  discoveredLocationIds: z.array(z.string()),
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  defeatedBossIds: z.array(z.string()),
  factionStanding: z.record(z.string(), z.number().min(-100).max(100)),
  relationships: z.array(relationshipSchema),
  chronicle: z.array(chronicleEntrySchema),
  worldMinutes: z.number().int().nonnegative()
}).strict();

export const gameStateSchema = z.object({
  schemaVersion: z.literal(CURRENT_GAME_SCHEMA_VERSION),
  seed: z.string().min(1),
  contentPackVersions: z.record(z.string(), z.string().min(1)),
  party: z.array(playerCharacterSchema).min(1).max(4),
  reserve: z.array(playerCharacterSchema),
  inventory: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().positive().max(99)
  }).strict()),
  quests: z.array(questProgressSchema),
  world: worldStateSchema,
  generatedPatches: z.array(generatedContentPatchSchema),
  pendingTriggers: z.array(narrativeTriggerSchema)
}).strict().superRefine((state, context) => {
  const characterIds = [...state.party, ...state.reserve].map((character) => character.id);
  if (new Set(characterIds).size !== characterIds.length) {
    context.addIssue({ code: "custom", message: "Character IDs must be unique", path: ["party"] });
  }
  const inventoryIds = state.inventory.map((stack) => stack.itemId);
  if (new Set(inventoryIds).size !== inventoryIds.length) {
    context.addIssue({ code: "custom", message: "Inventory contains duplicate stacks", path: ["inventory"] });
  }
});

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/** Pre-versioned saves: backfill the fields v1 assumes exist. */
function migrateVersionZero(input: Record<string, unknown>): Record<string, unknown> {
  const world = isRecord(input.world) ? input.world : {};
  return {
    ...input,
    schemaVersion: 1,
    contentPackVersions: isRecord(input.contentPackVersions) ? input.contentPackVersions : {},
    generatedPatches: Array.isArray(input.generatedPatches) ? input.generatedPatches : [],
    pendingTriggers: Array.isArray(input.pendingTriggers) ? input.pendingTriggers : [],
    world: {
      ...world,
      flags: isRecord(world.flags) ? world.flags : {},
      defeatedBossIds: Array.isArray(world.defeatedBossIds) ? world.defeatedBossIds : [],
      factionStanding: isRecord(world.factionStanding) ? world.factionStanding : {},
      relationships: Array.isArray(world.relationships) ? world.relationships : [],
      chronicle: Array.isArray(world.chronicle) ? world.chronicle : [],
      worldMinutes: typeof world.worldMinutes === "number" ? world.worldMinutes : 0
    }
  };
}

/**
 * v1 to v2. Adds the combat surface Wave 2 introduces: per-combatant status
 * resistance, and the four buff/debuff statuses. Existing combatants get an
 * empty resistance map, which is the documented "author enemies only" default,
 * so a v1 save keeps playing with identical numbers.
 */
function migrateVersionOne(input: Record<string, unknown>): Record<string, unknown> {
  const withResistance = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    return { ...value, statusResistance: isRecord(value.statusResistance) ? value.statusResistance : {} };
  };
  return {
    ...input,
    schemaVersion: 2,
    party: Array.isArray(input.party) ? input.party.map(withResistance) : input.party,
    reserve: Array.isArray(input.reserve) ? input.reserve.map(withResistance) : input.reserve
  };
}

/**
 * One entry per version transition, keyed by the version being migrated FROM.
 * The ladder is walked one rung at a time, so adding a schema version means
 * adding exactly one function here.
 *
 * The previous shape hardcoded a single 0-to-current step, which meant the
 * first ordinary version bump would have invalidated every save on disk: a v1
 * record was passed through untouched and then failed the `z.literal(2)` check.
 */
const MIGRATIONS: Readonly<Record<number, (input: Record<string, unknown>) => Record<string, unknown>>> = {
  0: migrateVersionZero,
  1: migrateVersionOne
};

export function migrateGameState(input: unknown): GameState {
  if (!isRecord(input)) {
    throw new Error("Save state must be an object");
  }
  let version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;
  if (version > CURRENT_GAME_SCHEMA_VERSION) {
    throw new Error(`Save schema version ${version} is newer than supported version ${CURRENT_GAME_SCHEMA_VERSION}`);
  }
  let migrated: Record<string, unknown> = input;
  while (version < CURRENT_GAME_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new Error(`No migration path from save schema version ${version} to ${CURRENT_GAME_SCHEMA_VERSION}`);
    }
    migrated = step(migrated);
    const next = typeof migrated.schemaVersion === "number" ? migrated.schemaVersion : version + 1;
    if (next <= version) {
      throw new Error(`Migration from version ${version} did not advance the schema version`);
    }
    version = next;
  }
  return gameStateSchema.parse(migrated) as GameState;
}

export function validateGameState(input: unknown): GameState {
  return gameStateSchema.parse(input) as GameState;
}

