import { encounters, getDialogue, items, locations, quests } from "../content";
import type {
  BattleAction,
  BuildPreview,
  CharacterCreationDraft,
  GameBridge,
  GameCommandResult,
  GameSaveSlot,
  GameSnapshot,
  InteractionView,
  PartyMemberView,
  SnapshotListener
} from "./bridge";

const clone = <T>(value: T): T => structuredClone(value);

const DEMO_STATS = { strength: 10, dexterity: 9, agility: 9, vitality: 10, intellect: 8, wisdom: 8, charisma: 7 };

const starterMember = (draft: CharacterCreationDraft): PartyMemberView => ({
  id: "party.protagonist",
  name: draft.name || "Rowan",
  ancestry: draft.ancestryId,
  job: draft.jobId,
  level: 1,
  hp: 68,
  maxHp: 68,
  mp: 24,
  maxMp: 24,
  portraitTint: 0x72d6a1,
  experienceIntoLevel: 0,
  experienceForNextLevel: 100,
  stats: DEMO_STATS
});

export class DemoGameBridge implements GameBridge {
  private readonly listeners = new Set<SnapshotListener>();
  private state: GameSnapshot = {
    hasSave: false,
    playerName: "",
    locationId: "location.hearthcross",
    locationName: "Hearthcross",
    worldMinutes: 480,
    currency: 0,
    difficulty: "normal",
    party: [],
    inventory: [
      { itemId: "item.vesleaf", name: "Vesleaf", description: "A bitter medicinal leaf.", quantity: 3 },
      { itemId: "item.root-tonic", name: "Root Tonic", description: "Restores a modest amount of vitality.", quantity: 2 }
    ],
    quests: [],
    autosave: "idle",
    storageAvailable: true,
    chronicleHint: "A rain-heavy morning in Hearthcross."
  };

