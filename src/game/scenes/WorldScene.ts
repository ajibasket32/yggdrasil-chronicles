import Phaser from "phaser";
import { locations, npcs } from "../../content";
import { gameSettingsStore } from "../../settings";
import type {
  GameBridge,
  GameSnapshot,
  InventoryView,
  InteractionView,
  OverlayKind,
  PartyMemberView
} from "../bridge";
import { gamepadButtonAction } from "../gamepadControls";
import { keyboardActionForCode, keyboardCodeLabel } from "../keyboardControls";
import { getNpcSpawnPoints } from "../npcPlacement";
import { announceScene, COLORS, getBridge, motionDuration, playSound, TEXT } from "../runtime";
import {
  getLocationExits,
  getObjectiveGuidance,
  selectEncounterForLocation,
  type ExitDirection
} from "../worldNavigation";

const TILE = 32;
const MAP_COLUMNS = 23;
const MAP_ROWS = 17;
const HUD_X = MAP_COLUMNS * TILE;
const EQUIPMENT_SLOTS = ["weapon", "armor", "accessory"] as const;

type Point = { x: number; y: number };
type InteractiveOverlayMode = "browse" | "target" | "jobs" | "equipment";

export class WorldScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private snapshot!: Readonly<GameSnapshot>;
  private player!: Phaser.GameObjects.Image;
  private playerGrid: Point = { x: 5, y: 9 };
  private moving = false;
  private locked = false;
  private unsubscribe?: () => void;
  private hud?: Phaser.GameObjects.Container;
  private prompt?: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;
  private overlayKind?: OverlayKind;
  private systemIndex = 0;
  private inventoryIndex = 0;
  private partyIndex = 0;
  private partyJobIndex = 0;
  private equipmentIndex = 0;
  private interactiveMode: InteractiveOverlayMode = "browse";
  private selectedInventoryItemId?: string;
  private systemBusy = false;
  private npcSprites: Array<{ id: string; point: Point; sprite: Phaser.GameObjects.Image }> = [];
  private encounterSprite?: Phaser.GameObjects.Image;
  private activeInteraction?: { view: InteractionView; index: number };
  private endingShown = false;

  constructor() {
    super("world");
  }

  create(): void {
    this.bridge = getBridge(this);
    this.snapshot = this.bridge.getSnapshot();
    this.cameras.main.fadeIn(motionDuration(280), 10, 18, 24);
    this.renderLocation();
    this.bindKeys();
    this.unsubscribe = this.bridge.subscribe((snapshot) => {
      const changedLocation = snapshot.locationId !== this.snapshot.locationId;
      this.snapshot = snapshot;
      if (changedLocation) this.renderLocation();
      else {
        this.renderHud();
        if (this.overlayKind === "inventory" || this.overlayKind === "party") this.drawInteractiveOverlay();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    announceScene("world");
    if (this.snapshot.campaign?.complete) {
      this.time.delayedCall(250, () => this.showCampaignEnding());
    }
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.on("keydown", this.onKeyboard, this);
    this.input.gamepad?.on("down", this.onGamepadButton, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off("keydown", this.onKeyboard, this);
      this.input.gamepad?.off("down", this.onGamepadButton, this);
    });
  }

  private onKeyboard(event: KeyboardEvent): void {
    const action = keyboardActionForCode(event.code, gameSettingsStore.get().keyBindings);
    if (action === "up" || action === "down" || action === "left" || action === "right") this.handleDirection(action);
    else if (action === "confirm" || action === "interact") void this.interact();
    else if (action === "cancel") this.escape();
    else if (action === "journal") this.toggleOverlay("journal");
    else if (action === "inventory") this.toggleOverlay("inventory");
    else if (action === "party") this.toggleOverlay("party");
    else if (action === "encounter") void this.launchEncounter();
    else if (action === "quickSave") void this.manualSave();
  }

  private onGamepadButton(_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button): void {
    const action = gamepadButtonAction(button.index);
    if (action === "up" || action === "down" || action === "left" || action === "right") this.handleDirection(action);
    else if (action === "confirm") void this.interact();
    else if (action === "cancel") this.escape();
    else if (action === "journal") this.toggleOverlay("journal");
    else if (action === "party") this.toggleOverlay("party");
    else if (action === "inventory") this.toggleOverlay("inventory");
    else if (action === "system") this.toggleOverlay("system");
  }

  private handleDirection(direction: ExitDirection): void {
    if (this.overlayKind === "system") {
      if (direction === "up" || direction === "left") this.moveSystem(-1);
      else this.moveSystem(1);
      return;
    }
    if (this.overlayKind === "inventory") {
      this.moveInventory(direction === "up" || direction === "left" ? -1 : 1);
      return;
    }
    if (this.overlayKind === "party") {
      this.movePartyOverlay(direction);
      return;
    }
    void this.tryMove(direction);
  }

  private renderLocation(resetPlayerPosition = true): void {
    this.children.removeAll();
    this.npcSprites = [];
    this.overlay = undefined;
    this.overlayKind = undefined;
    this.prompt = undefined;
    this.encounterSprite = undefined;
    this.locked = false;
    if (resetPlayerPosition) this.playerGrid = { x: 5, y: 9 };
    const location = locations.find(({ id }) => id === this.snapshot.locationId) ?? locations[0];
    if (!location) return;

    const kind = location.kind;
    const backgroundKey = kind === "town" ? "tile.grass" : kind === "wilderness" ? "tile.stone" : "tile.dungeon";
    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let column = 0; column < MAP_COLUMNS; column += 1) {
        let texture = backgroundKey;
        if (kind === "town" && (column === 0 || row === 0 || column === MAP_COLUMNS - 1 || row === MAP_ROWS - 1)) {
          texture = "tile.water";
        }
        const tile = this.add.image(column * TILE, row * TILE, texture).setOrigin(0).setDisplaySize(TILE, TILE);
        tile.setTint(this.tileTint(column, row, kind));
      }
    }
    this.paintLandmarks(kind);
    this.paintExits(location.id);
    this.spawnNpcs(location.id);
    if (kind !== "town") this.spawnEncounter(location.id, kind);
    this.player = this.add.image(this.playerGrid.x * TILE + 16, this.playerGrid.y * TILE + 16, "sprite.player");
    this.player.setDepth(10);
    this.renderHud();
    this.prompt = this.add.text(18, 496, "", {
      ...TEXT.body,
      backgroundColor: "#101622dd",
      padding: { x: 9, y: 6 }
    }).setDepth(30);
    this.refreshPrompt();
  }

  private tileTint(column: number, row: number, kind: string): number {
    const variation = (column * 13 + row * 7) % 4;
    if (kind === "dungeon") return [0x78808c, 0x6e7782, 0x828a96, 0x747d88][variation] ?? 0xffffff;
    if (kind === "wilderness") return [0xa8b095, 0x98a187, 0xb0b69c, 0x929b83][variation] ?? 0xffffff;
    return [0xb3c49d, 0xaac093, 0xc0cb9f, 0xa0b88c][variation] ?? 0xffffff;
  }

  private paintLandmarks(kind: "town" | "wilderness" | "dungeon"): void {
    const graphics = this.add.graphics().setDepth(2);
    if (kind === "town") {
      graphics.fillStyle(0x58463d).fillRect(3 * TILE, 3 * TILE, 6 * TILE, 4 * TILE);
      graphics.fillStyle(0x8e5f4b).fillTriangle(2.5 * TILE, 3 * TILE, 9.5 * TILE, 3 * TILE, 6 * TILE, TILE);
      graphics.fillStyle(0xcda86f).fillRect(5.5 * TILE, 5 * TILE, TILE, 2 * TILE);
      graphics.fillStyle(0x735b47).fillRect(13 * TILE, 5 * TILE, 6 * TILE, TILE);
      for (let tree = 0; tree < 6; tree += 1) {
        graphics.fillStyle(0x315c45).fillCircle((3 + tree * 3) * TILE, 13 * TILE, 23);
        graphics.fillStyle(0x594234).fillRect((3 + tree * 3) * TILE - 4, 13 * TILE, 8, 30);
      }
    } else if (kind === "wilderness") {
      graphics.lineStyle(16, 0x71604d, 0.9).beginPath().moveTo(0, 10 * TILE).lineTo(HUD_X, 7 * TILE).strokePath();
      graphics.lineStyle(5, 0x526d55, 0.8).beginPath().moveTo(5 * TILE, 0).lineTo(10 * TILE, 5 * TILE).lineTo(8 * TILE, 17 * TILE).strokePath();
    } else {
      graphics.fillStyle(0x151923).fillRect(0, 0, HUD_X, TILE);
      graphics.fillStyle(0x151923).fillRect(0, 16 * TILE, HUD_X, TILE);
      graphics.fillStyle(0x947252).fillCircle(4 * TILE, 4 * TILE, 7).fillCircle(19 * TILE, 12 * TILE, 7);
      graphics.lineStyle(4, 0xc58f55, 0.5).strokeCircle(4 * TILE, 4 * TILE, 17).strokeCircle(19 * TILE, 12 * TILE, 17);
    }
  }

  private paintExits(locationId: string): void {
    const graphics = this.add.graphics().setDepth(5);
    const guidance = getObjectiveGuidance(this.snapshot);
    for (const exit of getLocationExits(locationId)) {
      const highlighted = guidance?.nextExit?.targetId === exit.targetId;
      graphics.fillStyle(highlighted ? 0xffe39a : 0xf2c66d, highlighted ? 1 : 0.82);
      if (exit.direction === "left") {
        graphics.fillTriangle(7, 8 * TILE, 25, 7.6 * TILE, 25, 8.4 * TILE);
        this.add.text(31, 8 * TILE - 10, `← ${exit.targetName}`, {
          ...TEXT.small,
          color: highlighted ? "#ffe39a" : COLORS.cream,
          backgroundColor: "#101622cc",
          padding: { x: 5, y: 3 }
        }).setDepth(6);
      } else if (exit.direction === "right") {
        graphics.fillTriangle(HUD_X - 7, 8 * TILE, HUD_X - 25, 7.6 * TILE, HUD_X - 25, 8.4 * TILE);
        this.add.text(HUD_X - 31, 8 * TILE - 10, `${exit.targetName} →`, {
          ...TEXT.small,
          color: highlighted ? "#ffe39a" : COLORS.cream,
          backgroundColor: "#101622cc",
          padding: { x: 5, y: 3 }
        }).setOrigin(1, 0).setDepth(6);
      } else if (exit.direction === "up") {
        graphics.fillTriangle(11.5 * TILE, 7, 11.1 * TILE, 25, 11.9 * TILE, 25);
        this.add.text(11.5 * TILE, 31, `${exit.targetName} ↑`, {
          ...TEXT.small,
          color: highlighted ? "#ffe39a" : COLORS.cream,
          backgroundColor: "#101622cc",
          padding: { x: 5, y: 3 }
        }).setOrigin(0.5, 0).setDepth(6);
      } else {
        graphics.fillTriangle(11.5 * TILE, MAP_ROWS * TILE - 7, 11.1 * TILE, MAP_ROWS * TILE - 25, 11.9 * TILE, MAP_ROWS * TILE - 25);
        this.add.text(11.5 * TILE, MAP_ROWS * TILE - 31, `${exit.targetName} ↓`, {
          ...TEXT.small,
          color: highlighted ? "#ffe39a" : COLORS.cream,
          backgroundColor: "#101622cc",
          padding: { x: 5, y: 3 }
        }).setOrigin(0.5, 1).setDepth(6);
      }
    }
  }

  private spawnNpcs(locationId: string): void {
    const residents = npcs.filter((npc) => npc.locationId === locationId).slice(0, 6);
    const points = getNpcSpawnPoints(residents.length);
    const guidance = getObjectiveGuidance(this.snapshot);
    residents.forEach((npc, index) => {
      const point = points[index];
      if (!point) return;
      const sprite = this.add.image(point.x * TILE + 16, point.y * TILE + 16, "sprite.npc").setDepth(8);
      const isObjective = guidance?.local && guidance.targetEntityId === npc.id;
      sprite.setTint(isObjective ? 0xffdf78 : index % 2 === 0 ? 0xffffff : 0xe8d4a8);
      this.npcSprites.push({ id: npc.id, point, sprite });
      if (isObjective) {
        this.add.text(point.x * TILE + 16, point.y * TILE - 31, "◆", {
          ...TEXT.small,
          color: COLORS.gold
        }).setOrigin(0.5).setDepth(10);
      }
      this.add.text(point.x * TILE + 16, point.y * TILE - 15, npc.name.split(" ")[0] ?? npc.name, {
        ...TEXT.small,
        fontSize: "9px",
        backgroundColor: "#101622aa",
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5).setDepth(9);
    });
  }

  private spawnEncounter(locationId: string, kind: "wilderness" | "dungeon"): void {
    this.encounterSprite?.destroy();
    const activeQuest = this.snapshot.quests.find(({ state }) => state === "active");
    const encounter = selectEncounterForLocation(locationId, activeQuest);
    if (!encounter) return;
    this.encounterSprite = this.add.image(14 * TILE + 16, 8 * TILE + 16, "sprite.enemy").setDepth(8);
    this.encounterSprite.setData("encounterId", encounter);
    if (kind === "dungeon") this.encounterSprite.setTint(0xd98c73);
    const guidance = getObjectiveGuidance(this.snapshot);
    if (guidance?.local && (activeQuest?.objectiveKind === "defeat" || activeQuest?.objectiveKind === "collect")) {
      this.add.text(14 * TILE + 16, 8 * TILE - 15, "◆ OBJECTIVE", {
        ...TEXT.small,
        fontSize: "9px",
        color: COLORS.gold,
        backgroundColor: "#101622cc",
        padding: { x: 4, y: 2 }
      }).setOrigin(0.5).setDepth(9);
    }
  }

  private renderHud(): void {
    this.hud?.destroy();
    const snapshot = this.snapshot;
    const panel = this.add.rectangle(HUD_X, 0, 960 - HUD_X, 540, COLORS.panel).setOrigin(0);
    const children: Phaser.GameObjects.GameObject[] = [panel];
    children.push(this.add.text(HUD_X + 18, 20, snapshot.locationName.toUpperCase(), { ...TEXT.heading, fontSize: "17px", wordWrap: { width: 188 } }));
    children.push(this.add.text(HUD_X + 18, 66, this.formatTime(snapshot.worldMinutes), TEXT.small));
    children.push(this.add.rectangle(HUD_X + 18, 90, 188, 1, COLORS.panelLight).setOrigin(0));
    children.push(this.add.text(HUD_X + 18, 105, "PARTY", { ...TEXT.small, color: COLORS.gold }));
    snapshot.party.slice(0, 4).forEach((member, index) => {
      const y = 132 + index * 63;
      children.push(this.add.rectangle(HUD_X + 18, y, 34, 34, member.portraitTint).setOrigin(0));
      children.push(this.add.text(HUD_X + 61, y - 2, `${member.name}  Lv ${member.level}`, { ...TEXT.body, fontSize: "12px" }));
      children.push(this.add.text(HUD_X + 61, y + 16, `HP ${member.hp}/${member.maxHp}  MP ${member.mp}/${member.maxMp}`, { ...TEXT.small, fontSize: "9px" }));
    });
    const objective = snapshot.quests.find(({ state }) => state === "active");
    children.push(this.add.text(HUD_X + 18, 393, "ACTIVE THREAD", { ...TEXT.small, color: COLORS.gold }));
    children.push(this.add.text(HUD_X + 18, 415, objective ? `${objective.title}\n${objective.objective}` : "No active thread.", {
      ...TEXT.small,
      color: COLORS.cream,
      wordWrap: { width: 188 },
      lineSpacing: 3
    }));
    const guidance = getObjectiveGuidance(snapshot);
    children.push(this.add.text(HUD_X + 18, 469, "ROUTE", { ...TEXT.small, color: COLORS.gold }));
    children.push(this.add.text(HUD_X + 18, 486, guidance?.message ?? "Explore and consult the journal.", {
      ...TEXT.small,
      color: guidance?.local ? "#ffe39a" : COLORS.cream,
      wordWrap: { width: 188 },
      lineSpacing: 2
    }));
    const saveLabel = snapshot.autosave === "saving" ? "Saving…" : snapshot.autosave === "error" ? "Save failed" : snapshot.autosave === "saved" ? "✓ Autosaved" : "Offline";
    children.push(this.add.text(HUD_X + 18, 524, saveLabel, { ...TEXT.small, fontSize: "9px", color: snapshot.autosave === "error" ? "#ef7882" : COLORS.muted }));
    const campaign = snapshot.campaign;
    if (campaign) {
      children.push(this.add.text(HUD_X + 188, 524, `MAIN ${campaign.completedMainQuests}/${campaign.totalMainQuests}`, {
        ...TEXT.small,
        fontSize: "9px",
        color: campaign.complete ? COLORS.gold : COLORS.muted
      }).setOrigin(1, 0));
    }
    this.hud = this.add.container(0, 0, children).setDepth(20);
  }

  private async tryMove(direction: "up" | "down" | "left" | "right"): Promise<void> {
    if (this.locked || this.moving) return;
    const delta: Record<typeof direction, Point> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };
    const next = { x: this.playerGrid.x + delta[direction].x, y: this.playerGrid.y + delta[direction].y };
    if (next.x < 1 || next.x > MAP_COLUMNS - 2 || next.y < 1 || next.y > MAP_ROWS - 2) {
      await this.travelFromEdge(direction);
      return;
    }
    if (this.npcSprites.some(({ point }) => point.x === next.x && point.y === next.y)) return;
    this.playerGrid = next;
    this.moving = true;
    this.tweens.add({
      targets: this.player,
      x: next.x * TILE + 16,
      y: next.y * TILE + 16,
      duration: motionDuration(95),
      ease: "Sine.easeOut",
      onComplete: () => {
        this.moving = false;
        playSound(this, "sfx.step");
        this.refreshPrompt();
      }
    });
  }

  private async travelFromEdge(direction: ExitDirection): Promise<void> {
    const exit = getLocationExits(this.snapshot.locationId).find((candidate) => candidate.direction === direction);
    if (!exit) return;
    this.locked = true;
    this.cameras.main.fadeOut(motionDuration(180), 10, 18, 24);
    await this.bridge.travel(exit.targetId);
    this.time.delayedCall(motionDuration(200), () => {
      this.cameras.main.fadeIn(motionDuration(180), 10, 18, 24);
      playSound(this, "sfx.door");
      this.locked = false;
    });
  }

  private nearestNpc(): { id: string; point: Point; sprite: Phaser.GameObjects.Image } | undefined {
    return this.npcSprites.find(({ point }) =>
      Math.abs(point.x - this.playerGrid.x) + Math.abs(point.y - this.playerGrid.y) <= 1
    );
  }

  private isNearEncounter(): boolean {
    if (!this.encounterSprite) return false;
    const encounterX = Math.floor(this.encounterSprite.x / TILE);
    const encounterY = Math.floor(this.encounterSprite.y / TILE);
    return Math.abs(encounterX - this.playerGrid.x) + Math.abs(encounterY - this.playerGrid.y) <= 1;
  }

  private refreshPrompt(): void {
    if (!this.prompt || this.locked) return;
    const npc = this.nearestNpc();
    const bindings = gameSettingsStore.get().keyBindings;
    if (npc) {
      this.prompt.setText(`${keyboardCodeLabel(bindings.interact)} / A  Talk`);
    } else if (this.isNearEncounter()) {
      this.prompt.setText(`${keyboardCodeLabel(bindings.interact)} / A  Engage`);
    } else {
      this.prompt.setText(
        `${keyboardCodeLabel(bindings.journal)} Journal   ${keyboardCodeLabel(bindings.party)} Party   `
        + `${keyboardCodeLabel(bindings.inventory)} Pack   ${keyboardCodeLabel(bindings.cancel)} Menu`
      );
    }
  }

  private async interact(): Promise<void> {
    if (this.activeInteraction) {
      this.advanceDialogue();
      return;
    }
    if (this.overlayKind === "system") {
      await this.confirmSystemCommand();
      return;
    }
    if (this.overlayKind === "inventory") {
      await this.confirmInventory();
      return;
    }
    if (this.overlayKind === "party") {
      await this.confirmPartyOverlay();
      return;
    }
    if (this.overlay) return;
    const npc = this.nearestNpc();
    if (npc) {
      this.locked = true;
      const view = await this.bridge.interactNpc(npc.id);
      this.activeInteraction = { view, index: 0 };
      this.drawDialogue();
      return;
    }
    if (this.isNearEncounter()) await this.launchEncounter();
  }

  private drawDialogue(): void {
    const active = this.activeInteraction;
    if (!active) return;
    this.overlay?.destroy();
    const panel = this.add.rectangle(28, 366, 680, 146, 0x101622, 0.96).setOrigin(0).setStrokeStyle(2, 0x8aa394);
    const speaker = this.add.text(50, 385, active.view.speaker.toUpperCase(), { ...TEXT.small, color: COLORS.gold });
    const line = this.add.text(50, 414, active.view.lines[active.index] ?? "", {
      ...TEXT.body,
      wordWrap: { width: 622 },
      lineSpacing: 5
    });
    const hint = this.add.text(647, 482, "Enter ▾", TEXT.small);
    this.overlay = this.add.container(0, 0, [panel, speaker, line, hint]).setDepth(40);
  }

  private advanceDialogue(): void {
    const active = this.activeInteraction;
    if (!active) return;
    if (active.index < active.view.lines.length - 1) {
      active.index += 1;
      this.drawDialogue();
      return;
    }
    const recruited = active.view.recruitedMember;
    this.activeInteraction = undefined;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.locked = false;
    if (recruited) this.showToast(`${recruited.name} joined the party.`);
    this.refreshObjectiveActors();
    if (this.snapshot.campaign?.complete) this.showCampaignEnding();
    this.refreshPrompt();
  }

  private showCampaignEnding(): void {
    if (this.endingShown || !this.snapshot.campaign?.complete) return;
    this.endingShown = true;
    this.locked = true;
    const veil = this.add.rectangle(0, 0, 960, 540, 0x0b1119, 0.94).setOrigin(0);
    const title = this.add.text(480, 112, "THE CONCORD REMADE", {
      ...TEXT.title,
      color: COLORS.gold
    }).setOrigin(0.5);
    const body = this.add.text(
      480,
      206,
      "The severed roads sing again—not as they once did, but in the voices of those who chose to mend them.\n\n"
        + `${this.snapshot.playerName}'s chronicle remains open. The road can still be explored, and unfinished threads still wait.`,
      {
        ...TEXT.body,
        fontSize: "17px",
        align: "center",
        wordWrap: { width: 650 },
        lineSpacing: 9,
        color: COLORS.cream
      }
    ).setOrigin(0.5, 0);
    const hint = this.add.text(480, 458, "Esc / B  Continue exploring", {
      ...TEXT.small,
      color: COLORS.muted
    }).setOrigin(0.5);
    this.overlay = this.add.container(0, 0, [veil, title, body, hint]).setDepth(100);
  }

  private refreshObjectiveActors(): void {
    const location = locations.find(({ id }) => id === this.snapshot.locationId);
    if (!location) return;
    this.renderLocation(false);
  }

  private toggleOverlay(kind: OverlayKind): void {
    if (this.activeInteraction) return;
    if (this.overlay) {
      this.closeOverlay();
      return;
    }
    const openingSystem = kind === "system" && this.overlayKind !== "system";
    this.locked = true;
    this.overlayKind = kind;
    if (openingSystem) this.systemIndex = 0;
    if (kind === "inventory" || kind === "party") {
      this.interactiveMode = "browse";
      this.selectedInventoryItemId = undefined;
      if (kind === "inventory") this.inventoryIndex = 0;
      else {
        this.partyIndex = 0;
        this.partyJobIndex = 0;
        this.equipmentIndex = 0;
      }
      this.drawInteractiveOverlay();
      return;
    }
    const panel = this.add.rectangle(60, 42, 640, 456, COLORS.panel, 0.98).setOrigin(0).setStrokeStyle(2, 0x6f8f82);
    const title = this.add.text(88, 70, kind.toUpperCase(), { ...TEXT.heading, color: COLORS.gold });
    const rule = this.add.rectangle(88, 105, 584, 1, COLORS.panelLight).setOrigin(0);
    const content = this.overlayContent(kind);
    const body = this.add.text(88, 126, content, {
      ...TEXT.body,
      wordWrap: { width: 570 },
      lineSpacing: 8
    });
    const hint = this.add.text(88, 462, kind === "system" ? "Arrows / D-pad  Select     Enter / A  Confirm     Esc / B  Close" : "Esc / B  Close", TEXT.small);
    this.overlay = this.add.container(0, 0, [panel, title, rule, body, hint]).setDepth(50);
  }

  private overlayContent(kind: OverlayKind): string {
    if (kind === "journal") {
      const active = this.snapshot.quests.filter(({ state }) => state === "active");
      const available = this.snapshot.quests.filter(({ state }) => state === "available");
      const completed = this.snapshot.quests.filter(({ state }) => state === "completed").length;
      const threads = [
        ...active.slice(0, 2).map((quest) => `◆ ${quest.title}\n   ${quest.objective}`),
        ...available.slice(0, Math.max(0, 2 - active.length)).map((quest) => `◇ ${quest.title}\n   Available`)
      ];
      const factions = this.snapshot.reputation?.factions.slice(0, 4)
        .map(({ name, standing }) => `${name.toUpperCase()}: ${standing > 0 ? "+" : ""}${standing}`)
        ?? [];
      const relationships = this.snapshot.reputation?.relationships.slice(0, 3)
        .map(({ name, trust, respect, fear }) => `${name}: T ${trust} · R ${respect} · F ${fear}`)
        ?? [];
      return [
        threads.length ? threads.join("\n\n") : "No active threads.",
        `\nRESOLVED THREADS: ${completed}/${this.snapshot.quests.length}`,
        factions.length || relationships.length
          ? `\nWORLD REPUTATION\n${[...factions, ...relationships].join("\n")}`
          : "\nWORLD REPUTATION\nNo faction or personal standing has changed yet."
      ].join("\n");
    }
    if (kind === "inventory") {
      return this.snapshot.inventory.length
        ? this.snapshot.inventory.map((item) => `${item.name} ×${item.quantity}\n   ${item.description}`).join("\n\n")
        : "The travel pack is empty.";
    }
    const commands = [
      "Save to Manual Slot 1",
      "Save to Manual Slot 2",
      "Save to Manual Slot 3",
      "Export Autosave",
      "Import Autosave",
      `High Contrast: ${gameSettingsStore.get().highContrast ? "ON" : "OFF"}`,
      `Reduced Motion: ${gameSettingsStore.get().reducedMotion ? "ON" : "OFF"}`,
      `Sound: ${gameSettingsStore.get().soundEnabled ? "ON" : "OFF"}`,
      `Sound Volume: ${Math.round(gameSettingsStore.get().soundVolume * 100)}%`,
      "Rest for eight hours",
      "Return to Title"
    ];
    return `${this.snapshot.chronicleHint}\n\n${commands.map((label, index) => `${index === this.systemIndex ? "›" : " "} ${label}`).join("\n")}`;
  }

  private drawInteractiveOverlay(): void {
    if (this.overlayKind !== "inventory" && this.overlayKind !== "party") return;
    this.overlay?.destroy();
    const panel = this.add.rectangle(60, 42, 640, 456, COLORS.panel, 0.98).setOrigin(0).setStrokeStyle(2, 0x6f8f82);
    const title = this.add.text(88, 70, this.overlayKind === "inventory" ? "INVENTORY" : "PARTY", { ...TEXT.heading, color: COLORS.gold });
    const rule = this.add.rectangle(88, 105, 584, 1, COLORS.panelLight).setOrigin(0);
    const body = this.add.text(88, 126, this.interactiveOverlayContent(), {
      ...TEXT.body,
      wordWrap: { width: 570 },
      lineSpacing: 6
    });
    const hint = this.add.text(88, 462, this.interactiveOverlayHint(), TEXT.small);
    this.overlay = this.add.container(0, 0, [panel, title, rule, body, hint]).setDepth(50);
  }

  private interactiveOverlayContent(): string {
    return this.overlayKind === "inventory" ? this.inventoryOverlayContent() : this.partyOverlayContent();
  }

  private interactiveOverlayHint(): string {
    if (this.overlayKind === "inventory") {
      return this.interactiveMode === "target"
        ? "Arrows / D-pad  Choose target     Enter / A  Confirm     Esc / B  Back"
        : "Arrows / D-pad  Select     Enter / A  Use or equip     Esc / B  Close";
    }
    if (this.interactiveMode === "jobs") {
      return "Arrows / D-pad  Select job     Left  Member     Right  Equipment     Esc / B  Back";
    }
    if (this.interactiveMode === "equipment") {
      return "Arrows / D-pad  Select slot     Enter / A  Unequip     Left  Member     Esc / B  Back";
    }
    return "Up / Down  Member     Right  Jobs     Left  Equipment     Enter / A  Jobs     Esc / B  Close";
  }

  private inventoryOverlayContent(): string {
    const inventory = this.snapshot.inventory;
    if (!inventory.length) return "The travel pack is empty.";
    if (this.interactiveMode === "target") {
      const item = this.selectedInventoryItem();
      const action = this.itemKind(item) === "consumable" ? "USE" : "EQUIP";
      const party = this.snapshot.party;
      return `${action}: ${item?.name ?? "Unknown item"}\n${item?.description ?? ""}\n\n${party.map((member, index) => `${index === this.partyIndex ? "›" : " "} ${member.name}  Lv ${member.level}\n   HP ${member.hp}/${member.maxHp}  MP ${member.mp}/${member.maxMp}`).join("\n\n") || "No party member can receive this item."}`;
    }
    return inventory.map((item, index) => {
      const kind = this.itemKind(item).toUpperCase();
      const equipped = item.equippedBy?.length ? `  EQUIPPED: ${item.equippedBy.join(", ")}` : "";
      return `${index === this.inventoryIndex ? "›" : " "} ${item.name} ×${item.quantity}  [${kind}]${equipped}\n   ${item.description}`;
    }).join("\n\n");
  }

  private partyOverlayContent(): string {
    const member = this.selectedPartyMember();
    if (!member) return "No party members are available.";
    if (this.interactiveMode === "jobs") {
      const jobs = member.jobOptions ?? [];
      return `${member.name.toUpperCase()}  —  ${member.ancestry}\nCurrent calling: ${member.job}\n\n${jobs.length ? jobs.map((job, index) => {
        const detail = job.state === "locked" ? `LOCKED — ${job.requirement}` : `${job.state.toUpperCase()} — ${job.requirement}`;
        return `${index === this.partyJobIndex ? "›" : " "} ${job.name}\n   ${detail}`;
      }).join("\n\n") : "No job paths are available for this member yet."}`;
    }
    if (this.interactiveMode === "equipment") {
      const equipment = member.equipment ?? {};
      return `${member.name.toUpperCase()}  —  EQUIPMENT\n\n${EQUIPMENT_SLOTS.map((slot, index) => {
        const equipped = equipment[slot];
        return `${index === this.equipmentIndex ? "›" : " "} ${slot.toUpperCase().padEnd(10)} ${equipped?.name ?? "Empty"}${equipped ? "\n   Enter / A to unequip" : ""}`;
      }).join("\n\n")}`;
    }
    const equipment = member.equipment ?? {};
    return `${this.snapshot.party.map((candidate, index) => `${index === this.partyIndex ? "›" : " "} ${candidate.name}  Lv ${candidate.level}  ${candidate.job}`).join("\n")}\n\n${member.name.toUpperCase()}\nHP ${member.hp}/${member.maxHp}    MP ${member.mp}/${member.maxMp}\n\nEQUIPPED\nWeapon: ${equipment.weapon?.name ?? "Empty"}\nArmor: ${equipment.armor?.name ?? "Empty"}\nAccessory: ${equipment.accessory?.name ?? "Empty"}\n\nRight to review jobs · Left to manage equipment`;
  }

  private itemKind(item: InventoryView | undefined): NonNullable<InventoryView["kind"]> {
    return item?.kind ?? "key";
  }

  private selectedInventoryItem(): InventoryView | undefined {
    return this.snapshot.inventory.find((item) => item.itemId === this.selectedInventoryItemId)
      ?? this.snapshot.inventory[this.inventoryIndex];
  }

  private selectedPartyMember(): PartyMemberView | undefined {
    return this.snapshot.party[this.partyIndex];
  }

  private moveInventory(delta: number): void {
    const count = this.interactiveMode === "target" ? this.snapshot.party.length : this.snapshot.inventory.length;
    if (!count) return;
    if (this.interactiveMode === "target") this.partyIndex = Phaser.Math.Wrap(this.partyIndex + delta, 0, count);
    else this.inventoryIndex = Phaser.Math.Wrap(this.inventoryIndex + delta, 0, count);
    this.drawInteractiveOverlay();
  }

  private movePartyOverlay(direction: ExitDirection): void {
    const delta = direction === "up" || direction === "left" ? -1 : 1;
    if (this.interactiveMode === "browse") {
      if (direction === "right") {
        this.interactiveMode = "jobs";
        this.partyJobIndex = this.activeJobIndex(this.selectedPartyMember());
      } else if (direction === "left") {
        this.interactiveMode = "equipment";
      } else if (this.snapshot.party.length) {
        this.partyIndex = Phaser.Math.Wrap(this.partyIndex + delta, 0, this.snapshot.party.length);
      }
    } else if (this.interactiveMode === "jobs") {
      if (direction === "left") this.interactiveMode = "browse";
      else if (direction === "right") this.interactiveMode = "equipment";
      else {
        const jobs = this.selectedPartyMember()?.jobOptions ?? [];
        if (jobs.length) this.partyJobIndex = Phaser.Math.Wrap(this.partyJobIndex + delta, 0, jobs.length);
      }
    } else if (this.interactiveMode === "equipment") {
      if (direction === "left") this.interactiveMode = "browse";
      else if (direction === "right") {
        this.interactiveMode = "jobs";
        this.partyJobIndex = this.activeJobIndex(this.selectedPartyMember());
      } else this.equipmentIndex = Phaser.Math.Wrap(this.equipmentIndex + delta, 0, EQUIPMENT_SLOTS.length);
    }
    this.drawInteractiveOverlay();
  }

  private activeJobIndex(member: PartyMemberView | undefined): number {
    const index = member?.jobOptions?.findIndex((job) => job.state === "active") ?? -1;
    return index < 0 ? 0 : index;
  }

  private async confirmInventory(): Promise<void> {
    if (this.interactiveMode === "browse") {
      const item = this.snapshot.inventory[this.inventoryIndex];
      if (!item) return;
      const kind = this.itemKind(item);
      if (kind !== "consumable" && kind !== "weapon" && kind !== "armor" && kind !== "accessory") {
        this.showToast("That item cannot be used from the travel pack.");
        return;
      }
      this.selectedInventoryItemId = item.itemId;
      this.partyIndex = 0;
      this.interactiveMode = "target";
      this.drawInteractiveOverlay();
      return;
    }
    const item = this.selectedInventoryItem();
    const member = this.selectedPartyMember();
    if (!item || !member) return;
    const kind = this.itemKind(item);
    if (kind !== "consumable" && kind !== "weapon" && kind !== "armor" && kind !== "accessory") return;
    const result = kind === "consumable"
      ? await this.bridge.useInventoryItem(item.itemId, member.id)
      : await this.bridge.setEquipment(member.id, kind, item.itemId);
    this.showToast(result.message);
    this.interactiveMode = "browse";
    this.selectedInventoryItemId = undefined;
    this.drawInteractiveOverlay();
  }

  private async confirmPartyOverlay(): Promise<void> {
    const member = this.selectedPartyMember();
    if (!member) return;
    if (this.interactiveMode === "browse") {
      this.interactiveMode = "jobs";
      this.partyJobIndex = this.activeJobIndex(member);
      this.drawInteractiveOverlay();
      return;
    }
    if (this.interactiveMode === "jobs") {
      const job = member.jobOptions?.[this.partyJobIndex];
      if (!job) return;
      if (job.state === "locked") {
        this.showToast(job.requirement);
        return;
      }
      const result = await this.bridge.selectJob(member.id, job.id);
      this.showToast(result.message);
      return;
    }
    const slot = EQUIPMENT_SLOTS[this.equipmentIndex];
    if (!slot) return;
    if (!member.equipment?.[slot]) {
      this.showToast(`${slot[0]?.toUpperCase() ?? ""}${slot.slice(1)} slot is already empty.`);
      return;
    }
    const result = await this.bridge.setEquipment(member.id, slot);
    this.showToast(result.message);
  }

  private escape(): void {
    if (this.activeInteraction) {
      this.activeInteraction = undefined;
      this.closeOverlay();
      return;
    }
    if (this.overlayKind === "inventory" && this.interactiveMode === "target") {
      this.interactiveMode = "browse";
      this.selectedInventoryItemId = undefined;
      this.drawInteractiveOverlay();
    } else if (this.overlayKind === "party" && this.interactiveMode !== "browse") {
      this.interactiveMode = "browse";
      this.drawInteractiveOverlay();
    } else if (this.overlay) this.closeOverlay();
    else this.toggleOverlay("system");
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.overlayKind = undefined;
    this.activeInteraction = undefined;
    this.locked = false;
    this.refreshPrompt();
  }

  private async manualSave(): Promise<void> {
    if (this.activeInteraction) return;
    await this.bridge.save("manual-1");
    this.showToast("Chronicle saved to Manual Slot 1.");
  }

  private moveSystem(delta: number): void {
    this.systemIndex = Phaser.Math.Wrap(this.systemIndex + delta, 0, 11);
    this.drawSystemOverlay();
  }

  private drawSystemOverlay(): void {
    if (this.overlayKind !== "system") return;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.toggleOverlay("system");
  }

  private async confirmSystemCommand(): Promise<void> {
    if (this.systemBusy) return;
    if (this.systemIndex < 3) {
      const slot = (["manual-1", "manual-2", "manual-3"] as const)[this.systemIndex];
      if (!slot) return;
      await this.bridge.save(slot);
      this.showToast(`Chronicle saved to Manual Slot ${this.systemIndex + 1}.`);
      return;
    }
    if (this.systemIndex === 3) {
      await this.exportAutosave();
      return;
    }
    if (this.systemIndex === 4) {
      this.importAutosave();
      return;
    }
    if (this.systemIndex >= 5 && this.systemIndex <= 8) {
      const settings = gameSettingsStore.get();
      if (this.systemIndex === 5) gameSettingsStore.update({ highContrast: !settings.highContrast });
      else if (this.systemIndex === 6) gameSettingsStore.update({ reducedMotion: !settings.reducedMotion });
      else if (this.systemIndex === 7) gameSettingsStore.update({ soundEnabled: !settings.soundEnabled });
      else gameSettingsStore.update({ soundVolume: settings.soundVolume >= 1 ? 0 : Math.min(1, settings.soundVolume + 0.1) });
      playSound(this, "sfx.confirm");
      this.drawSystemOverlay();
      return;
    }
    if (this.systemIndex === 9) {
      await this.bridge.rest();
      this.closeOverlay();
      this.showToast("The party rests. HP and MP restored.");
      return;
    }
    this.returnToTitle();
  }

  private async exportAutosave(): Promise<void> {
    this.systemBusy = true;
    try {
      const json = await this.bridge.exportSave("autosave");
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "yggdrasil-chronicles-save.json";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      this.showToast("Autosave exported to yggdrasil-chronicles-save.json.");
    } catch (error) {
      this.showToast(error instanceof Error ? `Export failed: ${error.message}` : "Export failed.");
    } finally {
      this.systemBusy = false;
    }
  }

  private importAutosave(): void {
    this.systemBusy = true;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.append(input);
    let cleaned = false;
    const onWindowFocus = (): void => {
      window.setTimeout(() => {
        if (!input.files?.length) {
          this.showToast("Import cancelled.");
          cleanup();
        }
      }, 0);
    };
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
      this.systemBusy = false;
    };
    input.addEventListener("cancel", () => {
      this.showToast("Import cancelled.");
      cleanup();
    }, { once: true });
    input.addEventListener("change", () => {
      void this.importSelectedAutosave(input, cleanup);
    }, { once: true });
    window.addEventListener("focus", onWindowFocus, { once: true });
    try {
      input.click();
    } catch (error) {
      this.showToast(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
      cleanup();
    }
  }

  private async importSelectedAutosave(input: HTMLInputElement, cleanup: () => void): Promise<void> {
    try {
      const file = input.files?.[0];
      if (!file) {
        this.showToast("Import cancelled.");
        return;
      }
      const result = await this.bridge.importSave("autosave", await file.text());
      this.showToast(result.message);
    } catch (error) {
      this.showToast(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    } finally {
      cleanup();
    }
  }

  private returnToTitle(): void {
    if (this.overlayKind !== "system" || !this.overlay || !this.locked) return;
    this.cameras.main.fadeOut(motionDuration(180), 10, 18, 24);
    this.time.delayedCall(motionDuration(190), () => this.scene.start("title"));
  }

  private async launchEncounter(): Promise<void> {
    if (this.locked) return;
    const id = this.encounterSprite?.getData("encounterId") as string | undefined;
    if (!id) return;
    this.locked = true;
    await this.bridge.startEncounter(id);
    this.cameras.main.flash(motionDuration(220), 238, 221, 179);
    this.time.delayedCall(motionDuration(240), () => this.scene.start("battle"));
  }

  private showToast(message: string): void {
    const toast = this.add.text(280, 42, message, {
      ...TEXT.body,
      backgroundColor: "#101622ee",
      padding: { x: 14, y: 9 },
      color: COLORS.gold
    }).setOrigin(0.5).setDepth(80);
    this.tweens.add({
      targets: toast,
      alpha: 0,
      y: 30,
      duration: motionDuration(1600),
      delay: motionDuration(900),
      onComplete: () => toast.destroy()
    });
  }

  private formatTime(minutes: number): string {
    const normalized = minutes % (24 * 60);
    const hour = Math.floor(normalized / 60).toString().padStart(2, "0");
    const minute = (normalized % 60).toString().padStart(2, "0");
    return `Year 417 · ${hour}:${minute} · Rootbound Calendar`;
  }
}
