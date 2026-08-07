import {
  addItem,
  adjustFactionStanding,
  advanceCombatRound,
  applyQuestConsequences,
  applyQuestObjective,
  calculateBattleReward,
  chooseEnemyAction,
  createCombatState,
  createRng,
  createInitialGameState,
  deriveCharacterCombatStats,
  canEquipItem,
  equipItem,
  failQuest,
  getInitiativeOrder,
  getJobUnlockBlockers,
  grantExperience,
  inventoryQuantity,
  randomInt,
  reconcileContentPacks,
  refreshQuestAvailability,
  removeItem,
  resolveCombatAction,
  startQuest,
  totalExperienceForLevel,
  type CombatEvent,
  type CombatSkill,
  type CombatState
} from "../engine";
import { applyGeneratedPatch, NarrativeCheckpointQueue } from "../ai";
import {
  EQUIPMENT,
  isEquipmentItem,
  playerFromDraft,
  recruitCharacter,
  reviseStatsForJobChange,
  statsForBuild
} from "./characters";
import { enemyCombatant, enemyContentId } from "./enemies";
import { CONCORD_CHOICES, ENEMY_ELEMENTS, recipes, SKILLS, TRAIL_REMEDIES_FLAG, traitForAncestry, traitIdsForAncestry } from "../content";
import { canCraft, craftRecipe } from "../engine";
import { actionEconomyScale, difficultyOf, DIFFICULTY_REWARD_MULTIPLIER } from "../engine";
import {
  ANCESTRY_TINTS,
  baseJobIdFor,
  errorMessage,
  slotLabel,
  spriteForEnemyId,
  spriteKeyForJob,
  STATUS_LABELS,
  titleCase
} from "./presentation";
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
  levelUpSkillsFor,
  postgameEncounterIds,
  sceneFlagFor,
  scenesForTrigger,
  skillsLearnedBetween,
  quests,
  recruitProfiles,
  regions,
  startingBuildLoadouts,
  vendorProfiles,
  type SceneTrigger
} from "../content";
import type {
  BackupView,
  BattleAction,
  BattleView,
  CharacterCreationDraft,
  GameCommandResult,
  GameBridge,
  GameSaveSlot,
  GameSnapshot,
  InteractionView,
  PartyMemberView,
  BattleEventView,
  BattleStatusView,
  BuildPreview,
  PendingSceneView,
  QuestView,
  SaveSlotSummaryView,
  ShopEntryView,
  ShopView,
  SnapshotListener
} from "../game";
import { SaveRepository, type SaveBackup, type SaveSlot } from "../save";
import type {
  Combatant,
  Element,
  EncounterDefinition,
  GameState,
  NarrativeContext,
  PlayerCharacter,
  QuestDefinition,
  ItemDefinition,
  Stats,
  StatusInstance
} from "../shared/types";

const STARTING_LOCATION = "location.hearthcross";
/** Matches the save schema's `party` max; anyone beyond this waits in reserve. */
const ACTIVE_PARTY_LIMIT = 4;
/** Lodging in a settlement. Small enough to stay affordable, large enough to be a decision. */
const REST_PRICE = 30;
/** Consumed to camp outside a settlement; the anti-softlock floor for a stranded party. */
const CAMP_SUPPLY_ITEM = "item.trail-rations";

/** World flag recording that a location's curio has been claimed. */
function curioFlagFor(locationId: string): string {
  return `content.curio.${locationId}`;
}
const CORE_PACK_VERSION = "0.1.0";

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

/**
 * Mirrors the `npcMemories` cap in the narrative request contract
 * (server/contracts.ts). The context object is `.strict()`, so exceeding this
 * is not a truncation — it is a 400 that silently retires the feature.
 */
const NARRATIVE_NPC_MEMORY_LIMIT = 12;

function commandFailure(message: string): GameCommandResult {
  return { success: false, message };
}

/**
 * Carries a combatant's end-of-battle pool back onto the stored character.
 *
 * Battle stats are equipment-modified; stored stats are not, so the two cannot
 * be compared directly. Carrying the *deficit* is right when a piece of gear
 * raised the ceiling — the bonus pool is spent first, and unequipping does not
 * hand back health that was never in the base pool. It is wrong when gear
 * lowered one: a harness that cuts four maximum MP made a deficit measured
 * against 42 land on a base of 46, so every fight quietly refunded the
 * difference and the drawback cost nothing over a session.
 *
 * Taking the lower of the two readings — the raw end value, and the base pool
 * minus the deficit — is correct in both directions and identical to the old
 * behaviour when equipment changes no maxima at all.
 */
function carryBattlePool(endValue: number, battleMax: number, baseMax: number): number {
  const deficit = Math.max(0, battleMax - endValue);
  return Math.max(0, Math.min(endValue, baseMax - deficit));
}

/**
 * Describes one archived record, in isolation. A backup list is the recovery
 * route out of a bad save, so emptying the whole list on the first unreadable
 * archive hides exactly the records the player came looking for.
 */
function describeBackup(backup: SaveBackup): BackupView {
  const base = {
    id: backup.id,
    slot: backup.sourceSlot,
    slotLabel: slotLabel(backup.sourceSlot),
    backedUpAt: backup.backedUpAt
  };
  try {
    const world = backup.record.state.world;
    return {
      ...base,
      locationName: locations.find(({ id }) => id === world.currentLocationId)?.name ?? world.currentLocationId,
      partyLevel: backup.record.state.party.reduce((best, member) => Math.max(best, member.level), 1)
    };
  } catch {
    return { ...base, locationName: "unreadable archive", partyLevel: 0, damaged: true };
  }
}

