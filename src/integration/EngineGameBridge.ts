import {
  addItem,
  advanceCombatRound,
  applyQuestObjective,
  calculateBattleReward,
  chooseEnemyAction,
  createCombatState,
  createInitialGameState,
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
import { encounters, getDialogue, items, locations, quests } from "../content";
import type {
  BattleAction,
  BattleView,
  CharacterCreationDraft,
  GameBridge,
  GameSnapshot,
  InteractionView,
  PartyMemberView,
  QuestView,
  SnapshotListener
} from "../game";
import { SaveRepository, type SaveSlot } from "../save";
import type {
  Combatant,
  GameState,
  PlayerCharacter,
  QuestDefinition,
  Stats
} from "../shared/types";

const STARTING_LOCATION = "location.hearthcross";
const CORE_PACK_VERSION = "0.1.0";
const FIRST_QUEST = "quest.first-silence";

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

const ROOT_SPARK: CombatSkill = {
  id: "skill.root-spark",
  name: "Root Spark",
  element: "nature",
  power: 18,
  accuracy: 0.92,
  mpCost: 5,
  target: "enemy",
  status: { id: "poison", chance: 0.25, turns: 2, potency: 3 }
};

const SKILLS: Readonly<Record<string, CombatSkill>> = {
  [ROOT_SPARK.id]: ROOT_SPARK
};

interface ActiveBattle {
  encounterId: string;
  state: CombatState;
  phase: BattleView["phase"];
  log: string[];
}

function playerFromDraft(draft: CharacterCreationDraft): PlayerCharacter {
  const stats = { ...BASE_STATS };
  return {
    id: "party.protagonist",
    name: draft.name.trim() || "Rowan",
    raceId: draft.ancestryId,
    jobId: draft.jobId,
    experience: 0,
    level: 1,
    stats,
    hp: stats.maxHp,
    mp: stats.maxMp,
    skills: [ROOT_SPARK.id],
    elements: { nature: -0.15 },
    statuses: [],
    isPlayerControlled: true,
    equipment: {}
  };
}

function tovinCharacter(): PlayerCharacter {
  const stats: Stats = {
    ...BASE_STATS,
    maxHp: 60,
    maxMp: 34,
    dexterity: 12,
    agility: 12,
    vitality: 8
  };
  return {
    id: "party.tovin",
    name: "Tovin",
    raceId: "Wayfarer",
    jobId: "Ranger",
    experience: 0,
    level: 1,
    stats,
    hp: stats.maxHp,
    mp: stats.maxMp,
    skills: [ROOT_SPARK.id],
    elements: { wind: -0.1 },
    statuses: [],
    isPlayerControlled: true,
    equipment: {}
  };
}

function enemyCombatant(id: string, index: number, boss: boolean, level: number): Combatant {
  const maxHp = boss ? 150 + level * 12 : 38 + level * 9;
  return {
    id: `${id}.${index}`,
    name: id.replace("enemy.", "").replaceAll("-", " "),
    level,
    stats: {
      maxHp,
      maxMp: 0,
      strength: 7 + level * 2,
      dexterity: 7 + level,
      agility: 6 + level,
      vitality: 6 + level,
      intellect: 4 + level,
      wisdom: 5 + level,
      charisma: 1
    },
    hp: maxHp,
    mp: 0,
    skills: [],
    elements: boss ? { nature: 0.2, fire: -0.2 } : { nature: -0.1 },
    statuses: [],
    isPlayerControlled: false
  };
}

export class EngineGameBridge implements GameBridge {
  readonly #listeners = new Set<SnapshotListener>();
  readonly #saves = new SaveRepository();
  #state?: GameState;
  #battle?: ActiveBattle;
  #autosave: GameSnapshot["autosave"] = "idle";
  #hasSave = false;

  async initialize(): Promise<void> {
    this.#hasSave = (await this.#saves.list()).some(({ slot }) => slot === "autosave");
  }

  getSnapshot(): Readonly<GameSnapshot> {
    if (!this.#state) {
      return {
        hasSave: this.#hasSave,
        playerName: "",
        locationId: STARTING_LOCATION,
        locationName: "Hearthcross",
        worldMinutes: 480,
        party: [],
        inventory: [],
        quests: [],
        autosave: this.#autosave,
        chronicleHint: "A rain-heavy morning in Hearthcross."
      };
    }
    const location = locations.find(({ id }) => id === this.#state?.world.currentLocationId);
    return {
      hasSave: this.#hasSave,
      playerName: this.#state.party[0]?.name ?? "",
      locationId: this.#state.world.currentLocationId,
      locationName: location?.name ?? "Unknown road",
      worldMinutes: this.#state.world.worldMinutes + 480,
      party: this.#state.party.map((member, index) => this.toPartyView(member, index)),
      inventory: this.#state.inventory.flatMap((stack) => {
        const definition = items.find(({ id }) => id === stack.itemId);
        return definition ? [{
          itemId: stack.itemId,
          name: definition.name,
          description: definition.description,
          quantity: stack.quantity
        }] : [];
      }),
      quests: this.#state.quests.flatMap((progress) => {
        const definition = quests.find(({ id }) => id === progress.questId);
        return definition ? [this.toQuestView(definition, progress.currentStep, progress.state)] : [];
      }),
      battle: this.#battle ? this.toBattleView(this.#battle) : undefined,
      autosave: this.#autosave,
      chronicleHint: this.#state.world.chronicle.at(-1)?.body ?? "The road is waiting."
    };
  }

  subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async newGame(draft: CharacterCreationDraft): Promise<void> {
    let state = createInitialGameState({
      seed: `${draft.name || "Rowan"}-${crypto.randomUUID()}`,
      startingLocationId: STARTING_LOCATION,
      party: [playerFromDraft(draft)],
      contentPackVersions: { "core.yggdrasil-chronicles": CORE_PACK_VERSION },
      quests
    });
    state = {
      ...state,
      inventory: addItem(addItem(state.inventory, "item.vesleaf", 3), "item.root-tonic", 2),
      quests: startQuest(state.quests, FIRST_QUEST),
      world: {
        ...state.world,
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

  async continueGame(): Promise<void> {
    this.#state = await this.#saves.load("autosave");
    this.#hasSave = Boolean(this.#state);
    this.emit();
  }

  async travel(locationId: string): Promise<void> {
    const state = this.requireState();
    const current = locations.find(({ id }) => id === state.world.currentLocationId);
    if (!current?.connections.includes(locationId)) return;
    const discovered = state.world.discoveredLocationIds.includes(locationId)
      ? state.world.discoveredLocationIds
      : [...state.world.discoveredLocationIds, locationId];
    this.#state = {
      ...state,
      quests: this.applyObjectiveToActiveQuests(state.quests, "travel", locationId),
      world: {
        ...state.world,
        currentLocationId: locationId,
        discoveredLocationIds: discovered,
        worldMinutes: state.world.worldMinutes + 35
      }
    };
    this.advanceCampaign();
    await this.persist("autosave");
  }

  async interactNpc(npcId: string): Promise<InteractionView> {
    const state = this.requireState();
    let recruitedMember: PartyMemberView | undefined;
    let party = state.party;
    if (npcId === "npc.tovin-ash" && !party.some(({ id }) => id === "party.tovin")) {
      const recruited = tovinCharacter();
      party = [...party, recruited];
      recruitedMember = this.toPartyView(recruited, party.length - 1);
    }
    this.#state = {
      ...state,
      party,
      quests: this.applyObjectiveToActiveQuests(state.quests, "talk", npcId)
    };
    this.advanceCampaign();
    await this.persist("autosave");
    const npc = npcId.replace("npc.", "").split("-").map((word) =>
      `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`
    ).join(" ");
    return { speaker: npc, lines: getDialogue(npcId), recruitedMember };
  }

  startEncounter(encounterId: string): void {
    const state = this.requireState();
    const encounter = encounters.find(({ id }) => id === encounterId);
    if (!encounter) throw new Error(`Unknown encounter '${encounterId}'`);
    const averageLevel = Math.max(1, Math.round(state.party.reduce((sum, member) => sum + member.level, 0) / state.party.length));
    const enemies = encounter.enemyIds.map((id, index) => enemyCombatant(id, index, encounter.boss, averageLevel));
    this.#battle = {
      encounterId,
      state: createCombatState(state.party, enemies, `${state.seed}:${encounterId}:${state.world.worldMinutes}`),
      phase: "choosing",
      log: [`${encounter.name} bars the road.`]
    };
    this.emit();
  }

  async chooseBattleAction(action: BattleAction): Promise<void> {
    const active = this.#battle;
    if (!active || active.phase !== "choosing") return;
    const actor = active.state.party.find(({ hp }) => hp > 0);
    const target = active.state.enemies.find(({ hp }) => hp > 0);
    if (!actor || !target) return;
    if (action === "escape") {
      const encounter = encounters.find(({ id }) => id === active.encounterId);
      if (!encounter?.boss) {
        this.#battle = { ...active, phase: "escaped", log: [...active.log, "The party found a safe route away."] };
        this.emit();
        return;
      }
      active.log.push("There is no safe route away from this foe.");
    } else if (action === "item") {
      const state = this.requireState();
      if (inventoryQuantity(state.inventory, "item.root-tonic") > 0) {
        const healedParty = active.state.party.map((member) =>
          member.id === actor.id ? { ...member, hp: Math.min(member.stats.maxHp, member.hp + 30) } : member
        );
        active.state = { ...active.state, party: healedParty };
        this.#state = { ...state, inventory: removeItem(state.inventory, "item.root-tonic") };
        active.log.push(`${actor.name} drinks a Root Tonic and restores vitality.`);
      } else {
        active.log.push("No Root Tonic remains in the pack.");
      }
    } else {
      const resolution = resolveCombatAction(
        active.state,
        action === "guard"
          ? { type: "guard", actorId: actor.id }
          : action === "skill"
            ? { type: "skill", actorId: actor.id, targetId: target.id, skillId: ROOT_SPARK.id }
            : { type: "attack", actorId: actor.id, targetId: target.id },
        SKILLS
      );
      active.state = resolution.state;
      active.log.push(...resolution.events.map((event) => this.describeEvent(event, active.state)));
    }

    if (active.state.outcome === "ongoing") {
      for (const enemy of active.state.enemies.filter(({ hp }) => hp > 0)) {
        const enemyAction = chooseEnemyAction(active.state, enemy.id);
        const resolution = resolveCombatAction(active.state, enemyAction, SKILLS);
        active.state = resolution.state;
        active.log.push(...resolution.events.map((event) => this.describeEvent(event, active.state)));
        if (active.state.outcome !== "ongoing") break;
      }
    }
    if (active.state.outcome === "ongoing") {
      const advanced = advanceCombatRound(active.state);
      active.state = advanced.state;
      active.log.push(...advanced.events.map((event) => this.describeEvent(event, active.state)));
    }
    if (active.state.outcome === "victory") await this.resolveVictory(active);
    if (active.state.outcome === "defeat") active.phase = "defeat";
    this.emit();
  }

  async leaveBattle(): Promise<void> {
    if (this.#battle?.phase === "defeat" && this.#state) {
      this.#state = {
        ...this.#state,
        party: this.#state.party.map((member) => ({
          ...member,
          hp: Math.max(1, Math.round(member.stats.maxHp * 0.5)),
          mp: Math.round(member.stats.maxMp * 0.5),
          statuses: []
        }))
      };
    }
    this.#battle = undefined;
    await this.persist("autosave");
  }

  async save(slot: SaveSlot): Promise<void> {
    await this.persist(slot);
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
    const reward = calculateBattleReward(encounter.rewardTier, averageLevel, `${state.seed}:${active.encounterId}`);
    const party = active.state.party.map((member) => {
      const original = state.party.find(({ id }) => id === member.id);
      if (!original) return member as PlayerCharacter;
      return grantExperience({ ...original, hp: member.hp, mp: member.mp, statuses: member.statuses }, reward.experience).character;
    });
    let inventory = state.inventory;
    if (reward.itemRoll < 350) inventory = addItem(inventory, "item.root-tonic");
    let progress = state.quests;
    for (const enemyId of new Set(encounter.enemyIds)) {
      const count = encounter.enemyIds.filter((id) => id === enemyId).length;
      progress = this.applyObjectiveToActiveQuests(progress, "defeat", enemyId, count);
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
          ...state.world.flags,
          currency: Number(state.world.flags.currency ?? 0) + reward.currency
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
    this.advanceCampaign();
    active.phase = "victory";
    active.log.push(`Victory. The party earns ${reward.experience} experience and ${reward.currency} marks.`);
    await this.persist("autosave");
  }

  private applyObjectiveToActiveQuests(
    progress: GameState["quests"],
    kind: QuestDefinition["steps"][number]["kind"],
    targetId: string,
    count = 1
  ): GameState["quests"] {
    let next = progress;
    for (const definition of quests) {
      next = applyQuestObjective(next, definition, { kind, targetId, count });
    }
    return next;
  }

  private advanceCampaign(): void {
    if (!this.#state) return;
    let progress = refreshQuestAvailability(this.#state.quests, quests);
    const nextMain = quests.find((definition) =>
      definition.mainStory && progress.some((entry) => entry.questId === definition.id && entry.state === "available")
    );
    if (nextMain) progress = startQuest(progress, nextMain.id);
    this.#state = { ...this.#state, quests: progress };
  }

  private async persist(slot: SaveSlot): Promise<void> {
    if (!this.#state) return;
    this.#autosave = "saving";
    this.emit();
    try {
      await this.#saves.save(slot, this.#state);
      this.#hasSave = true;
      this.#autosave = "saved";
    } catch (error) {
      console.error("Save failed", error);
      this.#autosave = "error";
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }

  private toPartyView(member: PlayerCharacter, index: number): PartyMemberView {
    const tints = [0x72d6a1, 0xe8a95a, 0x8eb7df, 0xc29adb];
    return {
      id: member.id,
      name: member.name,
      ancestry: member.raceId,
      job: member.jobId,
      level: member.level,
      hp: member.hp,
      maxHp: member.stats.maxHp,
      mp: member.mp,
      maxMp: member.stats.maxMp,
      portraitTint: tints[index % tints.length] ?? 0xffffff
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
      objective: objective ? `${objective.kind} ${objective.count > 1 ? `${objective.count} × ` : ""}${target}` : "Completed"
    };
  }

  private toBattleView(active: ActiveBattle): BattleView {
    const encounter = encounters.find(({ id }) => id === active.encounterId);
    return {
      encounterId: active.encounterId,
      title: encounter?.name ?? "Encounter",
      phase: active.phase,
      actors: [...active.state.party, ...active.state.enemies].map((actor) => ({
        id: actor.id,
        name: actor.name,
        hp: actor.hp,
        maxHp: actor.stats.maxHp,
        isParty: actor.isPlayerControlled,
        status: actor.statuses[0]?.id
      })),
      activeActorId: active.state.party.find(({ hp }) => hp > 0)?.id,
      log: active.log.slice(-8),
      round: active.state.round
    };
  }

  private describeEvent(event: CombatEvent, state: CombatState): string {
    const actors = [...state.party, ...state.enemies];
    const name = (id: string): string => actors.find((actor) => actor.id === id)?.name ?? id;
    switch (event.type) {
      case "damage":
        return `${name(event.actorId)} deals ${event.amount} ${event.element} damage to ${name(event.targetId)}${event.critical ? " — critical!" : "."}`;
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