  getSnapshot(): Readonly<GameSnapshot> {
    return clone(this.state);
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  newGame(draft: CharacterCreationDraft): void {
    this.state = {
      ...this.state,
      hasSave: true,
      playerName: draft.name || "Rowan",
      party: [starterMember(draft)],
      quests: [
        {
          id: "quest.first-silence",
          title: "The First Silence",
          summary: quests.find(({ id }) => id === "quest.first-silence")?.summary ?? "",
          state: "active",
          objective: "Speak with Mara Vell near the Rootwardens' post.",
          objectiveKind: "talk",
          objectiveTargetId: "npc.mara-vell"
        }
      ],
      autosave: "saved",
      chronicleHint: "You answered Hearthcross's call beneath an unseasonable rain."
    };
    this.emit();
  }

  continueGame(): GameCommandResult {
    this.emit();
    return { success: true, message: "Autosave loaded." };
  }

  load(_slot: GameSaveSlot): GameCommandResult {
    this.emit();
    return { success: true, message: "Chronicle loaded." };
  }

  deleteSave(_slot: GameSaveSlot): GameCommandResult {
    this.emit();
    return { success: true, message: "Chronicle deleted." };
  }

  travel(locationId: string): void {
    const location = locations.find(({ id }) => id === locationId);
    if (!location) return;
    this.state = {
      ...this.state,
      locationId,
      locationName: location.name,
      worldMinutes: this.state.worldMinutes + 35,
      autosave: "saved",
      chronicleHint: `The party reached ${location.name}.`
    };
    this.emit();
  }

  interactNpc(npcId: string): InteractionView {
    let recruitedMember: PartyMemberView | undefined;
    if (npcId === "npc.tovin-ash" && !this.state.party.some(({ id }) => id === "party.tovin")) {
      recruitedMember = {
        id: "party.tovin",
        name: "Tovin",
        ancestry: "Wayfarer",
        job: "Ranger",
        level: 1,
        hp: 54,
        maxHp: 54,
        mp: 30,
        maxMp: 30,
        portraitTint: 0xe8a95a,
        experienceIntoLevel: 0,
        experienceForNextLevel: 100,
        stats: DEMO_STATS
      };
      this.state = {
        ...this.state,
        party: [...this.state.party, recruitedMember],
        chronicleHint: "Tovin Ash joined the road."
      };
      this.emit();
    }
    const speaker = npcId
      .replace("npc.", "")
      .split("-")
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(" ");
    return { speaker, lines: getDialogue(npcId).slice(0, 2), recruitedMember };
  }

  resolveInteractionChoice(_choiceId: string): InteractionView {
    return {
      speaker: "Wayfarer",
      lines: ["The demo road records no binding choices."]
    };
  }

  startEncounter(encounterId: string): void {
    const encounter = encounters.find(({ id }) => id === encounterId) ?? encounters[0];
    if (!encounter) return;
    const enemies = encounter.enemyIds.map((id, index) => ({
      id: `${id}.${index}`,
      name: id.replace("enemy.", "").replaceAll("-", " "),
      hp: encounter.boss ? 110 : 38,
      maxHp: encounter.boss ? 110 : 38,
      mp: 0,
      maxMp: 0,
      statuses: [],
      alive: true,
      targetable: true,
      knownWeaknesses: [],
      knownResistances: [],
      isParty: false
    }));
    const actors = [
      ...this.state.party.map((member) => ({
        id: member.id,
        name: member.name,
        hp: member.hp,
        maxHp: member.maxHp,
        mp: member.mp,
        maxMp: member.maxMp,
        statuses: [],
        alive: member.hp > 0,
        targetable: member.hp > 0,
        knownWeaknesses: [],
        knownResistances: [],
        isParty: true
      })),
      ...enemies
    ];
    this.state = {
      ...this.state,
      battle: {
        encounterId: encounter.id,
        title: encounter.name,
        phase: "choosing",
        actors,
        activeActorId: this.state.party[0]?.id,
        activeSkills: [],
        activeItems: [],
        events: [],
        turnOrder: actors.map(({ id }) => id),
        escapable: !encounter.boss,
        log: [`${encounter.name} bars the road.`],
        round: 1
      }
    };
    this.emit();
  }

  chooseBattleAction(action: BattleAction, _skillOrItemId?: string): void {
    const battle = this.state.battle;
    if (!battle || battle.phase !== "choosing") return;
    if (action === "escape") {
      this.state = { ...this.state, battle: { ...battle, phase: "escaped", log: [...battle.log, "The party found a safe route away."] } };
      this.emit();
      return;
    }

    const enemies = battle.actors.filter(({ isParty, hp }) => !isParty && hp > 0);
    const target = enemies[0];
    const damage = action === "guard" ? 0 : action === "skill" ? 24 : action === "item" ? 12 : 16;
    const nextActors = battle.actors.map((actor) =>
      actor.id === target?.id ? { ...actor, hp: Math.max(0, actor.hp - damage) } : actor
    );
    const survivors = nextActors.filter(({ isParty, hp }) => !isParty && hp > 0);
    const nextLog = [...battle.log, action === "guard" ? "The party braces behind a resin guard." : `${this.state.playerName} uses ${action} for ${damage} damage.`];
    if (survivors.length === 0) {
      const reward = items.find(({ id }) => id === "item.root-tonic");
      this.state = {
        ...this.state,
        inventory: reward
          ? this.state.inventory.map((entry) =>
              entry.itemId === reward.id ? { ...entry, quantity: entry.quantity + 1 } : entry
            )
          : this.state.inventory,
        battle: { ...battle, actors: nextActors, phase: "victory", log: [...nextLog, "Victory. The road opens."] },
        chronicleHint: `${battle.title} was overcome.`
      };
      this.emit();
      return;
    }

    const firstParty = nextActors.find(({ isParty }) => isParty);
    const retaliated = nextActors.map((actor) =>
      actor.id === firstParty?.id && action !== "guard"
        ? { ...actor, hp: Math.max(1, actor.hp - 7) }
        : actor
    );
    this.state = {
      ...this.state,
      battle: {
        ...battle,
        actors: retaliated,
        round: battle.round + 1,
        log: [...nextLog, action === "guard" ? "Enemy blows glance away." : "The enemy answers for 7 damage."]
      }
    };
    this.emit();
  }

  leaveBattle(): void {
    this.state = { ...this.state, battle: undefined, autosave: "saved" };
    this.emit();
  }

  rest(): GameCommandResult {
    return { success: true, message: "The demo party rests." };
  }

  save(_slot: GameSaveSlot): void {
    this.state = { ...this.state, autosave: "saving" };
    this.emit();
    this.state = { ...this.state, autosave: "saved" };
    this.emit();
  }

  useInventoryItem(_itemId: string, _memberId: string): GameCommandResult {
    return { success: false, message: "Inventory actions are unavailable in the demo bridge." };
  }

  setEquipment(
    _memberId: string,
    _slot: "weapon" | "armor" | "accessory",
    _itemId?: string
  ): GameCommandResult {
    return { success: false, message: "Equipment actions are unavailable in the demo bridge." };
  }

  selectJob(_memberId: string, _jobId: string): GameCommandResult {
    return { success: false, message: "Job actions are unavailable in the demo bridge." };
  }

  newGamePlus(_draft: CharacterCreationDraft): GameCommandResult {
    return { success: false, message: "The demo road has no finished chronicle to carry." };
  }

  acknowledgeScene(_sceneId: string): void {
    // The demo road stages no scripted scenes.
  }

  fastTravel(_locationId: string): GameCommandResult {
    return { success: false, message: "The demo road is walked, not skipped." };
  }

  searchLocation(): GameCommandResult {
    return { success: false, message: "The demo road hides nothing." };
  }

  trackQuest(_questId: string): GameCommandResult {
    return { success: false, message: "The demo journal follows a single thread." };
  }

  previewBuild(_ancestryId: string, _jobId: string): BuildPreview | undefined {
    return undefined;
  }

  swapPartyMember(_reserveMemberId: string, _activeMemberId?: string): GameCommandResult {
    return { success: false, message: "The demo road travels with a fixed company." };
  }

  buyItem(_itemId: string): GameCommandResult {
    return { success: false, message: "Shops are unavailable in the demo bridge." };
  }

  sellItem(_itemId: string): GameCommandResult {
    return { success: false, message: "Shops are unavailable in the demo bridge." };
  }

  leaveShop(): void {
    this.emit();
  }

  exportSave(_slot: GameSaveSlot): string {
    return JSON.stringify({ demo: true }, null, 2);
  }

  importSave(_slot: GameSaveSlot, _json: string): GameCommandResult {
    return { success: false, message: "Save import is unavailable in the demo bridge." };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