function jobUnlockFlag(memberId: string, jobId: string): string {
  return `progression.job.${memberId}.${jobId}`;
}
/** What this build actually ships, for reconciliation against what a save was written with. */
const RUNNING_CONTENT_PACKS: Readonly<Record<string, string>> = {
  "core.yggdrasil-chronicles": CORE_PACK_VERSION
};
const FIRST_QUEST = "quest.first-silence";
const CONCORD_QUEST = "quest.a-new-concord";
const CONCORD_FINAL_NPC = "npc.sable-voss";
/** The astronomer speaks for the campaign's last decision, outside the ordinary NPC path. */
const SABLE_VOSS = npcs.find(({ id }) => id === CONCORD_FINAL_NPC);

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
  /** Which engagement of this encounter it is; folded into the seeds so repeats differ. */
  engagement: number;
  state: CombatState;
  phase: BattleView["phase"];
  log: string[];
  /** Index of the party member whose player turn is awaiting an action. */
  partyTurnIndex: number;
  /**
   * Party indices that have already acted this round. Whether somebody has had
   * their turn cannot be read off the initiative queue, because that queue is
   * recomputed from live statuses and a mid-round haste reorders it underneath.
   */
  actedPartyIndices: number[];
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
  /** Injectable so play-time accrual is testable without sleeping. */
  readonly #now: () => number;
  #lastPlayClockMs: number;
  #saveSummaries: SaveSlotSummaryView[] = [];
  /** A scripted scene waiting for the presentation layer to play it. */
  /**
   * Scripted scenes waiting to play, oldest first; the head is what the world
   * scene shows. This was a single slot, and `queueScene` returned early when
   * it was occupied — so a trigger that fired while another scene waited was
   * dropped, and a one-shot trigger (a boss falling) never came round again to
   * re-queue it. The authored beat was gone from that chronicle for good.
   */
  #sceneQueue: PendingSceneView[] = [];
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
  constructor(
    saves = new SaveRepository(),
    newSeed: () => string = () => crypto.randomUUID(),
    now: () => number = () => Date.now()
  ) {
    this.#saves = saves;
    this.#newSeed = newSeed;
    this.#now = now;
    this.#lastPlayClockMs = now();
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

  /**
   * Folds the wall-clock time since the last call into `world.playSeconds`.
   * Called on every persist, so the counter is accurate to the last save
   * without a per-frame tick, and a session that is never saved costs nothing.
   */
  private accrualPlaySeconds(state: GameState): GameState {
    const now = this.#now();
    const elapsed = Math.max(0, Math.floor((now - this.#lastPlayClockMs) / 1000));
    this.#lastPlayClockMs = now;
    if (elapsed === 0) return state;
    return { ...state, world: { ...state.world, playSeconds: state.world.playSeconds + elapsed } };
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
      playTimeMinutes: record.playTimeMinutes,
      worldMinutes: record.worldMinutes,
      damaged: record.damaged
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
      reserve: this.#state.reserve.map((member, index) => this.toPartyView(member, party.length + index)),
      pendingScene: this.playableScene(),
      discoveredLocations: this.#state.world.discoveredLocationIds
        .map((id) => locations.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is (typeof locations)[number] => candidate !== undefined)
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          regionName: regions.find(({ id }) => id === candidate.regionId)?.name ?? candidate.regionId,
          kind: candidate.kind,
          current: candidate.id === this.#state?.world.currentLocationId
        })),
      curioSearched: this.#state.world.flags[curioFlagFor(this.#state.world.currentLocationId)] === true,
      remedies: {
        unlocked: this.#state.world.flags[TRAIL_REMEDIES_FLAG] === true,
        recipes: recipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          outputName: items.find(({ id }) => id === recipe.outputItemId)?.name ?? recipe.outputItemId,
          outputQuantity: recipe.outputQuantity,
          craftable: canCraft(this.#state?.inventory ?? [], recipe),
          inputs: recipe.inputs.map((input) => ({
            name: items.find(({ id }) => id === input.itemId)?.name ?? input.itemId,
            need: input.quantity,
            have: this.#state?.inventory.find(({ itemId }) => itemId === input.itemId)?.quantity ?? 0
          }))
        }))
      },
      bestiary: this.buildBestiary(),
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
      quests: this.orderedQuestViews(),
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
      chronicleHint: this.#state.world.chronicle.at(-1)?.body ?? "The road is waiting.",
      campaignComplete: this.isCampaignComplete(this.#state)
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
      contentPackVersions: { ...RUNNING_CONTENT_PACKS },
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
    // A scene left waiting by the previous chronicle used to block this one's
    // prologue outright, because queueScene refused to queue while one pended.
    this.#sceneQueue = [];
    this.queueScene((trigger) => trigger.kind === "campaign_start");
    await this.persist("autosave");
  }

  /**
   * Starts a fresh chronicle carrying the finished run's growth forward:
   * levels, equipment and currency. Quests, world flags and location reset, so
   * the story is genuinely replayed rather than resumed.
   *
   * The snapshot is taken from the CURRENT state before newGame overwrites it,
   * which is why this reads `this.#state` first and only then delegates.
   */
  async newGamePlus(draft: CharacterCreationDraft): Promise<GameCommandResult> {
    const previous = this.#state;
    if (!previous) {
      return { success: false, message: "There is no finished chronicle to carry forward." };
    }
    if (!this.isCampaignComplete(previous)) {
      return { success: false, message: "New Game+ opens once the chronicle is finished." };
    }

    // Read everything worth carrying before the state is replaced.
    const carriedLevel = Math.max(1, ...previous.party.map(({ level }) => level));
    const carriedCurrency = Number(previous.world.flags.currency ?? 0);
    const carriedEquipment = previous.party
      .flatMap((member) => Object.values(member.equipment))
      .filter((itemId): itemId is string => typeof itemId === "string");
    const completedRuns = Number(previous.world.flags["progress.completed-runs"] ?? 0) + 1;

    await this.newGame(draft);
    const fresh = this.requireState();

    // Level restore runs through the real progression path so stats grow with
    // the level rather than the number being written on its own.
    // Carried characters know the forms their level has already taught them;
    // arriving at level 18 with only the two creation forms would be a silent
    // downgrade from the run being carried.
    const party = fresh.party.map((member) => {
      const grown = grantExperience(member, totalExperienceForLevel(carriedLevel)).character;
      const taught = levelUpSkillsFor(baseJobIdFor(grown.jobId), grown.level)
        .filter((skillId) => SKILLS[skillId] && !grown.skills.includes(skillId));
      return taught.length > 0 ? { ...grown, skills: [...grown.skills, ...taught] } : grown;
    });
    let inventory = fresh.inventory;
    for (const itemId of carriedEquipment) {
      inventory = this.addWithinStackLimit(inventory, itemId, 1);
    }

    this.#state = {
      ...fresh,
      party,
      inventory,
      world: {
        ...fresh.world,
        flags: {
          ...fresh.world.flags,
          currency: Number.isFinite(carriedCurrency) ? Math.max(0, carriedCurrency) : 0,
          "progress.completed-runs": completedRuns,
          "progress.new-game-plus": true
        },
        chronicle: [{
          id: crypto.randomUUID(),
          worldMinute: 0,
          title: "The Road Begins Again",
          body: `${draft.name || "Rowan"} walks a familiar road carrying what the last chronicle taught.`,
          tags: ["new-game-plus", "hearthcross"]
        }]
      }
    };
    await this.persist("autosave");
    return { success: true, message: `A new chronicle begins at level ${carriedLevel}.` };
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
    // Whatever the previous chronicle was in the middle of does not belong to
    // this one: a half-finished battle and a queued scene both survived a load.
    this.#battle = undefined;
    this.#sceneQueue = [];
    this.#saveSlots.add(slot);
    this.#hasSave = true;
    this.#lastPlayClockMs = this.#now();
    // A chronicle that reached Emberwake before this system shipped has
    // earned the ledger; grant it on load rather than never.
    if (loaded.world.discoveredLocationIds.includes("location.emberwake")) {
      this.unlockTrailRemedies("location.emberwake");
    }
    // Re-check what the party is carrying and wearing. A chronicle stalled by
    // an objective that only counted the pack — its quest item worn rather than
    // stowed — recovers on load rather than never, the same way the remedies
    // ledger above is granted to a save that predates it.
    this.applyInventoryObjectives();
    const recoveredCanonicalState = this.applyCompletedQuestRewards();
    const recoveredLegacyEnding = this.backfillLegacyEndingChoice();
    if (recoveredCanonicalState || recoveredLegacyEnding) await this.persist(slot);
    else this.emit();
    // The save records which content pack it was written against. Until now
    // that was compared only against a copy of itself, so a chronicle written
    // by an older build loaded silently and failed later, somewhere unrelated.
    const packs = reconcileContentPacks(loaded.contentPackVersions, RUNNING_CONTENT_PACKS);
    if (packs.verdict !== "compatible") {
      return { success: true, message: `${slotLabel(slot)} loaded. ${packs.message}` };
    }
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

  /**
   * Jumps to any already-discovered location. `discoveredLocationIds` was
   * written on every save and read by nothing, so the player paid the walk in
   * both directions for every errand across three regions. The hours are still
   * paid — fast travel skips the keystrokes, not the clock.
   */
  async fastTravel(locationId: string): Promise<GameCommandResult> {
    const state = this.requireState();
    if (this.#battle) return commandFailure("The party cannot travel during a battle.");
    if (locationId === state.world.currentLocationId) {
      return commandFailure("The party is already there.");
    }
    if (!state.world.discoveredLocationIds.includes(locationId)) {
      return commandFailure("That road has not been walked yet.");
    }
    const hops = this.hopsBetween(state.world.currentLocationId, locationId);
    if (hops === undefined) return commandFailure("No road connects there.");

    this.#openVendorId = undefined;
    this.#state = {
      ...state,
      quests: this.applyObjectiveToActiveQuests(state.quests, "travel", locationId),
      world: {
        ...state.world,
        currentLocationId: locationId,
        worldMinutes: state.world.worldMinutes + 45 * hops
      }
    };
    this.applyInventoryObjectives();
    this.advanceCampaign();
    this.applyCompletedQuestRewards();
    await this.persist("autosave");
    const name = locations.find(({ id }) => id === locationId)?.name ?? locationId;
    return { success: true, message: `The party takes the known roads to ${name}.` };
  }

  /** Shortest route length over the authored road graph. */
  private hopsBetween(fromId: string, toId: string): number | undefined {
    const pending: Array<{ id: string; depth: number }> = [{ id: fromId, depth: 0 }];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.shift();
      if (!current || visited.has(current.id)) continue;
      if (current.id === toId) return current.depth;
      visited.add(current.id);
      const connections = locations.find(({ id }) => id === current.id)?.connections ?? [];
      for (const next of connections) {
        if (!visited.has(next)) pending.push({ id: next, depth: current.depth + 1 });
      }
    }
    return undefined;
  }

  /**
   * Claims the current location's once-per-chronicle curio. The reward is
   * deterministic from the chronicle seed, so reloading cannot reroll it.
   */
  async searchLocation(): Promise<GameCommandResult> {
    const state = this.requireState();
    if (this.#battle) return commandFailure("Not while a battle is underway.");
    const locationId = state.world.currentLocationId;
    const flag = curioFlagFor(locationId);
    if (state.world.flags[flag] === true) {
      return commandFailure("Nothing more is hidden here.");
    }

    let rng = createRng(`${state.seed}:curio:${locationId}`);
    const marksRoll = randomInt(rng, 18, 48);
    rng = marksRoll.rng;
    const itemRoll = randomInt(rng, 0, 99);
    const grantsItem = itemRoll.value < 45;
    const itemId = itemRoll.value < 20 ? "item.vesleaf" : "item.trail-rations";
    const currency = Number(state.world.flags.currency ?? 0) + marksRoll.value;

    this.#state = {
      ...state,
      inventory: grantsItem ? this.addWithinStackLimit(state.inventory, itemId, 1) : state.inventory,
      world: {
        ...state.world,
        flags: { ...state.world.flags, [flag]: true, currency }
      }
    };
    await this.persist("autosave");
    const itemName = grantsItem ? items.find(({ id }) => id === itemId)?.name : undefined;
    return {
      success: true,
      message: itemName
        ? `Tucked away: ${marksRoll.value} marks and ${itemName}.`
        : `Tucked away: ${marksRoll.value} marks.`
    };
  }

  /**
   * Chooses which active quest leads the list. The HUD, the compass and the
   * objective marker all read the first active quest, so tracking is nothing
   * more than ordering — one mechanism, three consumers.
   */
  async trackQuest(questId: string): Promise<GameCommandResult> {
    const state = this.requireState();
    const entry = state.quests.find((candidate) => candidate.questId === questId);
    if (!entry) return commandFailure("No such thread is recorded.");
    if (entry.state !== "active") return commandFailure("Only an active thread can be followed.");
    this.#state = {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, "progress.tracked-quest": questId } }
    };
    await this.persist("autosave");
    const title = quests.find(({ id }) => id === questId)?.title ?? questId;
    return { success: true, message: `Now following: ${title}.` };
  }

  /**
   * What a creation draft would start as: the derived numbers plus the
   * authored strengths and counters, which were written for all twenty-four
   * loadouts and displayed nowhere. Creation was made blind without this.
   */
  previewBuild(ancestryId: string, jobId: string): BuildPreview | undefined {
    const loadout = startingBuildLoadouts.find(
      (candidate) => candidate.ancestryId === ancestryId && candidate.jobId === jobId
    );
    if (!loadout) return undefined;
    const stats = statsForBuild(ancestryId, jobId);
    return {
      maxHp: stats.maxHp,
      maxMp: stats.maxMp,
      stats: {
        strength: stats.strength,
        dexterity: stats.dexterity,
        agility: stats.agility,
        vitality: stats.vitality,
        intellect: stats.intellect,
        wisdom: stats.wisdom,
        charisma: stats.charisma
      },
      role: loadout.partyRole,
      startingSkillNames: loadout.startingSkills
        .map((skillId) => SKILLS[skillId]?.name ?? skillId),
      strengths: [...loadout.strengths],
      counters: [...loadout.counters],
      // Stated up front rather than discovered by dying to it. GAME_DESIGN.md
      // promises strategy "without hidden formulas"; a resistance the player
      // cannot see before committing to a build is exactly a hidden formula.
      trait: traitForAncestry(ancestryId)
        ? `${traitForAncestry(ancestryId)!.name} — ${traitForAncestry(ancestryId)!.description}`
        : "",
      resists: Object.entries(loadout.elementalAffinities)
        .filter(([, value]) => value < 0)
        .map(([element]) => titleCase(element)),
      vulnerableTo: Object.entries(loadout.elementalAffinities)
        .filter(([, value]) => value > 0)
        .map(([element]) => titleCase(element))
    };
  }

  /** Quest views with the tracked quest first, then active, available, resolved. */
  private orderedQuestViews(): QuestView[] {
    const state = this.#state;
    if (!state) return [];
    const tracked = state.world.flags["progress.tracked-quest"];
    const rank = (view: QuestView): number => {
      if (view.state === "active") return view.id === tracked ? 0 : 1;
      if (view.state === "available") return 2;
      if (view.state === "completed") return 3;
      return 4;
    };
    return state.quests
      .flatMap((progress) => {
        const definition = quests.find(({ id }) => id === progress.questId);
        return definition ? [this.toQuestView(definition, progress.currentStep, progress.state)] : [];
      })
      .map((view, index) => ({ view, index }))
      .sort((left, right) => rank(left.view) - rank(right.view) || left.index - right.index)
      .map(({ view }) => view);
  }

  /** Every species the party has felled, with whatever has been learned of it. */
  private buildBestiary(): Array<{ name: string; defeated: number; weaknesses: string[]; resistances: string[] }> {
    const flags = this.#state?.world.flags ?? {};
    return Object.entries(flags)
      .filter(([key, value]) => key.startsWith("progress.defeat.") && Number(value) > 0)
      .map(([key, value]) => {
        const contentId = key.replace("progress.defeat.", "");
        const known = this.knownElementsFor(contentId);
        return {
          name: contentId.replace("enemy.", "").replaceAll("-", " "),
          defeated: Number(value),
          weaknesses: known.weaknesses,
          resistances: known.resistances
        };
      })
      .sort((left, right) => right.defeated - left.defeated);
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
    this.unlockTrailRemedies(locationId);
    this.advanceCampaign();
    this.applyCompletedQuestRewards();
    this.queueScene((trigger) => trigger.kind === "location_first_visit" && trigger.locationId === locationId);
    await this.persist("autosave");
    this.enqueueNarrativeCheckpoint("world_event", `The party crossed into ${locationId.replace("location.", "").replaceAll("-", " ")}.`);
  }

  /**
   * The mid-game system unlock: Emberwake's delvers teach the trail-remedy
   * ledger the first time the party reaches the Cinder March's city. Before
   * this flag the system menu shows the ledger as something the road ahead
   * still holds; after it, crafting is available anywhere.
   */
  private unlockTrailRemedies(locationId: string): void {
    if (locationId !== "location.emberwake" || !this.#state) return;
    if (this.#state.world.flags[TRAIL_REMEDIES_FLAG] === true) return;
    this.#state = {
      ...this.#state,
      world: {
        ...this.#state.world,
        flags: { ...this.#state.world.flags, [TRAIL_REMEDIES_FLAG]: true },
        chronicle: [
          ...this.#state.world.chronicle,
          {
            id: `chronicle.remedies.${this.#state.world.chronicle.length}`,
            worldMinute: this.#state.world.worldMinutes,
            title: "The Delvers' Ledger",
            body: "Keva's crews trade road-lore over the shift bell: how to steep, bind and temper what the party already carries. Trail remedies can now be worked from the system menu.",
            tags: ["system", "emberwake"]
          }
        ]
      }
    };
  }

  /** Crafts one trail remedy, if the ledger is known and the pack can pay. */
  async craftRemedy(recipeId: string): Promise<GameCommandResult> {
    const state = this.requireState();
    if (state.world.flags[TRAIL_REMEDIES_FLAG] !== true) {
      return commandFailure("The party has not learned trail remedies yet.");
    }
    const recipe = recipes.find(({ id }) => id === recipeId);
    if (!recipe) return commandFailure("No such remedy.");
    const result = craftRecipe(state.inventory, recipe);
    if (!result.crafted) {
      return commandFailure("The pack is short an ingredient for that remedy.");
    }
    this.#state = { ...state, inventory: result.inventory };
    this.applyInventoryObjectives();
    await this.persist("autosave");
    const output = items.find(({ id }) => id === recipe.outputItemId)?.name ?? recipe.outputItemId;
    return { success: true, message: `${recipe.name}: the party gains ${recipe.outputQuantity} × ${output}.` };
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
    let recruitmentMoment: string | undefined;
    let joinedReserve = false;
    const profile = recruitProfiles.find((candidate) => candidate.npcId === npcId);
    if (profile) {
      const completed = this.#state.quests.some(
        ({ questId, state: questState }) => questId === profile.recruitmentQuestId && questState === "completed"
      );
      const partyId = profile.id.replace("recruit.", "party.");
      const alreadyKnown = [...this.#state.party, ...this.#state.reserve].some(({ id }) => id === partyId);
      if (completed && !alreadyKnown) {
        // Join at the party's own standing, so a companion recruited late is
        // immediately useful rather than nine levels behind.
        const roster = [...this.#state.party, ...this.#state.reserve];
        const joinLevel = roster.length > 0 ? Math.max(...roster.map(({ level }) => level)) : 1;
        const recruited = recruitCharacter(profile, joinLevel);
        // A full active party sends the newcomer to the reserve rather than
        // turning them away. `reserve` was threaded through the types, the
        // engine and the save schema and never written to, so a fifth
        // companion was simply discarded.
        const joinsActiveParty = this.#state.party.length < ACTIVE_PARTY_LIMIT;
        const party = joinsActiveParty ? [...this.#state.party, recruited] : this.#state.party;
        const reserve = joinsActiveParty ? this.#state.reserve : [...this.#state.reserve, recruited];
        this.#state = {
          ...this.#state,
          party,
          reserve,
          inventory: profile.startingItems.reduce(
            (inventory, itemId) => isEquipmentItem(itemId)
              ? inventory
              : this.addWithinStackLimit(inventory, itemId, 1),
            this.#state.inventory
          )
        };
        recruitedMember = this.toPartyView(recruited, Math.max(0, party.length - 1));
        // The authored moment was written for all three recruits and used
        // nowhere: joining the party was a two-second toast.
        recruitmentMoment = profile.recruitmentMoment;
        joinedReserve = !joinsActiveParty;
      }
    }
    const vendor = vendorProfiles.find((candidate) => candidate.npcId === npcId);
    if (vendor) this.#openVendorId = vendor.id;
    await this.persist("autosave");
    // Prefer the authored record over a name reconstructed from the id: it
    // carries the role and the portrait tag, both of which the dialogue panel
    // shows and neither of which an id can supply.
    const definition = npcs.find(({ id }) => id === npcId);
    const npc = definition?.name ?? npcId.replace("npc.", "").split("-").map((word) =>
      `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`
    ).join(" ");
    const baseLines = awaitsConcordChoice
      ? [
          ...this.responsiveDialogue(npcId),
          "Three futures remain possible. The last word belongs to the chronicle you have made."
        ]
      : this.responsiveDialogue(npcId);
    return {
      speaker: npc,
      speakerRole: definition?.role,
      portraitTag: definition?.assetTag,
      // A companion joining is one of the moments a JRPG is built around, so
      // it gets its authored line in the conversation rather than a toast.
      lines: recruitmentMoment
        ? [
            ...baseLines,
            recruitmentMoment,
            joinedReserve
              ? `${recruitedMember?.name ?? "They"} will wait with the reserve until there is room on the road.`
              : `${recruitedMember?.name ?? "They"} joins the party.`
          ]
        : baseLines,
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
        speakerRole: SABLE_VOSS?.role,
        portraitTag: SABLE_VOSS?.assetTag,
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
      speakerRole: SABLE_VOSS?.role,
      portraitTag: SABLE_VOSS?.assetTag,
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
   * Names the forms a character learns by reaching their new level, and returns
   * the character with those forms known. Split from `withLearnedSkills` so the
   * caller can announce what was learned without recomputing it.
   */
  private applyLevelUpSkills(character: PlayerCharacter, previousLevel: number): string[] {
    const baseJobId = baseJobIdFor(character.jobId);
    return skillsLearnedBetween(baseJobId, previousLevel, character.level)
      .filter((skillId) => SKILLS[skillId] && !character.skills.includes(skillId));
  }

  private withLearnedSkills(character: PlayerCharacter, previousLevel: number): PlayerCharacter {
    const learned = this.applyLevelUpSkills(character, previousLevel);
    if (learned.length === 0) return character;
    return { ...character, skills: [...character.skills, ...learned] };
  }

  /**
   * Queues a scripted scene if its trigger matches and it has not been seen.
   * The seen-flag lives in world state, so replaying a chronicle — including
   * through New Game+ — replays its scenes.
   */
  private queueScene(matches: (trigger: SceneTrigger) => boolean): void {
    const state = this.#state;
    if (!state) return;
    const scene = scenesForTrigger(matches).find((candidate) =>
      (candidate.repeatable === true || state.world.flags[sceneFlagFor(candidate.id)] !== true)
      // Already waiting its turn: queue it once, not once per trigger check.
      && !this.#sceneQueue.some((queued) => queued.id === candidate.id));
    if (!scene) return;
    this.#sceneQueue.push({
      id: scene.id,
      lines: scene.lines.map((line) => ({
        speaker: line.speaker,
        text: line.text,
        ...(line.portraitTag ? { portraitTag: line.portraitTag } : {})
      })),
      ...(scene.trigger.kind === "location_first_visit" ? { locationId: scene.trigger.locationId } : {})
    });
  }

  /**
   * The first queued beat the party can actually watch from where they stand.
   *
   * An arrival beat carries its location and waits until the party is in it.
   * Serving strictly the head of the queue meant one stranded arrival scene —
   * walk into Hollow Root, leave before its narration is dismissed — sat at the
   * front forever, hiding every beat behind it: boss introductions, quest
   * epilogues, the lot, for the rest of the run.
   */
  private playableScene(): PendingSceneView | undefined {
    const locationId = this.#state?.world.currentLocationId;
    return this.#sceneQueue.find((scene) => !scene.locationId || scene.locationId === locationId);
  }

  async acknowledgeScene(sceneId: string): Promise<void> {
    // Removed by id, not by position: the beat just watched is not necessarily
    // the head, because a location-tagged one may be waiting in front of it.
    const index = this.#sceneQueue.findIndex((scene) => scene.id === sceneId);
    if (index < 0) return;
    this.#sceneQueue.splice(index, 1);
    const state = this.#state;
    if (!state) {
      this.emit();
      return;
    }
    this.#state = {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, [sceneFlagFor(sceneId)]: true } }
    };
    await this.persist("autosave");
  }

  /** True once every main-story quest is complete. */
  private isCampaignComplete(state: GameState): boolean {
    const mainQuestIds = new Set(quests.filter(({ mainStory }) => mainStory).map(({ id }) => id));
    if (mainQuestIds.size === 0) return false;
    const completed = state.quests.filter(({ questId, state: questState }) =>
      mainQuestIds.has(questId) && questState === "completed").length;
    return completed === mainQuestIds.size;
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
    // Post-game content stays sealed until the main story is finished, so the
    // ending overlay's promise that "unfinished threads still wait" is true.
    if (postgameEncounterIds.includes(encounterId) && !this.isCampaignComplete(state)) return;
    // Fail safe rather than throwing out of an awaited scene call: createCombatState
    // rejects an all-incapacitated party, and that rejection would strand the caller
    // mid-transition with its input gate still closed.
    if (!state.party.some((member) => member.hp > 0)) return;
    const encounterLevel = this.encounterLevel(encounter, state);
    const difficulty = difficultyOf(state);
    const livingParty = state.party.filter((member) => member.hp > 0).length;
    const economyScale = actionEconomyScale(encounter.enemyIds.length, livingParty);
    const enemies = encounter.enemyIds.map((id, index) =>
      enemyCombatant(id, index, encounter.boss, encounterLevel, difficulty, economyScale, livingParty));
    const party = state.party.map((member) => {
      const stats = deriveCharacterCombatStats(member, EQUIPMENT);
      return {
        ...member,
        stats,
        hp: Math.min(stats.maxHp, member.hp + Math.max(0, stats.maxHp - member.stats.maxHp)),
        mp: Math.min(stats.maxMp, member.mp + Math.max(0, stats.maxMp - member.stats.maxMp)),
        // Ancestry traits ride the battle copy only: derived from raceId here,
        // applied by the engine, never persisted into the save.
        traits: traitIdsForAncestry(member.raceId)
      };
    });
    // How many times this encounter has been engaged, kept in world state so it
    // survives a save. Both seeds below carried nothing that changes between two
    // fights of the same encounter: the battle seed varied only with the world
    // clock, which fighting does not advance, and the reward seed varied not at
    // all — so a repeatable encounter's item roll was fixed for the life of a
    // chronicle. It always dropped, or it never did. Counting engagements makes
    // successive fights differ while a reload still replays one exactly.
    const engagementFlag = `progress.encounter.${encounterId}`;
    const engagement = Number(state.world.flags[engagementFlag] ?? 0) + 1;
    this.#state = {
      ...state,
      world: {
        ...state.world,
        flags: { ...state.world.flags, [engagementFlag]: engagement }
      }
    };
    const active: ActiveBattle = {
      encounterId,
      engagement,
      state: createCombatState(party, enemies, `${state.seed}:${encounterId}:${state.world.worldMinutes}:${engagement}`),
      phase: "choosing",
      log: [`${encounter.name} bars the road.`],
      partyTurnIndex: this.firstLivingPartyIndex(party),
      actedPartyIndices: [],
      activatedBossPhases: [],
      events: []
    };
    // Open on whoever initiative puts first, not on whoever happens to sit at
    // index 0 — otherwise the very first turn of every battle contradicts the
    // order shown to the player.
    active.partyTurnIndex = this.partyTurnQueue(active)[0] ?? active.partyTurnIndex;
    this.#battle = active;
    this.applyBossPhaseTransitions(this.#battle);
    this.queueScene((trigger) => trigger.kind === "encounter_start" && trigger.encounterId === encounterId);
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
        const recipientId = this.resolveItemRecipient(active, actor.id, targetId, cureList);
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
        // Start the new round on whoever initiative puts first, so a haste or
        // slow landed last round actually changes who leads this one.
        active.actedPartyIndices = [];
        active.partyTurnIndex = this.partyTurnQueue(active)[0]
          ?? this.firstLivingPartyIndex(active.state.party);
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
  /**
   * Who an unaimed battle item should go to.
   *
   * Routing every ally action through "lowest health fraction" is right for a
   * tonic and wrong for a cure: Ash Spice went to whoever was most hurt, who
   * frequently carried no affliction at all, while the poisoned character it
   * was meant for stood untouched. A cure looks for somebody it can actually
   * cure first, and only then falls back to the neediest.
   */
  private resolveItemRecipient(
    active: ActiveBattle,
    actorId: string,
    requestedId: string | undefined,
    cureList: readonly StatusInstance["id"][] | undefined
  ): string {
    const living = active.state.party.filter(({ hp }) => hp > 0);
    const requested = requestedId ? living.find(({ id }) => id === requestedId) : undefined;
    if (requested) return requested.id;
    if (cureList) {
      const afflicted = living
        .filter((member) => member.statuses.some((status) => cureList.includes(status.id)))
        .sort((left, right) =>
          (left.hp / left.stats.maxHp) - (right.hp / right.stats.maxHp) || left.id.localeCompare(right.id));
      if (afflicted[0]) return afflicted[0].id;
    }
    return this.resolveActionTarget(active, actorId, "ally", undefined, actorId);
  }

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

  /**
   * Moves a reserve companion into the active party. Refused mid-battle, since
   * the combat state is built from the party roster at encounter start.
   */
  async swapPartyMember(reserveMemberId: string, activeMemberId?: string): Promise<GameCommandResult> {
    const state = this.requireState();
    if (this.#battle) {
      return { success: false, message: "The party cannot be reordered during a battle." };
    }
    const incoming = state.reserve.find(({ id }) => id === reserveMemberId);
    if (!incoming) {
      return { success: false, message: "That companion is not waiting in reserve." };
    }
    if (state.party.length >= ACTIVE_PARTY_LIMIT && !activeMemberId) {
      return { success: false, message: "The active party is full. Choose who steps aside." };
    }
    const outgoing = activeMemberId
      ? state.party.find(({ id }) => id === activeMemberId)
      : undefined;
    if (activeMemberId && !outgoing) {
      return { success: false, message: "That companion is not in the active party." };
    }
    if (outgoing && state.party.length <= 1) {
      return { success: false, message: "Someone must remain in the active party." };
    }

    const party = outgoing
      ? state.party.map((member) => member.id === outgoing.id ? incoming : member)
      : [...state.party, incoming];
    const reserve = outgoing
      ? state.reserve.map((member) => member.id === incoming.id ? outgoing : member)
      : state.reserve.filter(({ id }) => id !== incoming.id);

    this.#state = { ...state, party, reserve };
    await this.persist("autosave");
    return {
      success: true,
      message: outgoing
        ? `${incoming.name} takes ${outgoing.name}'s place.`
        : `${incoming.name} joins the active party.`
    };
  }

  async leaveBattle(): Promise<void> {
    if (this.#battle?.phase === "escaped" && this.#state) {
      const escapedParty = this.#battle.state.party;
      this.#state = {
        ...this.#state,
        party: this.#state.party.map((member) => {
          const combatant = escapedParty.find(({ id }) => id === member.id);
          if (!combatant) return member;
          return {
            ...member,
            hp: Math.max(1, carryBattlePool(combatant.hp, combatant.stats.maxHp, member.stats.maxHp)),
            mp: carryBattlePool(combatant.mp, combatant.stats.maxMp, member.stats.maxMp),
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

  /**
   * Resting is no longer a free, unlimited full heal. A paid stay in a
   * settlement restores everything including statuses; camping in the field
   * spends a camp supply and restores vitality and focus but not conditions,
   * which is precisely what makes Ash Spice worth carrying.
   *
   * The field option is also the anti-softlock floor: town-only rest risks a
   * party stranded deep in a dungeon with no MP and no coin.
   */
  async rest(): Promise<GameCommandResult> {
    const state = this.requireState();
    if (this.#battle) return commandFailure("The party cannot rest during a battle.");

    const inSettlement = locations.find(({ id }) => id === state.world.currentLocationId)?.kind === "town";
    const currency = Number(state.world.flags.currency ?? 0);
    const price = REST_PRICE;
    const hasSupply = inventoryQuantity(state.inventory, CAMP_SUPPLY_ITEM) > 0;

    if (inSettlement && currency < price) {
      return commandFailure(`Lodging costs ${price} marks; the party carries ${currency}.`);
    }
    if (!inSettlement && !hasSupply) {
      const supplyName = items.find(({ id }) => id === CAMP_SUPPLY_ITEM)?.name ?? "camp supplies";
      return commandFailure(`Camping on the road needs ${supplyName}.`);
    }

    const clearsStatuses = inSettlement;
    this.#state = {
      ...state,
      party: state.party.map((member) => ({
        ...member,
        hp: member.stats.maxHp,
        mp: member.stats.maxMp,
        statuses: clearsStatuses ? [] : member.statuses
      })),
      inventory: inSettlement ? state.inventory : removeItem(state.inventory, CAMP_SUPPLY_ITEM),
      world: {
        ...state.world,
        flags: inSettlement
          ? { ...state.world.flags, currency: currency - price }
          : state.world.flags,
        worldMinutes: state.world.worldMinutes + 480,
        chronicle: [...state.world.chronicle, {
          id: crypto.randomUUID(),
          worldMinute: state.world.worldMinutes + 480,
          title: inSettlement ? "A Room for the Night" : "A Quiet Camp",
          body: inSettlement
            ? "The party took a room, ate at a table, and woke without aches."
            : "The party made camp, tended its wounds, and listened to the rootways.",
          tags: ["rest", state.world.currentLocationId]
        }]
      }
    };
    await this.persist("autosave");
    this.enqueueNarrativeCheckpoint("world_event", "The party rested and gave the world time to answer.");
    return {
      success: true,
      message: inSettlement
        ? `The party rests for ${price} marks. Vitality, focus and conditions restored.`
        : "The party camps. Vitality and focus restored; lingering conditions remain."
    };
  }

  /**
   * Reports whether the write actually landed. This used to swallow `persist`'s
   * result, so the system menu told the player "Chronicle saved to Manual Slot
   * 1" whether or not anything reached storage — the one message a save system
   * must never get wrong.
   */
  async save(slot: SaveSlot): Promise<boolean> {
    return this.persist(slot);
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
      // Route the gate through the engine's unlock API rather than re-checking
      // the level here. That API was implemented and tested and had no caller,
      // so the bridge and the engine could disagree about the same rule.
      const blockers = getJobUnlockBlockers(
        member,
        {
          id: advancedJob.id,
          name: advancedJob.name,
          prerequisiteJobIds: [advancedJob.baseJobId],
          minimumLevel: advancedJob.minimumLevel,
          requiredSkillIds: []
        },
        [baseJob.id]
      );
      if (blockers.length > 0) {
        const levelBlocker = blockers.find((blocker) => blocker.type === "minimum_level");
        return commandFailure(levelBlocker
          ? `${advancedJob.name} unlocks at level ${advancedJob.minimumLevel}.`
          : `${advancedJob.name} is not yet open to ${member.name}.`);
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

  /**
   * Archived records, newest first. The storage layer has kept these since the
   * first import; nothing has ever been able to look at them.
   */
  async listBackups(): Promise<BackupView[]> {
    try {
      const backups = await this.#saves.backups();
      return backups
        .map((backup) => describeBackup(backup))
        .sort((left, right) => right.backedUpAt.localeCompare(left.backedUpAt));
    } catch (error) {
      console.error("Could not read save backups.", error);
      return [];
    }
  }

  /** Puts an archived record back in its slot and loads it. */
  async restoreBackup(backupId: string): Promise<GameCommandResult> {
    try {
      const record = await this.#saves.restoreBackup(backupId);
      await this.refreshSaveIndex();
      return await this.load(record.slot);
    } catch (error) {
      return commandFailure(`Restore failed: ${errorMessage(error)}`);
    }
  }

  async importSave(slot: GameSaveSlot, json: string): Promise<GameCommandResult> {
    try {
      await this.#saves.importJson(slot, json);
      const state = await this.#saves.load(slot);
      if (!state) throw new Error(`Imported save slot '${slot}' could not be loaded`);
      this.#state = state;
      this.#battle = undefined;
      // Rebuilds slots, summaries and the has-save flag together. Doing it by
      // hand here refreshed the slot set but left `#saveSummaries` holding the
      // pre-import rows, so the load menu described the save that was replaced.
      await this.refreshSaveIndex();
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
    const baseReward = calculateBattleReward(
      encounter.rewardTier,
      averageLevel,
      `${state.seed}:${active.encounterId}:${active.engagement}`
    );
    const rewardScale = DIFFICULTY_REWARD_MULTIPLIER[difficultyOf(state)];
    const reward = {
      ...baseReward,
      experience: Math.round(baseReward.experience * rewardScale),
      currency: Math.round(baseReward.currency * rewardScale)
    };
    const levelUps: Array<{ name: string; level: number; learned: string[] }> = [];
    const party = active.state.party.map((member) => {
      const original = state.party.find(({ id }) => id === member.id);
      if (!original) return member as PlayerCharacter;
      // Floor at 1. resolveOutcome checks enemies before party, so a damage-over-time
      // tick that kills both sides in the same round reports "victory" with a dead
      // party; without this floor that 0 HP persists and the next startEncounter
      // throws "Combat requires at least one living combatant on each side".
      const result = grantExperience({
        ...original,
        hp: Math.max(1, carryBattlePool(member.hp, member.stats.maxHp, original.stats.maxHp)),
        mp: carryBattlePool(member.mp, member.stats.maxMp, original.stats.maxMp),
        statuses: member.statuses
      }, reward.experience);
      if (result.levelsGained > 0) {
        levelUps.push({
          name: result.character.name,
          level: result.character.level,
          learned: this.applyLevelUpSkills(result.character, original.level)
        });
      }
      return this.withLearnedSkills(result.character, original.level);
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
    // Levelling was completely silent: `levelsGained` was computed and dropped
    // at both call sites, so twenty levels of growth never announced itself.
    for (const levelUp of levelUps) {
      active.log.push(`${levelUp.name} reaches level ${levelUp.level}.`);
      for (const skillId of levelUp.learned) {
        active.log.push(`${levelUp.name} learns ${SKILLS[skillId]?.name ?? skillId}.`);
      }
    }
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
    // Completion scenes: the seen-flag makes this idempotent, so checking the
    // whole completed set each pass fires each scene exactly once.
    const completed = new Set(progress.filter(({ state }) => state === "completed").map(({ questId }) => questId));
    this.queueScene((trigger) => trigger.kind === "quest_completed" && completed.has(trigger.questId));
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

  /**
   * Advances `collect` objectives against everything the party holds — pack and
   * worn alike.
   *
   * Counting only the pack meant equipping a quest item hid it from its own
   * quest. Dream Resin is a Warden's starting accessory *and* the objective of
   * The Root That Dreams, so a player who simply wore what the game gave them
   * could never finish the step asking for it. Whether a thing is in the pack
   * or on a character is an inventory-model detail; it is not something to make
   * somebody reason about mid-quest.
   *
   * `deliver` steps are untouched: handing an item over genuinely does require
   * taking it out of the pack first.
   */
  private applyInventoryObjectives(): void {
    if (!this.#state) return;
    const held = new Map<string, number>();
    for (const stack of this.#state.inventory) {
      held.set(stack.itemId, (held.get(stack.itemId) ?? 0) + stack.quantity);
    }
    for (const member of [...this.#state.party, ...this.#state.reserve]) {
      for (const itemId of Object.values(member.equipment)) {
        if (itemId) held.set(itemId, (held.get(itemId) ?? 0) + 1);
      }
    }
    let progress = this.#state.quests;
    for (const [itemId, quantity] of held) {
      progress = this.applyObjectiveToActiveQuests(progress, "collect", itemId, quantity);
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
        // Quest experience levels a character exactly as battle experience does,
        // so it has to teach that level's forms too. Dropping `levelsGained`
        // here lost them permanently: the next battle computes what was learned
        // from the level the character had *after* the quest, so the skipped
        // level never falls inside a `skillsLearnedBetween` window again.
        const leveled: Array<{ name: string; level: number; learned: string[] }> = [];
        party = party.map((member) => {
          const result = grantExperience(member, reward.experience);
          if (result.levelsGained > 0) {
            leveled.push({
              name: result.character.name,
              level: result.character.level,
              learned: this.applyLevelUpSkills(result.character, member.level)
            });
          }
          return this.withLearnedSkills(result.character, member.level);
        });
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
        // A quest can be handed in outside a battle, where there is no combat
        // log to speak into, so growth earned this way is recorded in the
        // chronicle rather than passing silently.
        for (const levelUp of leveled) {
          const learned = levelUp.learned.map((skillId) => SKILLS[skillId]?.name ?? skillId);
          chronicle = [...chronicle, {
            id: crypto.randomUUID(),
            worldMinute: state.world.worldMinutes,
            title: `${levelUp.name} reaches level ${levelUp.level}`,
            body: learned.length > 0
              ? `${levelUp.name} learns ${learned.join(", ")}.`
              : `${levelUp.name} grows steadier for the road ahead.`,
            tags: ["progression", "level"]
          }];
        }
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

  /** The member who acts first in a fresh round: fastest living, not first in the array. */
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
  /**
   * Party members act in initiative order rather than array order, so agility
   * — and haste and slow, which scale it — decide who moves first. Order is
   * recomputed each time because a landed status must be able to change it
   * mid-round; that is the point of having the statuses at all.
   */
  private partyTurnQueue(active: ActiveBattle): number[] {
    const order = getInitiativeOrder(active.state);
    const positionOf = new Map(order.map((id, position) => [id, position]));
    return active.state.party
      .map((member, index) => ({ member, index }))
      .filter(({ member }) => member.hp > 0)
      .sort((left, right) =>
        (positionOf.get(left.member.id) ?? Number.MAX_SAFE_INTEGER)
        - (positionOf.get(right.member.id) ?? Number.MAX_SAFE_INTEGER))
      .map(({ index }) => index);
  }

  private advancePartyTurn(active: ActiveBattle): boolean {
    // Record the turn that just ended before consulting the order again. The
    // queue is rebuilt from live initiative, so a member who buffs their own
    // speed mid-round moves to the front of it — and the old positional walk
    // then handed a second action to whoever they overtook, who had already
    // gone. A member who died mid-round simply drops out of the queue.
    if (!active.actedPartyIndices.includes(active.partyTurnIndex)) {
      active.actedPartyIndices.push(active.partyTurnIndex);
    }
    const next = this.partyTurnQueue(active)
      .find((index) => !active.actedPartyIndices.includes(index));
    if (next === undefined) return false;
    active.partyTurnIndex = next;
    return true;
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
      // The request contract caps this at twelve, and relationships accumulate
      // one per distinct quest NPC without bound — twenty-five across the
      // authored campaign. Sending them all made every request fail validation
      // with a 400 from the thirteenth onward, so the narrative provider was
      // never contacted again for the rest of the run. Gameplay was unharmed
      // (the client falls back to scripted text) and nothing surfaced the
      // reason, so the living-world feature switched itself off silently,
      // exactly where the world had become richest. Strongest bonds first, by
      // the same ordering the snapshot already uses.
      npcMemories: [...this.#state.world.relationships]
        .sort((left, right) =>
          Math.max(Math.abs(right.trust), Math.abs(right.respect), Math.abs(right.fear))
          - Math.max(Math.abs(left.trust), Math.abs(left.respect), Math.abs(left.fear))
          || left.npcId.localeCompare(right.npcId))
        .slice(0, NARRATIVE_NPC_MEMORY_LIMIT)
        .map(({ npcId }) => ({ npcId, memories: [] })),
      factionState: this.#state.world.factionStanding,
      availableResources: {
        assetTags: [...new Set(npcs.map(({ assetTag }) => assetTag))],
        encounterIds: encounters.map(({ id }) => id),
        rewardTiers: ["minor", "standard", "major", "boss"]
      }
    };
    // Pin the request to the chronicle that made it. A narrative call outlives
    // the run it was enqueued from — return to the title and load another save
    // while one is in flight, and the continuation read whatever `#state` had
    // become, applying a patch written for a different chronicle and then
    // persisting it over the autosave. The seed is per-run, so it is the thing
    // to check.
    const chronicleSeed = this.#state.seed;
    void this.#narrative.enqueue(context).then(async ({ patch, report }) => {
      if (!this.#state || this.#state.seed !== chronicleSeed) return;
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
    this.#state = this.accrualPlaySeconds(this.#state);
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
          playTimeMinutes: Math.floor(this.#state.world.playSeconds / 60),
          worldMinutes: this.#state.world.worldMinutes
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
      trait: traitForAncestry(member.raceId)
        ? `${traitForAncestry(member.raceId)!.name} — ${traitForAncestry(member.raceId)!.description}`
        : undefined,
      job: jobName,
      level: member.level,
      // Progress toward the next level, which the game never showed anywhere.
      experienceIntoLevel: Math.max(0, member.experience - totalExperienceForLevel(member.level)),
      experienceForNextLevel: Math.max(
        1,
        totalExperienceForLevel(member.level + 1) - totalExperienceForLevel(member.level)
      ),
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

  /**
   * The objective as a sentence, not a serialized step. This used to render the
   * raw kind and id — "talk orren pike", "travel mossroad" — which read as
   * debug output in the HUD and journal, one line above properly written route
   * text.
   */
  private describeObjective(objective: QuestDefinition["steps"][number]): string {
    const fallback = objective.targetId
      .replace(/^(npc|enemy|item|location|encounter)\./, "")
      .split("-")
      .map(titleCase)
      .join(" ");
    const counted = (name: string): string => (objective.count > 1 ? `${objective.count} × ${name}` : name);
    switch (objective.kind) {
      case "talk":
        return `Speak with ${npcs.find(({ id }) => id === objective.targetId)?.name ?? fallback}`;
      case "travel":
        return `Travel to ${locations.find(({ id }) => id === objective.targetId)?.name ?? fallback}`;
      case "collect":
        return `Gather ${counted(items.find(({ id }) => id === objective.targetId)?.name ?? fallback)}`;
      case "deliver": {
        const item = items.find(({ id }) => id === objective.targetId)?.name ?? fallback;
        const recipient = npcs.find(({ id }) => id === objective.recipientId)?.name;
        return `Deliver ${counted(item)}${recipient ? ` to ${recipient}` : ""}`;
      }
      case "defeat":
        return `Defeat ${counted(fallback)}`;
      case "survive":
        return `Survive ${encounters.find(({ id }) => id === objective.targetId)?.name ?? fallback}`;
      default:
        return `${titleCase(objective.kind)} ${counted(fallback)}`;
    }
  }

  private toQuestView(definition: QuestDefinition, currentStep: number, state: QuestView["state"]): QuestView {
    const objective = definition.steps[currentStep];
    return {
      id: definition.id,
      title: definition.title,
      summary: definition.summary,
      state,
      objective: objective ? this.describeObjective(objective) : "Completed",
      objectiveKind: objective?.kind,
      objectiveTargetId: objective?.targetId,
      ...(objective?.recipientId ? { objectiveRecipientId: objective.recipientId } : {})
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
      const comparison = this.compareEquipmentForLead(definition);
      return [{
        itemId,
        name: definition.name,
        description: definition.description,
        kind: definition.kind,
        buyPrice: definition.value,
        sellPrice: ownedQuantity > 0 ? Math.max(1, Math.round(definition.value * vendor.sellRate)) : undefined,
        ownedQuantity,
        ...comparison
      }];
    });
    return { vendorId: vendor.id, shopName: vendor.shopName, catalog };
  }

  /**
   * How a piece of gear would change the lead character's stats against what
   * they already wear. Buying was otherwise a guess: the shop showed a price
   * and a description, and nothing about whether the item was an improvement.
   */
  private compareEquipmentForLead(definition: ItemDefinition): {
    statDelta?: Array<{ stat: string; delta: number }>;
    unusableReason?: string;
  } {
    if (definition.kind !== "weapon" && definition.kind !== "armor" && definition.kind !== "accessory") return {};
    const member = this.#state?.party[0];
    if (!member) return {};

    const catalogEntry = EQUIPMENT[definition.id];
    if (catalogEntry) {
      const blocker = canEquipItem(member, catalogEntry);
      if (!blocker) {
        return { unusableReason: `${member.name} cannot use this.` };
      }
    }

    const current = deriveCharacterCombatStats(member, EQUIPMENT);
    const swapped = deriveCharacterCombatStats(
      { ...member, equipment: { ...member.equipment, [definition.kind]: definition.id } },
      EQUIPMENT
    );
    const statDelta = (Object.keys(current) as Array<keyof Stats>)
      .map((stat) => ({ stat, delta: swapped[stat] - current[stat] }))
      .filter(({ delta }) => delta !== 0);
    if (statDelta.length > 0) return { statDelta };
    // No delta means it is what they already wear — say so, rather than
    // leaving the row silent and indistinguishable from an unknown.
    return member.equipment[definition.kind] === definition.id
      ? { unusableReason: `${member.name} already wears this.` }
      : { unusableReason: "No change for this character." };
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
