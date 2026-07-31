import { encounters, getDialogue, items, locations, quests } from "../content";
import type {
  BattleAction,
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
  portraitTint: 0x72d6a1
});

export class DemoGameBridge implements GameBridge {
  private readonly listeners = new Set<SnapshotListener>();
  private state: GameSnapshot = {
    hasSave: false,
    playerName: "",
    locationId: "location.hearthcross",
    locationName: "Hearthcross",
    worldMinutes: 480,
    party: [],
    inventory: [
      { itemId: "item.vesleaf", name: "Vesleaf", description: "A bitter medicinal leaf.", quantity: 3 },
      { itemId: "item.root-tonic", name: "Root Tonic", description: "Restores a modest amount of vitality.", quantity: 2 }
    ],
    quests: [],
    autosave: "idle",
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

  continueGame(): void {
    this.emit();
  }

  load(_slot: GameSaveSlot): void {
    this.emit();
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
        portraitTint: 0xe8a95a
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
      isParty: false
    }));
    const actors = [
      ...this.state.party.map((member) => ({
        id: member.id,
        name: member.name,
        hp: member.hp,
        maxHp: member.maxHp,
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
        log: [`${encounter.name} bars the road.`],
        round: 1
      }
    };
    this.emit();
  }

  chooseBattleAction(action: BattleAction, _skillId?: string): void {
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

  rest(): void {
    this.state = {
      ...this.state,
      worldMinutes: this.state.worldMinutes + 480,
      party: this.state.party.map((member) => ({
        ...member,
        hp: member.maxHp,
        mp: member.maxMp
      })),
      autosave: "saved",
      chronicleHint: "The party rested while the roots whispered beyond the fire."
    };
    this.emit();
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
