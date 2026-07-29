import Phaser from "phaser";
import { locations, npcs } from "../../content";
import type {
  GameBridge,
  GameSnapshot,
  InteractionView,
  OverlayKind,
  PartyMemberView
} from "../bridge";
import { gamepadButtonAction } from "../gamepadControls";
import { getNpcSpawnPoints } from "../npcPlacement";
import { announceScene, COLORS, getBridge, TEXT } from "../runtime";
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

type Point = { x: number; y: number };

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
    this.cameras.main.fadeIn(280, 10, 18, 24);
    this.renderLocation();
    this.bindKeys();
    this.unsubscribe = this.bridge.subscribe((snapshot) => {
      const changedLocation = snapshot.locationId !== this.snapshot.locationId;
      this.snapshot = snapshot;
      if (changedLocation) this.renderLocation();
      else this.renderHud();
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
    keyboard.on("keydown-UP", () => this.handleDirection("up"));
    keyboard.on("keydown-W", () => this.handleDirection("up"));
    keyboard.on("keydown-DOWN", () => this.handleDirection("down"));
    keyboard.on("keydown-S", () => this.handleDirection("down"));
    keyboard.on("keydown-LEFT", () => this.handleDirection("left"));
    keyboard.on("keydown-A", () => this.handleDirection("left"));
    keyboard.on("keydown-RIGHT", () => this.handleDirection("right"));
    keyboard.on("keydown-D", () => this.handleDirection("right"));
    keyboard.on("keydown-E", () => void this.interact());
    keyboard.on("keydown-SPACE", () => void this.interact());
    keyboard.on("keydown-ENTER", () => void this.interact());
    keyboard.on("keydown-J", () => this.toggleOverlay("journal"));
    keyboard.on("keydown-I", () => this.toggleOverlay("inventory"));
    keyboard.on("keydown-P", () => this.toggleOverlay("party"));
    keyboard.on("keydown-ESC", () => this.escape());
    keyboard.on("keydown-B", () => void this.launchEncounter());
    keyboard.on("keydown-F5", () => void this.manualSave());
    keyboard.on("keydown-T", () => this.returnToTitle());
    this.input.gamepad?.on("down", this.onGamepadButton, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.gamepad?.off("down", this.onGamepadButton, this));
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
      duration: 95,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.moving = false;
        this.refreshPrompt();
      }
    });
  }

  private async travelFromEdge(direction: ExitDirection): Promise<void> {
    const exit = getLocationExits(this.snapshot.locationId).find((candidate) => candidate.direction === direction);
    if (!exit) return;
    this.locked = true;
    this.cameras.main.fadeOut(180, 10, 18, 24);
    await this.bridge.travel(exit.targetId);
    this.time.delayedCall(200, () => {
      this.cameras.main.fadeIn(180, 10, 18, 24);
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
    if (npc) {
      this.prompt.setText("E / A  Talk");
    } else if (this.isNearEncounter()) {
      this.prompt.setText("E / A  Engage");
    } else {
      this.prompt.setText("D-pad Move   X Journal   Y Party   L1 Pack   Start Menu");
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
      return this.snapshot.quests.length
        ? this.snapshot.quests.map((quest) => `${quest.state === "active" ? "◆" : "◇"} ${quest.title}\n   ${quest.objective}`).join("\n\n")
        : "No threads have been recorded.";
    }
    if (kind === "inventory") {
      return this.snapshot.inventory.length
        ? this.snapshot.inventory.map((item) => `${item.name} ×${item.quantity}\n   ${item.description}`).join("\n\n")
        : "The travel pack is empty.";
    }
    if (kind === "party") {
      return this.snapshot.party.map((member) => this.memberSummary(member)).join("\n\n");
    }
    const commands = [
      "Save to Manual Slot 1",
      "Save to Manual Slot 2",
      "Save to Manual Slot 3",
      "Rest for eight hours",
      "Return to Title"
    ];
    return `${this.snapshot.chronicleHint}\n\n${commands.map((label, index) => `${index === this.systemIndex ? "›" : " "} ${label}`).join("\n\n")}`;
  }

  private memberSummary(member: PartyMemberView): string {
    return `${member.name}  —  ${member.ancestry} ${member.job}  Lv ${member.level}\nHP ${member.hp}/${member.maxHp}    MP ${member.mp}/${member.maxMp}`;
  }

  private escape(): void {
    if (this.activeInteraction) {
      this.activeInteraction = undefined;
      this.closeOverlay();
      return;
    }
    if (this.overlay) this.closeOverlay();
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
    this.systemIndex = Phaser.Math.Wrap(this.systemIndex + delta, 0, 5);
    this.drawSystemOverlay();
  }

  private drawSystemOverlay(): void {
    if (this.overlayKind !== "system") return;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.toggleOverlay("system");
  }

  private async confirmSystemCommand(): Promise<void> {
    if (this.systemIndex < 3) {
      const slot = (["manual-1", "manual-2", "manual-3"] as const)[this.systemIndex];
      if (!slot) return;
      await this.bridge.save(slot);
      this.showToast(`Chronicle saved to Manual Slot ${this.systemIndex + 1}.`);
      return;
    }
    if (this.systemIndex === 3) {
      await this.bridge.rest();
      this.closeOverlay();
      this.showToast("The party rests. HP and MP restored.");
      return;
    }
    this.returnToTitle();
  }

  private returnToTitle(): void {
    if (this.overlayKind !== "system" || !this.overlay || !this.locked) return;
    this.cameras.main.fadeOut(180, 10, 18, 24);
    this.time.delayedCall(190, () => this.scene.start("title"));
  }

  private async launchEncounter(): Promise<void> {
    if (this.locked) return;
    const id = this.encounterSprite?.getData("encounterId") as string | undefined;
    if (!id) return;
    this.locked = true;
    await this.bridge.startEncounter(id);
    this.cameras.main.flash(220, 238, 221, 179);
    this.time.delayedCall(240, () => this.scene.start("battle"));
  }

  private showToast(message: string): void {
    const toast = this.add.text(280, 42, message, {
      ...TEXT.body,
      backgroundColor: "#101622ee",
      padding: { x: 14, y: 9 },
      color: COLORS.gold
    }).setOrigin(0.5).setDepth(80);
    this.tweens.add({ targets: toast, alpha: 0, y: 30, duration: 1600, delay: 900, onComplete: () => toast.destroy() });
  }

  private formatTime(minutes: number): string {
    const normalized = minutes % (24 * 60);
    const hour = Math.floor(normalized / 60).toString().padStart(2, "0");
    const minute = (normalized % 60).toString().padStart(2, "0");
    return `Year 417 · ${hour}:${minute} · Rootbound Calendar`;
  }
}
