import type {
  EntityId,
  GameState,
  PlayerCharacter,
  QuestDefinition
} from "../shared/types";
import { createQuestProgress } from "./quests";

export const CURRENT_GAME_SCHEMA_VERSION = 1;

export interface InitialGameStateOptions {
  readonly seed: string;
  readonly startingLocationId: EntityId;
  readonly party: readonly PlayerCharacter[];
  readonly reserve?: readonly PlayerCharacter[];
  readonly contentPackVersions: Readonly<Record<string, string>>;
  readonly quests?: readonly QuestDefinition[];
}

function copyCharacter(character: PlayerCharacter): PlayerCharacter {
  return {
    ...character,
    stats: { ...character.stats },
    skills: [...character.skills],
    elements: { ...character.elements },
    statuses: character.statuses.map((status) => ({ ...status })),
    equipment: { ...character.equipment }
  };
}

export function createInitialGameState(options: InitialGameStateOptions): GameState {
  if (!options.seed.trim()) {
    throw new Error("A deterministic game seed is required");
  }
  if (options.party.length < 1 || options.party.length > 4) {
    throw new RangeError("The active party must contain between one and four characters");
  }
  const partyIds = new Set(options.party.map((character) => character.id));
  if (partyIds.size !== options.party.length) {
    throw new Error("Active party character IDs must be unique");
  }
  return {
    schemaVersion: CURRENT_GAME_SCHEMA_VERSION,
    seed: options.seed,
    contentPackVersions: { ...options.contentPackVersions },
    party: options.party.map(copyCharacter),
    reserve: (options.reserve ?? []).map(copyCharacter),
    inventory: [],
    quests: createQuestProgress(options.quests ?? []),
    world: {
      currentLocationId: options.startingLocationId,
      discoveredLocationIds: [options.startingLocationId],
      flags: {},
      defeatedBossIds: [],
      factionStanding: {},
      relationships: [],
      chronicle: [],
      worldMinutes: 0
    },
    generatedPatches: [],
    pendingTriggers: []
  };
}

