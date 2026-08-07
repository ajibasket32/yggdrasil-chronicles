import Phaser from "phaser";
import { codexSections, encounters, locations, npcs, portraitAppearance, spriteForEnemyId, vendorProfiles } from "../../content";
import { gameSettingsStore, nextTextSize } from "../../settings";
import type {
  BackupView,
  GameBridge,
  GameSaveSlot,
  GameSnapshot,
  InventoryView,
  InteractionView,
  OverlayKind,
  PartyMemberView
} from "../bridge";
import { gamepadButtonAction, pollStickDirection, type StickRepeatState } from "../gamepadControls";
import { keyboardActionForCode, keyboardCodeLabel } from "../keyboardControls";
import { windowAround, windowFooter, type OverlayWindow } from "../overlayWindow";
import { BUILDING_TILES, groundTile, tileVariant, treeAt, TREE_TILES, type TileRef } from "../tileset";
import { getNpcSpawnPoints } from "../npcPlacement";
import { musicForLocation, playMusic, stopMusic } from "../music";
import { announceGameStatus, announceScene, COLORS, fontPx, getBridge, motionDuration, playSound, setSceneFlag, TEXT } from "../runtime";
import {
  getLocationExits,
  getObjectiveGuidance,
  selectEncounterForLocation,
  type ExitDirection
} from "../worldNavigation";

const TILE = 32;
const MAP_COLUMNS = 23;
const MAP_ROWS = 17;

/**
 * Where the field encounter stands, per location. Every location previously
 * used the same hardcoded tile, so every map had its enemy in the same place.
 */
const ENCOUNTER_POINTS: Readonly<Record<string, Point>> = {
  "location.mossroad": { x: 14, y: 8 },
  "location.hollow-root": { x: 8, y: 5 },
  "location.ashfall-trail": { x: 17, y: 12 },
  "location.silent-kiln": { x: 6, y: 13 },
  "location.whitebough": { x: 12, y: 4 },
  "location.starless-vault": { x: 16, y: 11 }
};

/** Where each location's searchable curio sits. Kept clear of NPC spawn points. */
const CURIO_POINTS: Readonly<Record<string, Point>> = {
  "location.hearthcross": { x: 20, y: 5 },
  "location.mossroad": { x: 5, y: 13 },
  "location.hollow-root": { x: 15, y: 4 },
  "location.emberwake": { x: 2, y: 13 },
  "location.ashfall-trail": { x: 4, y: 4 },
  "location.silent-kiln": { x: 18, y: 6 },
  "location.larkspire": { x: 2, y: 4 },
  "location.whitebough": { x: 19, y: 13 },
  "location.starless-vault": { x: 3, y: 12 }
};
const HUD_X = MAP_COLUMNS * TILE;
const EQUIPMENT_SLOTS = ["weapon", "armor", "accessory"] as const;
/** Must match the length of the `commands` array built in overlayContent's "system" branch. */
const SYSTEM_MENU_COMMAND_COUNT = 18;

/** Load-menu ordering, matching SAVE_SLOTS in the save module. */
const SAVE_SLOT_ORDER = ["autosave", "quick", "manual-1", "manual-2", "manual-3"] as const;
const SAVE_SLOT_LABELS: Readonly<Record<GameSaveSlot, string>> = {
  autosave: "Autosave",
  quick: "Quick Save",
  "manual-1": "Manual Slot 1",
  "manual-2": "Manual Slot 2",
  "manual-3": "Manual Slot 3"
};

/**
 * Actions the slot picker can carry out. `save`, `import` and `delete` destroy
 * whatever is in the chosen slot, so they arm on the first confirm and commit
 * on the second.
 */
type SlotPickerAction = "save" | "export" | "import" | "delete";
const DESTRUCTIVE_SLOT_ACTIONS: ReadonlySet<SlotPickerAction> = new Set<SlotPickerAction>([
  "save",
  "import",
  "delete"
]);

function formatPlayTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
/** Rows that fit the overlay panel without the cursor leaving the visible area. */
const INVENTORY_VISIBLE_ROWS = 6;
const SHOP_VISIBLE_ROWS = 5;

type Point = { x: number; y: number };
type InteractiveOverlayMode = "browse" | "target" | "jobs" | "equipment";

export class WorldScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private snapshot!: Readonly<GameSnapshot>;
  private player!: Phaser.GameObjects.Image;
  private playerGrid: Point = { x: 5, y: 9 };
  private moving = false;
  private locked = false;
  /**
   * True only while an awaited bridge call is in flight (travel, encounter
   * launch). Distinguishes "busy, will unlock itself" from "an overlay owns
   * input", so `escape()` can still reach the system menu in the latter case.
   */
  private transitioning = false;
  private unsubscribe?: () => void;
  private hud?: Phaser.GameObjects.Container;
  private prompt?: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;
  private overlayKind?: OverlayKind;
  private systemIndex = 0;
  /** Which codex section is open; the codex pages a section at a time. */
  private codexIndex = 0;
  private remedyIndex = 0;
  private inventoryIndex = 0;
  private partyIndex = 0;
  private partyJobIndex = 0;
  private equipmentIndex = 0;
  private interactiveMode: InteractiveOverlayMode = "browse";
  private selectedInventoryItemId?: string;
  private systemBusy = false;
  /** Set when a palette or type-scale change needs the map repainted on exit. */
  private restyleOnClose = false;
  /** Where the party stood when a battle began; scene fields survive the scene restart. */
  private battleReturnGrid?: Point;
  /**
   * The system menu's sub-view. While set, the command list is replaced by a
   * list of save slots (or archived backups) and every key routes to it.
   */
  private systemPicker?: {
    action: SlotPickerAction | "restore";
    index: number;
    /** Slot or backup id awaiting a second confirm, for the destructive actions. */
    armed?: string;
  };
  private backupChoices: BackupView[] = [];
  /** Save row armed by a first confirm, awaiting the second that overwrites it. */
  private armedSaveSlot?: GameSaveSlot;
  private shopIndex = 0;
  private shopMode: "buy" | "sell" = "buy";
  private npcSprites: Array<{ id: string; point: Point; sprite: Phaser.GameObjects.Image }> = [];
  private encounterSprite?: Phaser.GameObjects.Image;
  private activeInteraction?: {
    view: InteractionView;
    index: number;
    choiceIndex: number;
    /** Set once the player has armed an irreversible choice; the next confirm commits it. */
    confirmingChoiceId?: string;
  };
  /** A scripted scene currently playing, and how far through it the player is. */
  private activeScene?: { id: string; index: number };
  /** Which edge the party crossed to get here; decides where they appear. */
  private entryDirection?: ExitDirection;
  /** Cursor for the world-map overlay. */
  private mapIndex = 0;
  /** Cursor for the journal overlay. */
  private journalIndex = 0;
  /** The searchable curio in this location, when it has not been claimed yet. */
  private curio?: { point: Point; sprite: Phaser.GameObjects.Text };
  /** Typewriter reveal in progress, if any. */
  private revealTimer?: Phaser.Time.TimerEvent;
  private revealTarget?: { target: Phaser.GameObjects.Text; full: string };
  /** Day/night wash over the map; updated when world time advances. */
  private dayTint?: Phaser.GameObjects.Rectangle;
  private endingShown = false;
  /** Analog-stick repeat state; buttons arrive as events, the stick must be polled. */
  private readonly stickState: StickRepeatState = { nextAt: 0 };

  constructor() {
    super("world");
  }

  create(): void {
    this.bridge = getBridge(this);
    this.snapshot = this.bridge.getSnapshot();
    // create() re-runs on every scene.start("world"), including the return from
    // the title after finishing a campaign. Without this reset a second
    // playthrough in the same tab silently never shows its ending.
    this.endingShown = false;
    this.locked = false;
    this.transitioning = false;
    this.cameras.main.fadeIn(motionDuration(280), 10, 18, 24);
    this.renderLocation();
    this.bindKeys();
    this.unsubscribe = this.bridge.subscribe((snapshot) => {
      const changedLocation = snapshot.locationId !== this.snapshot.locationId;
      this.snapshot = snapshot;
      if (changedLocation) this.renderLocation();
      else {
        this.renderHud();
        // Resting and long errands advance the clock without moving; the light
        // should follow the time either way.
        this.applyDayTint();
        if (this.overlayKind === "inventory" || this.overlayKind === "party") this.drawInteractiveOverlay();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    announceScene("world");
    this.publishUiState();
    if (this.snapshot.pendingScene) {
      this.time.delayedCall(200, () => this.playPendingScene());
    } else if (this.snapshot.campaign?.complete) {
      this.time.delayedCall(250, () => this.showCampaignEnding());
    }
  }

  /**
   * Plays a scripted story beat: an authored sequence with its own speakers,
   * rather than an NPC's rotating small talk. Reuses the dialogue presentation
   * so a scene reads like the rest of the game's conversation.
   */
  private playPendingScene(): void {
    const scene = this.snapshot.pendingScene;
    if (!scene || this.activeScene || this.activeInteraction) return;
    // An arrival beat waits for the party to actually be there. It stays
    // pending, so stepping back into the place plays it then.
    if (scene.locationId && scene.locationId !== this.snapshot.locationId) return;
    this.activeScene = { id: scene.id, index: 0 };
    this.locked = true;
    this.publishUiState();
    this.drawSceneLine();
  }

  /**
   * A name plate with the speaker's face, drawn above a dialogue panel.
   *
   * The thirty authored `assetTag`s reached no code at all, so every speaker in
   * the game arrived as the same gold label. Portrait art is not in the
   * repository and ASSETS.md forbids fetching any, so the face comes from the
   * committed CC0 character sheets: a specific sheet and tint per speaker.
   * Returns the objects to add; callers own the container.
   */
  private buildNamePlate(
    x: number,
    y: number,
    speaker: string,
    role: string | undefined,
    portraitTag: string | undefined
  ): Phaser.GameObjects.GameObject[] {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const portrait = portraitAppearance(portraitTag);
    const hasFace = portrait !== undefined && this.textures.exists(portrait.spriteKey);
    if (hasFace) {
      parts.push(this.add.rectangle(x, y - 4, 52, 52, COLORS.ink, 0.95).setOrigin(0).setStrokeStyle(2, 0x8aa394));
      const face = this.add.image(x + 26, y + 22, portrait.spriteKey, portrait.frame)
        .setOrigin(0.5)
        .setDisplaySize(48, 48)
        .setTint(portrait.tint);
      parts.push(face);
    }
    const textX = hasFace ? x + 64 : x;
    parts.push(this.add.text(textX, y, speaker.toUpperCase(), { ...TEXT.small, color: COLORS.gold }));
    if (role) {
      parts.push(this.add.text(textX, y + 17, role, { ...TEXT.small, color: COLORS.muted }));
    }
    return parts;
  }

  private drawSceneLine(): void {
    const scene = this.snapshot.pendingScene;
    const active = this.activeScene;
    if (!scene || !active) return;
    const line = scene.lines[active.index];
    if (!line) {
      void this.finishScene();
      return;
    }

    this.overlay?.destroy();
    const scrim = this.add.rectangle(0, 0, 960, 540, COLORS.ink, 0.45).setOrigin(0);
    const panel = this.add.rectangle(0, 340, 960, 200, COLORS.panel, 1).setOrigin(0);
    const edge = this.add.rectangle(0, 340, 960, 2, 0x6f8f82).setOrigin(0);
    const children: Phaser.GameObjects.GameObject[] = [scrim, panel, edge];

    // Narration has no speaker; style it apart from spoken lines so the two
    // never read as the same voice.
    if (line.speaker) {
      children.push(...this.buildNamePlate(40, 362, line.speaker, undefined, line.portraitTag));
    }
    const speakerInset = line.speaker && portraitAppearance(line.portraitTag) ? 104 : 40;
    const body = this.add.text(speakerInset, line.speaker ? 396 : 380, "", {
      ...TEXT.body,
      fontSize: fontPx(line.speaker ? 15 : 14),
      color: line.speaker ? COLORS.cream : COLORS.muted,
      fontStyle: line.speaker ? "normal" : "italic",
      wordWrap: { width: 910 - speakerInset },
      lineSpacing: 8
    });
    children.push(body);
    this.startReveal(body, line.text);
    children.push(this.add.text(40, 500, `${active.index + 1} / ${scene.lines.length}   Enter  Continue`, TEXT.small));

    this.overlay = this.add.container(0, 0, children).setDepth(70);
    this.overlayKind = undefined;
  }

  /**
   * Two-stage confirm for revealed text: while the typewriter is running,
   * confirm completes the line; only a second press advances it. Reduced
   * Motion reveals instantly, so the first press always advances there.
   */
  private startReveal(target: Phaser.GameObjects.Text, full: string): void {
    this.revealTimer?.remove();
    this.revealTimer = undefined;
    if (motionDuration(1) === 0 || full.length === 0) {
      target.setText(full);
      return;
    }
    let shown = 0;
    this.revealTarget = { target, full };
    this.revealTimer = this.time.addEvent({
      delay: 14,
      repeat: Math.ceil(full.length / 2),
      callback: () => {
        shown = Math.min(full.length, shown + 2);
        if (target.active) target.setText(full.slice(0, shown));
        if (shown >= full.length) {
          this.revealTimer?.remove();
          this.revealTimer = undefined;
          this.revealTarget = undefined;
        }
      }
    });
  }

  /** Finishes an in-progress reveal; true when there was one to finish. */
  private completeReveal(): boolean {
    if (!this.revealTimer || !this.revealTarget) return false;
    this.revealTimer.remove();
    this.revealTimer = undefined;
    if (this.revealTarget.target.active) this.revealTarget.target.setText(this.revealTarget.full);
    this.revealTarget = undefined;
    return true;
  }

  private async advanceScene(): Promise<void> {
    if (this.completeReveal()) return;
    const scene = this.snapshot.pendingScene;
    const active = this.activeScene;
    if (!scene || !active) return;
    if (active.index < scene.lines.length - 1) {
      active.index += 1;
      this.drawSceneLine();
      return;
    }
    await this.finishScene();
  }

  private async finishScene(): Promise<void> {
    const active = this.activeScene;
    this.activeScene = undefined;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.locked = false;
    if (active) await this.bridge.acknowledgeScene(active.id);
    this.refreshPrompt();
    if (this.snapshot.campaign?.complete) this.showCampaignEnding();
  }

  override update(time: number): void {
    const direction = pollStickDirection(this.input.gamepad?.getPad(0), this.stickState, time);
    if (direction) this.handleDirection(direction);
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
    if (!action) return;
    // Claim the key before acting on it. Without this the browser's own meaning
    // still fires — the reason a quick-save could navigate the tab away
    // mid-write — and arrow keys scroll the page behind the canvas.
    event.preventDefault();
    if (action === "up" || action === "down" || action === "left" || action === "right") this.handleDirection(action);
    else if (action === "confirm" || action === "interact") void this.interact();
    else if (action === "cancel") this.escape();
    else if (action === "journal") this.toggleOverlay("journal");
    else if (action === "inventory") this.toggleOverlay("inventory");
    else if (action === "party") this.toggleOverlay("party");
    else if (action === "encounter") void this.launchEncounter();
    else if (action === "quickSave") void this.quickSave();
    else if (action === "quickLoad") void this.quickLoad();
    else if (action === "codex") this.toggleOverlay("codex");
    else if (action === "map") this.toggleOverlay("map");
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
    const activeChoices = this.activeInteraction?.view.choices;
    if (
      this.activeInteraction
      && this.activeInteraction.index >= this.activeInteraction.view.lines.length - 1
      && activeChoices?.length
    ) {
      const delta = direction === "up" || direction === "left" ? -1 : 1;
      this.activeInteraction.choiceIndex = Phaser.Math.Wrap(
        this.activeInteraction.choiceIndex + delta,
        0,
        activeChoices.length
      );
      // Moving off a choice disarms it, so the confirmation always refers to
      // the option currently under the cursor.
      this.activeInteraction.confirmingChoiceId = undefined;
      this.drawDialogue();
      return;
    }
    if (this.overlayKind === "system") {
      if (direction === "up" || direction === "left") this.moveSystem(-1);
      else this.moveSystem(1);
      return;
    }
    if (this.overlayKind === "codex") {
      this.moveCodex(direction === "up" || direction === "left" ? -1 : 1);
      return;
    }
    if (this.overlayKind === "remedies") {
      this.moveRemedy(direction === "up" || direction === "left" ? -1 : 1);
      return;
    }
    if (this.overlayKind === "map") {
      this.moveMap(direction === "up" || direction === "left" ? -1 : 1);
      return;
    }
    if (this.overlayKind === "journal") {
      this.moveJournal(direction === "up" || direction === "left" ? -1 : 1);
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
    if (this.overlayKind === "shop") {
      this.moveShop(direction);
      return;
    }
    void this.tryMove(direction);
  }

  private renderLocation(resetPlayerPosition = true): void {
    // Destroy, do not merely detach: a bare removeAll() leaves every Text's
    // backing canvas and game-scoped texture alive, so each repaint leaks.
    this.children.removeAll(true);
    this.npcSprites = [];
    // Every field below referenced an object the clear just destroyed. Dropping
    // the references keeps them from being re-destroyed or drawn into.
    this.hud = undefined;
    this.overlay = undefined;
    this.overlayKind = undefined;
    this.prompt = undefined;
    this.encounterSprite = undefined;
    this.locked = false;
    if (resetPlayerPosition) {
      // Returning from a battle resumes the tile the fight started on. The
      // scene previously fell through to the arrival point, teleporting a
      // party two-thirds across a map back to its border after every fight.
      if (this.battleReturnGrid) {
        this.playerGrid = this.battleReturnGrid;
        this.battleReturnGrid = undefined;
      } else {
        this.playerGrid = this.arrivalPoint();
      }
    }
    const location = locations.find(({ id }) => id === this.snapshot.locationId) ?? locations[0];
    if (!location) return;

    const kind = location.kind;
    const regionId = location.regionId;
    const wash = this.regionWash(kind, regionId);
    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let column = 0; column < MAP_COLUMNS; column += 1) {
        const ground = groundTile(kind, column, row, MAP_COLUMNS, MAP_ROWS);
        this.add.image(column * TILE, row * TILE, ground.sheet, ground.frame)
          .setOrigin(0)
          .setDisplaySize(TILE, TILE)
          .setTint(wash);
        const tree = treeAt(kind, column, row, MAP_COLUMNS, MAP_ROWS);
        if (tree) {
          this.add.image(column * TILE, row * TILE, tree.sheet, tree.frame)
            .setOrigin(0)
            .setDisplaySize(TILE, TILE)
            .setDepth(1)
            .setTint(wash);
        }
      }
    }
    this.paintLandmarks(kind, regionId);
    this.paintExits(location.id);
    this.spawnNpcs(location.id);
    if (kind !== "town") this.spawnEncounter(location.id);
    this.spawnCurio(location.id);
    this.player = this.add.image(this.playerGrid.x * TILE + 16, this.playerGrid.y * TILE + 16, "sprite.player");
    this.player.setDepth(10);
    this.applyDayTint();
    playMusic(this, musicForLocation(kind));
    this.renderHud();
    this.prompt = this.add.text(18, 496, "", {
      ...TEXT.body,
      backgroundColor: "#101622dd",
      padding: { x: 9, y: 6 }
    }).setDepth(30);
    this.refreshPrompt();
  }

  /**
   * WORLD_BIBLE.md gives each region a distinct character (rain-bright
   * Verdant Reach, basalt/ash Cinder March, pale frost Pale Canopy). These
   * per-region palettes and landmark shapes keep that distinction visible in
   * the tile map instead of every region rendering identically by tile kind
   * alone.
   */
  /**
   * A gentle regional wash over real terrain art.
   *
   * The old per-tile recolour existed to make four flat squares look like three
   * different regions. Applied to actual tiles it would bury them, so this is a
   * light multiply: the Cinder March runs warm, the Pale Canopy cold, and the
   * Verdant Reach is left alone.
   */
  private regionWash(kind: "town" | "wilderness" | "dungeon", regionId: string): number {
    if (kind === "dungeon") {
      if (regionId === "region.cinder-march") return 0xd8b8a4;
      if (regionId === "region.pale-canopy") return 0xc8d4e4;
      return 0xffffff;
    }
    if (regionId === "region.cinder-march") return 0xe8c8a8;
    if (regionId === "region.pale-canopy") return 0xd8e6f0;
    return 0xffffff;
  }

  private paintLandmarks(kind: "town" | "wilderness" | "dungeon", regionId: string): void {
    // Depth 3: the accents (kiln glow, dome) sit over the settlement images at
    // depth 2 — at equal depth the buildings, added later, covered them.
    const graphics = this.add.graphics().setDepth(3);
    if (kind === "town") {
      this.paintSettlement(regionId);
      if (regionId === "region.cinder-march") {
        // Emberwake keeps its kiln: a chimney glow and the basalt spoil rocks.
        graphics.fillStyle(0xd9762f, 0.8).fillRect(5.6 * TILE, 2.4 * TILE, 12, 20);
        graphics.lineStyle(4, 0xff9d52, 0.4).strokeCircle(5.8 * TILE, 2.5 * TILE, 14);
        for (let rock = 0; rock < 6; rock += 1) {
          graphics.fillStyle(0x4a413c).fillCircle((3 + rock * 3) * TILE, 13 * TILE, 20);
        }
      } else if (regionId === "region.pale-canopy") {
        // Larkspire keeps its observatory dome above the hall.
        graphics.fillStyle(0xdde3e6).fillCircle(5.9 * TILE, 2.6 * TILE, 11);
        graphics.lineStyle(2, 0x8c98a2, 0.8).strokeCircle(5.9 * TILE, 2.6 * TILE, 11);
        this.paintOrchard(0xd8e6f0);
      } else {
        this.paintOrchard(0xffffff);
      }
    } else if (kind === "wilderness") {
      if (regionId === "region.cinder-march") {
        // Ashfall Trail: a cinder track through cracked basalt, no green ridgeline.
        graphics.lineStyle(16, 0x453a34, 0.9).beginPath().moveTo(0, 10 * TILE).lineTo(HUD_X, 7 * TILE).strokePath();
        graphics.lineStyle(5, 0x2d2622, 0.85).beginPath().moveTo(5 * TILE, 0).lineTo(10 * TILE, 5 * TILE).lineTo(8 * TILE, 17 * TILE).strokePath();
        graphics.fillStyle(0xd9762f, 0.35).fillCircle(15 * TILE, 4 * TILE, 6).fillCircle(18 * TILE, 12 * TILE, 5);
      } else if (regionId === "region.pale-canopy") {
        // Whitebough Traverse: a frost bridge track over pale branch-lines.
        graphics.lineStyle(16, 0xb6c0c8, 0.9).beginPath().moveTo(0, 10 * TILE).lineTo(HUD_X, 7 * TILE).strokePath();
        graphics.lineStyle(5, 0xe4eaec, 0.85).beginPath().moveTo(5 * TILE, 0).lineTo(10 * TILE, 5 * TILE).lineTo(8 * TILE, 17 * TILE).strokePath();
      } else {
        graphics.lineStyle(16, 0x71604d, 0.9).beginPath().moveTo(0, 10 * TILE).lineTo(HUD_X, 7 * TILE).strokePath();
        graphics.lineStyle(5, 0x526d55, 0.8).beginPath().moveTo(5 * TILE, 0).lineTo(10 * TILE, 5 * TILE).lineTo(8 * TILE, 17 * TILE).strokePath();
      }
    } else {
      graphics.fillStyle(0x151923).fillRect(0, 0, HUD_X, TILE);
      graphics.fillStyle(0x151923).fillRect(0, 16 * TILE, HUD_X, TILE);
      if (regionId === "region.cinder-march") {
        graphics.fillStyle(0xd9762f).fillCircle(4 * TILE, 4 * TILE, 7).fillCircle(19 * TILE, 12 * TILE, 7);
        graphics.lineStyle(4, 0xff9d52, 0.5).strokeCircle(4 * TILE, 4 * TILE, 17).strokeCircle(19 * TILE, 12 * TILE, 17);
      } else if (regionId === "region.pale-canopy") {
        graphics.fillStyle(0xd6e2e8).fillCircle(4 * TILE, 4 * TILE, 7).fillCircle(19 * TILE, 12 * TILE, 7);
        graphics.lineStyle(4, 0xeef4f6, 0.5).strokeCircle(4 * TILE, 4 * TILE, 17).strokeCircle(19 * TILE, 12 * TILE, 17);
      } else {
        graphics.fillStyle(0x947252).fillCircle(4 * TILE, 4 * TILE, 7).fillCircle(19 * TILE, 12 * TILE, 7);
        graphics.lineStyle(4, 0xc58f55, 0.5).strokeCircle(4 * TILE, 4 * TILE, 17).strokeCircle(19 * TILE, 12 * TILE, 17);
      }
    }
  }

  /**
   * The settlement orchard, drawn from the tileset rather than as filled
   * circles. Six trees on a row: the same planting the circles described, in
   * art that matches the ground they stand on.
   */
  private paintOrchard(tint: number): void {
    for (let tree = 0; tree < 6; tree += 1) {
      const column = 3 + tree * 3;
      const ref = TREE_TILES[tileVariant(column, 13, TREE_TILES.length)];
      if (!ref) continue;
      this.add.image(column * TILE, 12.5 * TILE, ref.sheet, ref.frame)
        .setOrigin(0.5, 0)
        .setDisplaySize(TILE * 1.6, TILE * 1.6)
        .setDepth(2)
        .setTint(tint);
    }
  }

  /**
   * The settlement itself, from the tileset's complete building tiles: a hall,
   * a row of houses, a shopfront where the vendor trades, and the village
   * well. Scenery like the trees — the map has no collision — tinted by the
   * regional wash so Emberwake runs warm and Larkspire cold.
   */
  private paintSettlement(regionId: string): void {
    const wash = this.regionWash("town", regionId);
    const place = (
      ref: TileRef,
      column: number,
      row: number,
      size = TILE
    ): void => {
      this.add.image((column + 0.5) * TILE, (row + 1) * TILE, ref.sheet, ref.frame)
        .setOrigin(0.5, 1)
        .setDisplaySize(size, size)
        .setDepth(2)
        .setTint(wash);
    };
    // The hall, half again the size of a house, where the old rectangle stood.
    place(BUILDING_TILES.shopB, 5.5, 4, TILE * 3);
    place(BUILDING_TILES.dormerA, 3, 4.5);
    place(BUILDING_TILES.windowC, 8, 4.5);
    // The east row the old bench rectangle sketched: three homes and a hut.
    place(BUILDING_TILES.plainB, 13, 4);
    place(BUILDING_TILES.dormerC, 15, 4.3);
    place(BUILDING_TILES.greenHut, 17, 4);
    place(BUILDING_TILES.windowA, 19, 4.3);
    // The village well, off the walking lanes.
    place(BUILDING_TILES.wellA, 10.5, 5.5);
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
    // Someone travelling with the party cannot also be standing in their home
    // town waiting to be recruited again.
    const travelling = new Set([
      ...this.snapshot.party.map(({ id }) => id),
      ...(this.snapshot.reserve ?? []).map(({ id }) => id)
    ]);
    const residents = npcs
      .filter((npc) => npc.locationId === locationId)
      .filter((npc) => !travelling.has(npc.id.replace("npc.", "party.")))
      .slice(0, 12);
    const points = getNpcSpawnPoints(residents.length);
    const guidance = getObjectiveGuidance(this.snapshot);
    residents.forEach((npc, index) => {
      const point = points[index];
      if (!point) return;
      const sprite = this.add.image(point.x * TILE + 16, point.y * TILE + 16, "sprite.npc").setDepth(8);
      const isObjective = guidance?.local && guidance.targetEntityId === npc.id;
      const isVendor = vendorProfiles.some((vendor) => vendor.npcId === npc.id);
      // Vendors were indistinguishable from villagers, so a player had to talk
      // to everyone to discover a shop existed. A tint plus a mark is enough,
      // and it never overrides the objective marker.
      sprite.setTint(isObjective ? 0xffdf78 : isVendor ? 0x9fd3c7 : index % 2 === 0 ? 0xffffff : 0xe8d4a8);
      this.npcSprites.push({ id: npc.id, point, sprite });
      if (isObjective || isVendor) {
        this.add.text(point.x * TILE + 16, point.y * TILE - 31, isObjective ? "◆" : "⌂", {
          ...TEXT.small,
          color: isObjective ? COLORS.gold : "#9fd3c7"
        }).setOrigin(0.5).setDepth(10);
      }
      this.add.text(point.x * TILE + 16, point.y * TILE - 15, npc.name.split(" ")[0] ?? npc.name, {
        ...TEXT.small,
        fontSize: fontPx(9),
        backgroundColor: "#101622aa",
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5).setDepth(9);
    });
  }

  private spawnEncounter(locationId: string): void {
    this.encounterSprite?.destroy();
    const activeQuest = this.snapshot.quests.find(({ state }) => state === "active");
    const encounter = selectEncounterForLocation(locationId, activeQuest, this.snapshot.campaignComplete);
    if (!encounter) return;
    const point = ENCOUNTER_POINTS[locationId] ?? { x: 14, y: 8 };
    // The marker is the encounter's own first foe — the same sprite and tint
    // battle will show — not a placeholder standing in for "monster".
    const firstEnemyId = encounters.find(({ id }) => id === encounter)?.enemyIds[0];
    const look = spriteForEnemyId(firstEnemyId ?? "");
    this.encounterSprite = this.add.image(point.x * TILE + 16, point.y * TILE + 16, look.spriteKey, 0)
      .setDepth(8)
      .setTint(look.tint);
    this.encounterSprite.setData("encounterId", encounter);
    const guidance = getObjectiveGuidance(this.snapshot);
    if (guidance?.local && (activeQuest?.objectiveKind === "defeat" || activeQuest?.objectiveKind === "collect")) {
      this.add.text(point.x * TILE + 16, point.y * TILE - 15, "◆ OBJECTIVE", {
        ...TEXT.small,
        fontSize: fontPx(9),
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
    // The header block flows rather than sitting at fixed offsets: a location
    // name or a clock line takes however many rows the player's text size needs,
    // and Large used to run the clock straight through the PARTY heading.
    const name = this.add.text(HUD_X + 18, 20, snapshot.locationName.toUpperCase(), { ...TEXT.heading, fontSize: fontPx(17), wordWrap: { width: 188 } });
    children.push(name);
    // Marks belong on the HUD, not only inside a shop: a player deciding
    // whether to walk to a vendor needs to know what they can afford first.
    const clock = this.add.text(
      HUD_X + 18,
      name.y + name.height + 12,
      `${this.formatTime(snapshot.worldMinutes)}  ·  ${snapshot.difficulty.toUpperCase()}  ·  ${snapshot.currency} marks`,
      { ...TEXT.small, wordWrap: { width: 188 }, lineSpacing: 3 }
    );
    children.push(clock);
    const ruleY = clock.y + clock.height + 10;
    children.push(this.add.rectangle(HUD_X + 18, ruleY, 188, 1, COLORS.panelLight).setOrigin(0));
    const partyHeading = this.add.text(HUD_X + 18, ruleY + 14, "PARTY", { ...TEXT.small, color: COLORS.gold });
    children.push(partyHeading);
    const partyTop = partyHeading.y + partyHeading.height + 8;
    snapshot.party.slice(0, 4).forEach((member, index) => {
      const y = partyTop + index * 63;
      children.push(this.add.rectangle(HUD_X + 18, y, 34, 34, member.portraitTint).setOrigin(0));
      children.push(this.add.text(HUD_X + 61, y - 2, `${member.name}  Lv ${member.level}`, { ...TEXT.body, fontSize: fontPx(12), wordWrap: { width: 145 } }));
      children.push(this.add.text(HUD_X + 61, y + 16, `HP ${member.hp}/${member.maxHp}  MP ${member.mp}/${member.maxMp}`, { ...TEXT.small, fontSize: fontPx(9) }));
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
    children.push(this.add.text(HUD_X + 18, 524, saveLabel, { ...TEXT.small, fontSize: fontPx(9), color: snapshot.autosave === "error" ? "#ef7882" : COLORS.muted }));
    const campaign = snapshot.campaign;
    if (campaign) {
      children.push(this.add.text(HUD_X + 188, 524, `MAIN ${campaign.completedMainQuests}/${campaign.totalMainQuests}`, {
        ...TEXT.small,
        fontSize: fontPx(9),
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

  /**
   * The camera is faded to black across an await here, so a rejection must never
   * skip the fade back in: the player would be left on a black screen where even
   * the system-menu recovery is invisible.
   */
  /**
   * Crossing east means arriving from the west, and so on. The party used to
   * materialise at the same central tile regardless of which way they came in,
   * which broke any sense that the maps are joined.
   */
  private arrivalPoint(): Point {
    const previous = this.playerGrid;
    const clampX = (x: number): number => Phaser.Math.Clamp(x, 1, MAP_COLUMNS - 2);
    const clampY = (y: number): number => Phaser.Math.Clamp(y, 1, MAP_ROWS - 2);
    switch (this.entryDirection) {
      case "right": return { x: 1, y: clampY(previous.y) };
      case "left": return { x: MAP_COLUMNS - 2, y: clampY(previous.y) };
      case "down": return { x: clampX(previous.x), y: 1 };
      case "up": return { x: clampX(previous.x), y: MAP_ROWS - 2 };
      default: return { x: 5, y: 9 };
    }
  }

  private async travelFromEdge(direction: ExitDirection): Promise<void> {
    const exit = getLocationExits(this.snapshot.locationId).find((candidate) => candidate.direction === direction);
    if (!exit) return;
    this.entryDirection = direction;
    this.locked = true;
    this.transitioning = true;
    this.cameras.main.fadeOut(motionDuration(180), 10, 18, 24);
    try {
      await this.bridge.travel(exit.targetId);
      this.time.delayedCall(motionDuration(200), () => {
        this.cameras.main.fadeIn(motionDuration(180), 10, 18, 24);
        playSound(this, "sfx.door");
        this.locked = false;
      });
    } catch (error) {
      console.error("Travel failed", error);
      this.cameras.main.fadeIn(motionDuration(180), 10, 18, 24);
      this.locked = false;
      this.showToast("The road ahead could not be reached.");
    } finally {
      this.transitioning = false;
    }
  }

  /**
   * The world clock finally changes something visible: a wash over the map
   * that follows the time of day. Purely presentational — spawns and dialogue
   * are governed by the deterministic systems, not by lighting.
   */
  private applyDayTint(): void {
    this.dayTint?.destroy();
    const minutes = this.snapshot.worldMinutes % 1440;
    const hour = minutes / 60;
    let color = 0x000000;
    let alpha = 0;
    if (hour >= 21 || hour < 5) {
      color = 0x0a1230;
      alpha = 0.34;
    } else if (hour >= 18) {
      color = 0x542a16;
      alpha = 0.18;
    } else if (hour < 7) {
      color = 0x2a2246;
      alpha = 0.16;
    }
    if (alpha === 0) {
      this.dayTint = undefined;
      return;
    }
    this.dayTint = this.add.rectangle(0, 0, MAP_COLUMNS * TILE, MAP_ROWS * TILE, color, alpha)
      .setOrigin(0)
      .setDepth(12);
  }

  /** A once-per-chronicle searchable object, so the world has something to find besides people. */
  private spawnCurio(locationId: string): void {
    this.curio?.sprite.destroy();
    this.curio = undefined;
    if (this.snapshot.curioSearched) return;
    const point = CURIO_POINTS[locationId];
    if (!point) return;
    const sprite = this.add.text(point.x * TILE + 16, point.y * TILE + 16, "◈", {
      ...TEXT.heading,
      fontSize: fontPx(18),
      color: "#d8c27a"
    }).setOrigin(0.5).setDepth(8);
    this.curio = { point, sprite };
  }

  private isNearCurio(): boolean {
    if (!this.curio) return false;
    return Math.abs(this.curio.point.x - this.playerGrid.x) + Math.abs(this.curio.point.y - this.playerGrid.y) <= 1;
  }

  private async searchCurio(): Promise<void> {
    if (!this.curio) return;
    const result = await this.bridge.searchLocation();
    this.showToast(result.message);
    if (result.success) {
      playSound(this, "sfx.coin");
      this.curio.sprite.destroy();
      this.curio = undefined;
      this.refreshPrompt();
    }
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
    if (!this.prompt) return;
    // Anything that owns the screen also owns the bottom-left corner: the
    // prompt chip previously stayed lit over dialogue and menus.
    const occupied = this.locked || this.overlay !== undefined
      || this.activeInteraction !== undefined || this.activeScene !== undefined;
    this.prompt.setVisible(!occupied);
    if (occupied) return;
    const npc = this.nearestNpc();
    const bindings = gameSettingsStore.get().keyBindings;
    if (npc) {
      this.prompt.setText(`${keyboardCodeLabel(bindings.interact[0] ?? "")} / A  Talk`);
    } else if (this.isNearEncounter()) {
      this.prompt.setText(`${keyboardCodeLabel(bindings.interact[0] ?? "")} / A  Engage`);
    } else if (this.isNearCurio()) {
      this.prompt.setText(`${keyboardCodeLabel(bindings.interact[0] ?? "")} / A  Search`);
    } else {
      this.prompt.setText(
        `${keyboardCodeLabel(bindings.journal[0] ?? "")} Journal   ${keyboardCodeLabel(bindings.party[0] ?? "")} Party   `
        + `${keyboardCodeLabel(bindings.map[0] ?? "")} Map   ${keyboardCodeLabel(bindings.cancel[0] ?? "")} Menu`
      );
    }
  }

  private async interact(): Promise<void> {
    // A scripted scene owns confirm until it finishes.
    if (this.activeScene) {
      await this.advanceScene();
      return;
    }
    if (this.activeInteraction) {
      await this.advanceDialogue();
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
    if (this.overlayKind === "shop") {
      await this.confirmShop();
      return;
    }
    if (this.overlayKind === "map") {
      await this.confirmMapTravel();
      return;
    }
    if (this.overlayKind === "journal") {
      await this.confirmJournalTrack();
      return;
    }
    if (this.overlayKind === "remedies") {
      await this.confirmRemedy();
      return;
    }
    if (this.overlayKind === "ending") {
      this.drawCredits();
      return;
    }
    if (this.overlay) return;
    const npc = this.nearestNpc();
    if (npc) {
      this.locked = true;
      const view = await this.bridge.interactNpc(npc.id);
      this.activeInteraction = { view, index: 0, choiceIndex: 0 };
      this.drawDialogue();
      return;
    }
    if (this.isNearEncounter()) {
      await this.launchEncounter();
      return;
    }
    if (this.isNearCurio()) await this.searchCurio();
  }

  private publishUiState(): void {
    setSceneFlag("dialogue", this.activeInteraction ? "open" : "none");
    setSceneFlag("overlay", this.overlayKind ?? (this.overlay ? "other" : "none"));
    // Every open/close path passes through here, which makes it the one place
    // the prompt chip reliably learns it should step aside.
    this.refreshPrompt();
  }

  private drawDialogue(): void {
    const active = this.activeInteraction;
    if (!active) return;
    this.publishUiState();
    this.overlay?.destroy();
    const choices = active.index >= active.view.lines.length - 1 ? active.view.choices : undefined;
    const panelY = choices?.length ? 278 : 348;
    const panelHeight = choices?.length ? 234 : 168;
    const scrim = this.add.rectangle(0, 0, 960, 540, COLORS.ink, 0.35).setOrigin(0);
    const panel = this.add.rectangle(28, panelY, 680, panelHeight, 0x101622, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0x8aa394);
    const plate = this.buildNamePlate(
      50,
      panelY + 14,
      active.view.speaker,
      active.view.speakerRole,
      active.view.portraitTag
    );
    const inset = portraitAppearance(active.view.portraitTag) ? 114 : 50;
    const line = this.add.text(inset, panelY + 56, "", {
      ...TEXT.body,
      wordWrap: { width: 672 - inset },
      lineSpacing: 5
    });
    this.startReveal(line, active.view.lines[active.index] ?? "");
    const children: Phaser.GameObjects.GameObject[] = [scrim, panel, ...plate, line];
    if (choices?.length) {
      const selectedChoice = choices[active.choiceIndex];
      if (selectedChoice) {
        announceGameStatus(
          `Decision. ${selectedChoice.label}. ${selectedChoice.description} Use navigation keys to choose and confirm.`
        );
      }
      choices.forEach((choice, index) => {
        const selected = index === active.choiceIndex;
        children.push(this.add.text(
          50,
          panelY + 104 + index * 32,
          `${selected ? "◆" : " "} ${choice.label} — ${choice.description}`,
          {
            ...TEXT.small,
            color: selected ? COLORS.gold : COLORS.cream,
            backgroundColor: selected ? "#293847" : undefined,
            padding: { x: 5, y: 3 },
            wordWrap: { width: 620 }
          }
        ));
      });
      const arming = active.confirmingChoiceId
        && active.confirmingChoiceId === choices[active.choiceIndex]?.id;
      if (active.view.pointOfNoReturn) {
        children.push(this.add.text(
          50,
          panelY + panelHeight - 52,
          arming
            ? `⚠ ${active.view.pointOfNoReturn}  Press Enter again to commit, Esc to step back.`
            : `⚠ ${active.view.pointOfNoReturn}`,
          {
            ...TEXT.small,
            color: arming ? COLORS.gold : COLORS.muted,
            wordWrap: { width: 620 }
          }
        ));
      }
      children.push(this.add.text(
        684,
        panelY + panelHeight - 27,
        arming ? "Enter Confirm — final" : "↑↓ Choose  Enter Confirm",
        TEXT.small
      ).setOrigin(1, 0));
    } else {
      announceGameStatus(`${active.view.speaker}. ${active.view.lines[active.index] ?? ""}`);
      children.push(this.add.text(647, panelY + panelHeight - 30, "Enter ▾", TEXT.small));
    }
    this.overlay = this.add.container(0, 0, children).setDepth(40);
  }

  private async advanceDialogue(): Promise<void> {
    if (this.completeReveal()) return;
    const active = this.activeInteraction;
    if (!active) return;
    if (active.index < active.view.lines.length - 1) {
      active.index += 1;
      this.drawDialogue();
      return;
    }
    const choice = active.view.choices?.[active.choiceIndex];
    if (choice) {
      // An irreversible choice takes two deliberate confirmations. The first
      // press arms it and redraws with the warning; only the second commits.
      if (active.view.pointOfNoReturn && !active.confirmingChoiceId) {
        active.confirmingChoiceId = choice.id;
        this.drawDialogue();
        return;
      }
      const view = await this.bridge.resolveInteractionChoice(choice.id);
      this.activeInteraction = { view, index: 0, choiceIndex: 0 };
      this.drawDialogue();
      return;
    }
    const recruited = active.view.recruitedMember;
    const opensVendorId = active.view.opensVendorId;
    const startedQuestTitle = active.view.startedQuestTitle;
    this.activeInteraction = undefined;
    this.overlay?.destroy();
    this.overlay = undefined;
    if (opensVendorId) {
      this.shopIndex = 0;
      this.shopMode = "buy";
      this.overlayKind = "shop";
      this.drawInteractiveOverlay();
      this.publishUiState();
      return;
    }
    this.locked = false;
    this.publishUiState();
    if (recruited) this.showToast(`${recruited.name} joined the party.`);
    else if (startedQuestTitle) this.showToast(`New quest — ${startedQuestTitle}`);
    this.refreshObjectiveActors();
    if (this.snapshot.campaign?.complete) this.showCampaignEnding();
    this.refreshPrompt();
  }

  private showCampaignEnding(): void {
    if (this.endingShown || !this.snapshot.campaign?.complete) return;
    this.endingShown = true;
    // Take ownership of the overlay slot the way every other overlay does. The
    // ending fires 250 ms after create(), by which point the player may already
    // have opened a panel; overwriting the field without destroying the
    // container orphaned an undismissable panel over the map.
    this.overlay?.destroy();
    this.overlay = undefined;
    this.activeInteraction = undefined;
    this.overlayKind = "ending";
    this.locked = true;
    const ending = this.snapshot.campaign.ending ?? {
      title: "THE CHRONICLE CONTINUES",
      body: "The last covenant remains unsettled, but the roads remember every step that led here.",
      epilogue: ""
    };
    const veil = this.add.rectangle(0, 0, 960, 540, 0x0b1119, 0.94).setOrigin(0);
    const title = this.add.text(480, 100, ending.title, {
      ...TEXT.title,
      color: COLORS.gold
    }).setOrigin(0.5);
    const body = this.add.text(
      480,
      182,
      ending.body,
      {
        ...TEXT.body,
        fontSize: fontPx(17),
        align: "center",
        wordWrap: { width: 650 },
        lineSpacing: 9,
        color: COLORS.cream
      }
    ).setOrigin(0.5, 0);
    const children = [veil, title, body];
    if (ending.epilogue) {
      children.push(this.add.text(480, 306, `WHAT THE CHOICE COST\n${ending.epilogue}`, {
        ...TEXT.body,
        fontSize: fontPx(14),
        align: "center",
        wordWrap: { width: 620 },
        lineSpacing: 7,
        color: COLORS.muted
      }).setOrigin(0.5, 0));
    }
    children.push(this.add.text(
      480,
      440,
      `${this.snapshot.playerName}'s chronicle remains open. The road can still be explored, and unfinished threads still wait.`,
      {
        ...TEXT.body,
        fontSize: fontPx(13),
        align: "center",
        wordWrap: { width: 650 },
        lineSpacing: 7,
        color: COLORS.cream
      }
    ).setOrigin(0.5, 0));
    children.push(this.add.text(480, 500, "Enter  Credits     Esc / B  Continue exploring", {
      ...TEXT.small,
      color: COLORS.muted
    }).setOrigin(0.5));
    this.overlay = this.add.container(0, 0, children).setDepth(100);
  }

  /**
   * A finished chronicle earns a credits roll. The game previously ended on a
   * single overlay with no acknowledgement of what it was made from.
   */
  private drawCredits(): void {
    stopMusic(this);
    this.overlay?.destroy();
    const veil = this.add.rectangle(0, 0, 960, 540, 0x0b1119, 0.96).setOrigin(0);
    const title = this.add.text(480, 84, "YGGDRASIL CHRONICLES", { ...TEXT.title, color: COLORS.gold }).setOrigin(0.5);
    const body = this.add.text(480, 150, [
      "The Severed Concord",
      "",
      "An original browser JRPG.",
      "",
      "ENGINE  ·  a deterministic pure-function core, Phaser 3 presentation",
      "MUSIC  ·  cynicmusic (pixelsphere.org), pauliuw, RandomMind — all CC0",
      "SOUND  ·  Kenney RPG Audio (CC0), unmodified",
      "SPRITES  ·  Puny Characters & Puny World by Shade, EverRogue tiles by Efilheim (CC0)",
      "",
      "Every road, name and covenant in this chronicle was authored for it.",
      "The rootways remember the choices you made — and the ones you closed.",
      "",
      "Thank you for walking the roads."
    ].join("\n"), {
      ...TEXT.body,
      fontSize: fontPx(14),
      align: "center",
      lineSpacing: 8,
      color: COLORS.cream
    }).setOrigin(0.5, 0);
    const hint = this.add.text(480, 500, "Esc / B  Return to the road", { ...TEXT.small, color: COLORS.muted }).setOrigin(0.5);
    this.overlay = this.add.container(0, 0, [veil, title, body, hint]).setDepth(100);
    this.overlayKind = "ending";
  }

  private refreshObjectiveActors(): void {
    const location = locations.find(({ id }) => id === this.snapshot.locationId);
    if (!location) return;
    this.renderLocation(false);
  }

  private toggleOverlay(kind: OverlayKind): void {
    this.time.delayedCall(0, () => this.publishUiState());
    if (this.activeInteraction) return;
    if (this.overlay) {
      this.closeOverlay();
      return;
    }
    // A transition owns the screen (travel fade, encounter launch); opening a
    // panel over it would desync `overlayKind` from what is drawn. A plain
    // `locked` without a transition still admits the system menu, which is the
    // player's recovery route.
    if (this.transitioning) return;
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
    const scrim = this.add.rectangle(0, 0, 960, 540, COLORS.ink, 0.45).setOrigin(0);
    const panel = this.add.rectangle(60, 42, 640, 456, COLORS.panel, 1).setOrigin(0).setStrokeStyle(2, 0x6f8f82);
    const title = this.add.text(88, 70, kind.toUpperCase(), { ...TEXT.heading, color: COLORS.gold });
    const rule = this.add.rectangle(88, 105, 584, 1, COLORS.panelLight).setOrigin(0);
    const content = this.overlayContent(kind);
    const body = this.add.text(88, 126, content, {
      ...TEXT.body,
      wordWrap: { width: 570 },
      lineSpacing: 8
    });
    // The hint row starts at y 462; anything longer than the window clips
    // rather than spilling over the panel edge onto the map.
    const bodyClip = this.add.graphics().fillStyle(0xffffff).fillRect(88, 126, 584, 330);
    bodyClip.setVisible(false);
    body.setMask(bodyClip.createGeometryMask());
    const hint = this.add.text(
      88,
      462,
      kind === "system"
        ? this.systemPicker
          ? "↑↓  Select     Enter / A  Confirm     Esc / B  Back"
          : "Arrows / D-pad  Select     Enter / A  Confirm     Esc / B  Close"
        : kind === "codex"
          ? "↑↓  Turn page     Esc / B  Close"
          : kind === "remedies"
            ? "↑↓  Select     Enter / A  Craft     Esc / B  Close"
          : kind === "map"
            ? "↑↓  Select     Enter / A  Travel     Esc / B  Close"
            : kind === "journal"
              ? "↑↓  Select     Enter / A  Follow thread     Esc / B  Close"
              : "Esc / B  Close",
      TEXT.small
    );
    this.overlay = this.add.container(0, 0, [scrim, panel, title, rule, body, bodyClip, hint]).setDepth(50);
  }

  private moveJournal(delta: number): void {
    playSound(this, "sfx.cursor");
    const count = this.snapshot.quests.length;
    if (count === 0) return;
    this.journalIndex = Phaser.Math.Wrap(this.journalIndex + delta, 0, count);
    this.redrawStaticOverlay("journal");
  }

  /** Follows the selected thread, so the HUD and compass answer to the player. */
  private async confirmJournalTrack(): Promise<void> {
    const quest = this.snapshot.quests[this.journalIndex];
    if (!quest) return;
    const result = await this.bridge.trackQuest(quest.id);
    this.showToast(result.message);
    if (result.success) {
      this.journalIndex = 0;
      this.redrawStaticOverlay("journal");
    }
  }

  private moveMap(delta: number): void {
    playSound(this, "sfx.cursor");
    const count = this.snapshot.discoveredLocations?.length ?? 0;
    if (count === 0) return;
    this.mapIndex = Phaser.Math.Wrap(this.mapIndex + delta, 0, count);
    this.redrawStaticOverlay("map");
  }

  /**
   * Travels to the selected discovered location. Fast travel exists because
   * `discoveredLocationIds` was tracked on every save and read by nothing:
   * the player paid the walk both ways for every errand across three regions.
   */
  private async confirmMapTravel(): Promise<void> {
    const target = this.snapshot.discoveredLocations?.[this.mapIndex];
    if (!target || target.current) return;
    this.closeOverlay();
    this.locked = true;
    this.transitioning = true;
    this.entryDirection = undefined;
    this.cameras.main.fadeOut(motionDuration(180), 10, 18, 24);
    try {
      const result = await this.bridge.fastTravel(target.id);
      if (!result.success) this.showToast(result.message);
      this.time.delayedCall(motionDuration(200), () => {
        this.cameras.main.fadeIn(motionDuration(180), 10, 18, 24);
        playSound(this, "sfx.door");
        this.locked = false;
      });
    } catch (error) {
      console.error("Fast travel failed", error);
      this.cameras.main.fadeIn(motionDuration(180), 10, 18, 24);
      this.locked = false;
    } finally {
      this.transitioning = false;
    }
  }

  /** Redraws a non-interactive overlay in place (codex pages, map cursor). */
  private redrawStaticOverlay(kind: OverlayKind): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.overlayKind = undefined;
    this.locked = false;
    this.toggleOverlay(kind);
  }

  /** Pages the codex a section at a time; wrapping keeps it reachable in both directions. */
  private moveRemedy(delta: number): void {
    playSound(this, "sfx.cursor");
    const count = this.snapshot.remedies?.recipes.length ?? 0;
    if (count === 0) return;
    this.remedyIndex = Phaser.Math.Wrap(this.remedyIndex + delta, 0, count);
    this.redrawStaticOverlay("remedies");
  }

  private async confirmRemedy(): Promise<void> {
    const recipe = this.snapshot.remedies?.recipes[this.remedyIndex];
    if (!recipe) return;
    const result = await this.bridge.craftRemedy(recipe.id);
    playSound(this, result.success ? "sfx.coin" : "sfx.miss");
    this.showToast(result.message);
    this.redrawStaticOverlay("remedies");
  }

  private moveCodex(delta: number): void {
    playSound(this, "sfx.cursor");
    this.codexIndex = Phaser.Math.Wrap(this.codexIndex + delta, 0, codexSections.length + 1);
    this.redrawStaticOverlay("codex");
  }

  private overlayContent(kind: OverlayKind): string {
    if (kind === "remedies") {
      const remedies = this.snapshot.remedies;
      if (!remedies?.unlocked) return "The party has not learned trail remedies yet.";
      // Windowed like the journal: each entry takes three lines, and the
      // ledger may grow past what the panel holds.
      const view = windowAround(remedies.recipes, this.remedyIndex, 2);
      const rows = view.items.map((recipe, index) => {
        const parts = recipe.inputs.map((input) => `${input.name} ${Math.min(input.have, 99)}/${input.need}`).join("  ·  ");
        const ready = recipe.craftable ? "" : "   (short)";
        return `${index === view.cursor ? "›" : " "} ${recipe.name} — ${recipe.outputQuantity} × ${recipe.outputName}${ready}\n   ${recipe.description}\n   Needs: ${parts}`;
      });
      return [
        "The delvers' ledger. Craft anywhere; the pack pays.",
        view.hasBefore ? "  ▲ more above" : "",
        rows.join("\n\n"),
        view.hasAfter ? "  ▼ more below" : "",
        windowFooter(view)
      ].filter(Boolean).join("\n\n");
    }
    if (kind === "codex") {
      const pageCount = codexSections.length + 1;
      // The final page is the bestiary, built from the per-species defeat
      // counts the save has always carried and never shown.
      if (this.codexIndex >= codexSections.length) {
        const bestiary = this.snapshot.bestiary ?? [];
        const rows = bestiary.length
          ? bestiary.map((entry) => {
            const known = [
              entry.weaknesses.length ? `weak: ${entry.weaknesses.join(", ")}` : "",
              entry.resistances.length ? `resists: ${entry.resistances.join(", ")}` : ""
            ].filter(Boolean).join("  ·  ");
            return `◆ ${entry.name}  ×${entry.defeated}${known ? `\n   ${known}` : "\n   Nothing learned of its nature yet."}`;
          }).join("\n\n")
          : "No foes have been felled yet. The bestiary fills as the road does.";
        return [`Bestiary   (${pageCount} of ${pageCount})`, "", rows].join("\n");
      }
      const section = codexSections[this.codexIndex] ?? codexSections[0];
      if (!section) return "The codex is empty.";
      const entries = section.entries
        .map(({ title, body }) => `◆ ${title}\n   ${body}`)
        .join("\n\n");
      return [
        `${section.title}   (${this.codexIndex + 1} of ${pageCount})`,
        "",
        entries
      ].join("\n");
    }
    if (kind === "map") {
      const discovered = this.snapshot.discoveredLocations ?? [];
      if (discovered.length === 0) return "No roads are known yet.";
      const view = windowAround(discovered, this.mapIndex, 4);
      const rows = view.items.map((entry, index) => {
        const marker = index === view.cursor ? "›" : " ";
        const here = entry.current ? "  — the party is here" : "";
        return `${marker} ${entry.name}  [${entry.kind.toUpperCase()}]\n   ${entry.regionName}${here}`;
      });
      return [
        "Known roads. Travel skips the walk but not the hours.",
        "",
        view.hasBefore ? "  ▲ more above" : "",
        rows.join("\n\n"),
        view.hasAfter ? "  ▼ more below" : "",
        windowFooter(view)
      ].filter(Boolean).join("\n");
    }
    if (kind === "journal") {
      // The full catalog, windowed and navigable. The journal previously
      // showed two threads and a count; thirty-odd authored quests and every
      // summary line were invisible.
      const entries = this.snapshot.quests;
      if (entries.length === 0) return "The journal is empty.";
      const view = windowAround(entries, this.journalIndex, 3);
      const marker = (state: string, first: boolean): string => {
        if (state === "active") return first ? "▸" : "◆";
        if (state === "available") return "◇";
        if (state === "completed") return "✓";
        if (state === "failed") return "✕";
        return "·";
      };
      const rows = view.items.map((quest, index) => {
        const cursor = index === view.cursor ? "›" : " ";
        const firstActive = entries[0]?.id === quest.id && quest.state === "active";
        const detail = quest.state === "active"
          ? `${quest.summary}\n   Next: ${quest.objective}`
          : quest.state === "failed"
            ? `${quest.summary}\n   Lost — but another way forward has opened.`
            : quest.summary;
        return `${cursor} ${marker(quest.state, firstActive)} ${quest.title}  [${quest.state.toUpperCase()}]\n   ${detail}`;
      });
      const completed = entries.filter(({ state }) => state === "completed").length;
      return [
        `RESOLVED ${completed}/${entries.length}   ▸ marks the followed thread`,
        "",
        view.hasBefore ? "  ▲ more above" : "",
        rows.join("\n\n"),
        view.hasAfter ? "  ▼ more below" : "",
        windowFooter(view)
      ].filter(Boolean).join("\n");
    }
    if (kind === "inventory") {
      return this.snapshot.inventory.length
        ? this.snapshot.inventory.map((item) => `${item.name} ×${item.quantity}\n   ${item.description}`).join("\n\n")
        : "The travel pack is empty.";
    }
    if (this.systemPicker) return this.pickerBody(this.systemPicker);
    const commands = [
      ...(["manual-1", "manual-2", "manual-3"] as const).map(
        (slot, index) => `Save to Manual Slot ${index + 1}${this.slotDetail(slot)}`
      ),
      "Export a Save…",
      "Import into a Slot…",
      "Delete a Save…",
      `Restore a Backup…${this.backupChoices.length ? `   (${this.backupChoices.length})` : ""}`,
      this.snapshot.remedies?.unlocked
        ? "Trail Remedies…"
        : "Trail Remedies  — a craft the road east still holds",
      `High Contrast: ${gameSettingsStore.get().highContrast ? "ON" : "OFF"}`,
      `Text Size: ${gameSettingsStore.get().textSize.toUpperCase()}`,
      `Reduced Motion: ${gameSettingsStore.get().reducedMotion ? "ON" : "OFF"}`,
      `Sound: ${gameSettingsStore.get().soundEnabled ? "ON" : "OFF"}`,
      `Sound Volume: ${Math.round(gameSettingsStore.get().soundVolume * 100)}%`,
      `Music: ${gameSettingsStore.get().musicEnabled ? "ON" : "OFF"}`,
      `Music Volume: ${Math.round(gameSettingsStore.get().musicVolume * 100)}%`,
      "Rest — lodging or camp",
      // Reachable here as well as by key, so a gamepad player can read the
      // codex without a keyboard.
      "Help & Codex",
      "Return to Title"
    ];
    // Windowed so fifteen commands fit the panel at any text size; the
    // chronicle hint paragraph stepped aside — the HUD already carries it.
    const view = windowAround(commands.map((label, index) => ({ label, index })), this.systemIndex, 11);
    return [
      view.hasBefore ? "  ▲ more above" : "",
      ...view.items.map(({ label, index }) => `${index === this.systemIndex ? "›" : " "} ${label}`),
      view.hasAfter ? "  ▼ more below" : ""
    ].filter(Boolean).join("\n");
  }

  private drawInteractiveOverlay(): void {
    if (this.overlayKind !== "inventory" && this.overlayKind !== "party" && this.overlayKind !== "shop") return;
    this.overlay?.destroy();
    const scrim = this.add.rectangle(0, 0, 960, 540, COLORS.ink, 0.45).setOrigin(0);
    const panel = this.add.rectangle(60, 42, 640, 456, COLORS.panel, 1).setOrigin(0).setStrokeStyle(2, 0x6f8f82);
    const title = this.add.text(
      88,
      70,
      this.overlayKind === "inventory" ? "INVENTORY" : this.overlayKind === "party" ? "PARTY" : (this.snapshot.shop?.shopName.toUpperCase() ?? "SHOP"),
      { ...TEXT.heading, color: COLORS.gold }
    );
    const rule = this.add.rectangle(88, 105, 584, 1, COLORS.panelLight).setOrigin(0);
    const body = this.add.text(88, 126, this.interactiveOverlayContent(), {
      ...TEXT.body,
      wordWrap: { width: 570 },
      lineSpacing: 6
    });
    // Same clip as the static overlays: long lists page, they do not spill.
    const bodyClip = this.add.graphics().fillStyle(0xffffff).fillRect(88, 126, 584, 330);
    bodyClip.setVisible(false);
    body.setMask(bodyClip.createGeometryMask());
    const hint = this.add.text(88, 462, this.interactiveOverlayHint(), TEXT.small);
    this.overlay = this.add.container(0, 0, [scrim, panel, title, rule, body, bodyClip, hint]).setDepth(50);
  }

  private interactiveOverlayContent(): string {
    if (this.overlayKind === "inventory") return this.inventoryOverlayContent();
    if (this.overlayKind === "shop") return this.shopOverlayContent();
    return this.partyOverlayContent();
  }

  private interactiveOverlayHint(): string {
    if (this.overlayKind === "inventory") {
      return this.interactiveMode === "target"
        ? "Arrows / D-pad  Choose target     Enter / A  Confirm     Esc / B  Back"
        : "Arrows / D-pad  Select     Enter / A  Use or equip     Esc / B  Close";
    }
    if (this.overlayKind === "shop") {
      return "Up / Down  Select     Left / Right  Buy or Sell     Enter / A  Confirm     Esc / B  Close";
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
    // Windowed: the pack holds up to ninety-nine distinct stacks, and without
    // this the cursor walks off the bottom of the panel.
    const view = windowAround(inventory, this.inventoryIndex, INVENTORY_VISIBLE_ROWS);
    const rows = view.items.map((item, index) => {
      const kind = this.itemKind(item).toUpperCase();
      const equipped = item.equippedBy?.length ? `  EQUIPPED: ${item.equippedBy.join(", ")}` : "";
      return `${index === view.cursor ? "›" : " "} ${item.name} ×${item.quantity}  [${kind}]${equipped}\n   ${item.description}`;
    });
    return [
      view.hasBefore ? "  ▲ more above" : "",
      rows.join("\n\n"),
      view.hasAfter ? "  ▼ more below" : "",
      windowFooter(view)
    ].filter(Boolean).join("\n");
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
    const stats = member.stats;
    const statLine = stats
      ? `STR ${stats.strength}  DEX ${stats.dexterity}  AGI ${stats.agility}  VIT ${stats.vitality}  INT ${stats.intellect}  WIS ${stats.wisdom}  CHA ${stats.charisma}`
      : "";
    // Progress toward the next level, which the game showed nowhere at all.
    const experienceLine = `EXP ${member.experienceIntoLevel}/${member.experienceForNextLevel} to level ${member.level + 1}`;
    return `${this.snapshot.party.map((candidate, index) => `${index === this.partyIndex ? "›" : " "} ${candidate.name}  Lv ${candidate.level}  ${candidate.job}`).join("\n")}\n\n${member.name.toUpperCase()}\nHP ${member.hp}/${member.maxHp}    MP ${member.mp}/${member.maxMp}\n${experienceLine}\n${statLine}${member.trait ? `\n${member.trait}` : ""}\n\nEQUIPPED\nWeapon: ${equipment.weapon?.name ?? "Empty"}\nArmor: ${equipment.armor?.name ?? "Empty"}\nAccessory: ${equipment.accessory?.name ?? "Empty"}\n\nRight to review jobs · Left to manage equipment`;
  }

  private shopOverlayContent(): string {
    const shop = this.snapshot.shop;
    if (!shop) return "This shop has closed.";
    const header = `MARKS: ${this.snapshot.currency}    [${this.shopMode === "buy" ? "◆ BUY" : "  BUY"} / ${this.shopMode === "sell" ? "◆ SELL" : "  SELL"}]`;
    if (this.shopMode === "sell") {
      const owned = shop.catalog.filter((entry) => entry.ownedQuantity > 0);
      if (!owned.length) return `${header}\n\nThe party carries nothing this shop will buy back.`;
      const view = windowAround(owned, this.shopIndex, SHOP_VISIBLE_ROWS);
      const rows = view.items.map((entry, index) =>
        `${index === view.cursor ? "›" : " "} ${entry.name}  —  sell ${entry.sellPrice ?? 0} marks  (owned ${entry.ownedQuantity})\n   ${entry.description}`);
      return this.windowedBody(header, rows, view);
    }
    if (!shop.catalog.length) return `${header}\n\nThis shop has nothing to sell right now.`;
    const view = windowAround(shop.catalog, this.shopIndex, SHOP_VISIBLE_ROWS);
    const rows = view.items.map((entry, index) => {
      // Show what the gear would do for the lead character: a price and a
      // description alone made buying equipment a guess.
      const comparison = entry.unusableReason
        ? `\n   ${entry.unusableReason}`
        : entry.statDelta?.length
          ? `\n   ${entry.statDelta.map(({ stat, delta }) => `${delta > 0 ? "+" : ""}${delta} ${stat}`).join("  ")}`
          : "";
      return `${index === view.cursor ? "›" : " "} ${entry.name}  —  ${entry.buyPrice} marks  [${entry.kind.toUpperCase()}]\n   ${entry.description}${comparison}`;
    });
    return this.windowedBody(header, rows, view);
  }

  /** Shared framing so both windowed overlays read identically. */
  private windowedBody(header: string, rows: readonly string[], view: OverlayWindow<unknown>): string {
    return [
      header,
      "",
      view.hasBefore ? "  ▲ more above" : "",
      rows.join("\n\n"),
      view.hasAfter ? "  ▼ more below" : "",
      windowFooter(view)
    ].filter(Boolean).join("\n");
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
    playSound(this, "sfx.cursor");
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

  private shopCatalog(): { itemId: string; name: string }[] {
    const shop = this.snapshot.shop;
    if (!shop) return [];
    return this.shopMode === "sell"
      ? shop.catalog.filter((entry) => entry.ownedQuantity > 0)
      : shop.catalog;
  }

  private moveShop(direction: ExitDirection): void {
    playSound(this, "sfx.cursor");
    if (direction === "left" || direction === "right") {
      this.shopMode = this.shopMode === "buy" ? "sell" : "buy";
      this.shopIndex = 0;
      this.drawInteractiveOverlay();
      return;
    }
    const count = this.shopCatalog().length;
    if (!count) return;
    const delta = direction === "up" ? -1 : 1;
    this.shopIndex = Phaser.Math.Wrap(this.shopIndex + delta, 0, count);
    this.drawInteractiveOverlay();
  }

  private async confirmShop(): Promise<void> {
    const entry = this.shopCatalog()[this.shopIndex];
    if (!entry) return;
    const result = this.shopMode === "buy"
      ? await this.bridge.buyItem(entry.itemId)
      : await this.bridge.sellItem(entry.itemId);
    this.showToast(result.message);
    if (result.success) {
      this.shopIndex = Math.min(this.shopIndex, Math.max(0, this.shopCatalog().length - 1));
    }
    this.drawInteractiveOverlay();
  }

  private escape(): void {
    // Cancel advances a scene rather than dismissing it: a scripted beat is
    // authored content, not an overlay the player opened by accident.
    if (this.activeScene) {
      void this.advanceScene();
      return;
    }
    if (this.activeInteraction) {
      // Step back from an armed irreversible choice rather than closing the
      // whole conversation, so backing out never costs the player the dialogue.
      if (this.activeInteraction.confirmingChoiceId) {
        this.activeInteraction.confirmingChoiceId = undefined;
        this.drawDialogue();
        return;
      }
      this.activeInteraction = undefined;
      this.closeOverlay();
      return;
    }
    if (this.systemPicker) {
      this.systemPicker = undefined;
      this.drawSystemOverlay();
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
    this.systemPicker = undefined;
    this.armedSaveSlot = undefined;
    if (this.restyleOnClose) {
      this.restyleOnClose = false;
      this.overlay?.destroy();
      this.overlay = undefined;
      this.overlayKind = undefined;
      this.locked = false;
      this.renderLocation(false);
      return;
    }
    if (this.overlayKind === "shop") void this.bridge.leaveShop();
    this.overlay?.destroy();
    this.overlay = undefined;
    this.overlayKind = undefined;
    this.activeInteraction = undefined;
    this.locked = false;
    this.publishUiState();
    this.refreshPrompt();
  }

  /**
   * Writes to the dedicated `quick` slot, never a manual one. The old binding
   * overwrote Manual Slot 1, silently destroying whatever the player had
   * deliberately parked there.
   */
  private async quickSave(): Promise<void> {
    if (this.activeInteraction || this.locked) return;
    if (!this.snapshot.storageAvailable) {
      this.showToast("Saving is unavailable in this browser session.");
      return;
    }
    await this.bridge.save("quick");
    const failed = this.bridge.getSnapshot().autosave === "error";
    this.showToast(failed ? "Quick save failed." : "Quick saved.");
  }

  private async quickLoad(): Promise<void> {
    if (this.activeInteraction || this.locked) return;
    if (!this.snapshot.saveSlots?.includes("quick")) {
      this.showToast("No quick save to load.");
      return;
    }
    const result = await this.bridge.load("quick");
    this.showToast(result.message);
  }

  private moveSystem(delta: number): void {
    playSound(this, "sfx.cursor");
    const picker = this.systemPicker;
    if (picker) {
      const count = this.pickerLength(picker.action);
      if (count === 0) return;
      picker.index = Phaser.Math.Wrap(picker.index + delta, 0, count);
      // Moving the cursor disarms: a confirm only ever destroys the slot the
      // player was looking at when they armed it.
      picker.armed = undefined;
      this.drawSystemOverlay();
      return;
    }
    this.systemIndex = Phaser.Math.Wrap(this.systemIndex + delta, 0, SYSTEM_MENU_COMMAND_COUNT);
    this.armedSaveSlot = undefined;
    this.drawSystemOverlay();
  }

  /** What the player would destroy or load, appended to a slot row. */
  private slotDetail(slot: GameSaveSlot): string {
    const summary = this.snapshot.saveSummaries?.find((entry) => entry.slot === slot);
    if (!summary) return "   — empty";
    const saved = new Date(summary.updatedAt);
    const stamp = Number.isNaN(saved.getTime())
      ? ""
      : `  ·  ${saved.toLocaleDateString()} ${saved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (summary.damaged) return `   — damaged, cannot be read${stamp}`;
    return `   — Lv ${summary.partyLevel}  ${summary.locationName}  ·  ${formatPlayTime(summary.playTimeMinutes)} played${stamp}`;
  }

  /** Slots a given action can act on: occupied ones, except import, which needs a destination. */
  private pickerSlots(action: SlotPickerAction): readonly GameSaveSlot[] {
    if (action === "import") return SAVE_SLOT_ORDER;
    const occupied = this.snapshot.saveSlots ?? [];
    return SAVE_SLOT_ORDER.filter((slot) => occupied.includes(slot));
  }

  private pickerLength(action: SlotPickerAction | "restore"): number {
    return action === "restore" ? this.backupChoices.length : this.pickerSlots(action).length;
  }

  private pickerBody(picker: NonNullable<WorldScene["systemPicker"]>): string {
    const heading = {
      save: "Choose a slot to save into.",
      export: "Choose a save to export as JSON.",
      import: "Choose the slot to import into.",
      restore: "Choose an archived record to put back."
    }[picker.action === "delete" ? "save" : picker.action];
    const title = picker.action === "delete" ? "Choose a save to delete." : heading;
    if (this.pickerLength(picker.action) === 0) {
      return picker.action === "restore"
        ? `No backups yet. One is kept whenever a manual slot is overwritten or a save is imported.\n\nEsc / B  Back`
        : `There are no saved chronicles yet.\n\nEsc / B  Back`;
    }
    const rows = picker.action === "restore"
      ? this.backupChoices.map((backup, index) => {
          const stamp = new Date(backup.backedUpAt);
          const when = Number.isNaN(stamp.getTime()) ? backup.backedUpAt : stamp.toLocaleString();
          const armed = picker.armed === backup.id ? "   ⚠ confirm again to replace the slot" : "";
          const detail = backup.damaged
            ? "damaged, cannot be read"
            : `Lv ${backup.partyLevel}  ${backup.locationName}`;
          return `${index === picker.index ? "›" : " "} ${backup.slotLabel}  —  ${detail}  ·  ${when}${armed}`;
        })
      : this.pickerSlots(picker.action).map((slot, index) => {
          const occupied = (this.snapshot.saveSlots ?? []).includes(slot);
          const armed = picker.armed === slot
            ? `   ⚠ confirm again to ${picker.action === "delete" ? "delete" : "overwrite"}`
            : "";
          return `${index === picker.index ? "›" : " "} ${SAVE_SLOT_LABELS[slot]}${occupied ? this.slotDetail(slot) : "   — empty"}${armed}`;
        });
    return `${title}\n\n${rows.join("\n")}`;
  }

  private openSlotPicker(action: SlotPickerAction | "restore"): void {
    this.systemPicker = { action, index: 0 };
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
    if (this.systemPicker) {
      await this.confirmSlotPicker(this.systemPicker);
      return;
    }
    if (this.systemIndex < 3) {
      const slot = (["manual-1", "manual-2", "manual-3"] as const)[this.systemIndex];
      if (!slot) return;
      // Overwriting a slot the player deliberately filled asks twice, the same
      // way the picker does. The first press arms and says what it will replace.
      if ((this.snapshot.saveSlots ?? []).includes(slot) && this.armedSaveSlot !== slot) {
        this.armedSaveSlot = slot;
        this.showToast(`${SAVE_SLOT_LABELS[slot]} already holds a chronicle. Confirm again to overwrite it.`);
        return;
      }
      this.armedSaveSlot = undefined;
      const saved = await this.bridge.save(slot);
      await this.refreshBackupChoices();
      this.showToast(saved
        ? `Chronicle saved to ${SAVE_SLOT_LABELS[slot]}.`
        : `${SAVE_SLOT_LABELS[slot]} could not be written. The chronicle is not saved.`);
      this.drawSystemOverlay();
      return;
    }
    if (this.systemIndex === 3) {
      this.openSlotPicker("export");
      return;
    }
    if (this.systemIndex === 4) {
      this.openSlotPicker("import");
      return;
    }
    if (this.systemIndex === 5) {
      this.openSlotPicker("delete");
      return;
    }
    if (this.systemIndex === 6) {
      await this.refreshBackupChoices();
      this.openSlotPicker("restore");
      return;
    }
    if (this.systemIndex === 7) {
      if (!this.snapshot.remedies?.unlocked) {
        this.showToast("Emberwake's delvers teach this, when the road reaches them.");
        return;
      }
      this.closeOverlay();
      this.remedyIndex = 0;
      this.toggleOverlay("remedies");
      return;
    }
    if (this.systemIndex >= 8 && this.systemIndex <= 14) {
      const settings = gameSettingsStore.get();
      if (this.systemIndex === 8) gameSettingsStore.update({ highContrast: !settings.highContrast });
      else if (this.systemIndex === 9) gameSettingsStore.update({ textSize: nextTextSize(settings.textSize) });
      else if (this.systemIndex === 10) gameSettingsStore.update({ reducedMotion: !settings.reducedMotion });
      else if (this.systemIndex === 11) gameSettingsStore.update({ soundEnabled: !settings.soundEnabled });
      else if (this.systemIndex === 12) gameSettingsStore.update({ soundVolume: settings.soundVolume >= 1 ? 0 : Math.min(1, settings.soundVolume + 0.1) });
      else if (this.systemIndex === 13) gameSettingsStore.update({ musicEnabled: !settings.musicEnabled });
      else gameSettingsStore.update({ musicVolume: settings.musicVolume >= 1 ? 0 : Math.min(1, settings.musicVolume + 0.1) });
      playSound(this, "sfx.confirm");
      // The palette and type scale changed under the whole scene, but the map
      // was drawn before that. Repaint it once the menu is out of the way.
      if (this.systemIndex === 8 || this.systemIndex === 9) this.restyleOnClose = true;
      this.drawSystemOverlay();
      return;
    }
    if (this.systemIndex === 15) {
      // Report what actually happened: resting can now be refused for want of
      // coin or camp supplies, and the two forms restore different things.
      const result = await this.bridge.rest();
      if (result.success) this.closeOverlay();
      this.showToast(result.message);
      return;
    }
    if (this.systemIndex === 16) {
      this.closeOverlay();
      this.codexIndex = 0;
      this.toggleOverlay("codex");
      return;
    }
    this.returnToTitle();
  }

  private async refreshBackupChoices(): Promise<void> {
    this.backupChoices = await this.bridge.listBackups();
  }

  private async confirmSlotPicker(picker: NonNullable<WorldScene["systemPicker"]>): Promise<void> {
    if (picker.action === "restore") {
      const backup = this.backupChoices[picker.index];
      if (!backup) return;
      if (picker.armed !== backup.id) {
        picker.armed = backup.id;
        this.drawSystemOverlay();
        return;
      }
      this.systemPicker = undefined;
      const result = await this.bridge.restoreBackup(backup.id);
      await this.refreshBackupChoices();
      this.showToast(result.message);
      this.drawSystemOverlay();
      return;
    }
    const slot = this.pickerSlots(picker.action)[picker.index];
    if (!slot) return;
    const occupied = (this.snapshot.saveSlots ?? []).includes(slot);
    if (DESTRUCTIVE_SLOT_ACTIONS.has(picker.action) && occupied && picker.armed !== slot) {
      picker.armed = slot;
      this.drawSystemOverlay();
      return;
    }
    if (picker.action === "export") {
      this.systemPicker = undefined;
      await this.exportSlot(slot);
      this.drawSystemOverlay();
      return;
    }
    if (picker.action === "import") {
      this.systemPicker = undefined;
      this.importIntoSlot(slot);
      return;
    }
    if (picker.action === "delete") {
      this.systemPicker = undefined;
      const result = await this.bridge.deleteSave(slot);
      await this.refreshBackupChoices();
      this.showToast(result.message);
      this.drawSystemOverlay();
      return;
    }
    this.systemPicker = undefined;
    const saved = await this.bridge.save(slot);
    this.showToast(saved
      ? `Chronicle saved to ${SAVE_SLOT_LABELS[slot]}.`
      : `${SAVE_SLOT_LABELS[slot]} could not be written. The chronicle is not saved.`);
    this.drawSystemOverlay();
  }

  private async exportSlot(slot: GameSaveSlot): Promise<void> {
    this.systemBusy = true;
    try {
      const json = await this.bridge.exportSave(slot);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "yggdrasil-chronicles-save.json";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      this.showToast(`${SAVE_SLOT_LABELS[slot]} exported to yggdrasil-chronicles-save.json.`);
    } catch (error) {
      this.showToast(error instanceof Error ? `Export failed: ${error.message}` : "Export failed.");
    } finally {
      this.systemBusy = false;
    }
  }

  private importIntoSlot(slot: GameSaveSlot): void {
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
      void this.importSelectedSave(slot, input, cleanup);
    }, { once: true });
    window.addEventListener("focus", onWindowFocus, { once: true });
    try {
      input.click();
    } catch (error) {
      this.showToast(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
      cleanup();
    }
  }

  private async importSelectedSave(
    slot: GameSaveSlot,
    input: HTMLInputElement,
    cleanup: () => void
  ): Promise<void> {
    try {
      const file = input.files?.[0];
      if (!file) {
        this.showToast("Import cancelled.");
        return;
      }
      const result = await this.bridge.importSave(slot, await file.text());
      await this.refreshBackupChoices();
      this.showToast(result.message);
      this.drawSystemOverlay();
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
    if (!id) {
      // The dedicated key answers even when this map has no foe left;
      // a key that silently does nothing reads as broken.
      this.showToast("Nothing to engage here.");
      return;
    }
    // The encounter key engages the visible foe, not a battle from thin air:
    // it previously started the fight from anywhere on the map, which made
    // the whole visible-encounter design decorative.
    if (!this.isNearEncounter()) {
      this.showToast("No foe is close enough to engage.");
      return;
    }
    this.battleReturnGrid = { ...this.playerGrid };
    this.locked = true;
    this.transitioning = true;
    try {
      await this.bridge.startEncounter(id);
      // startEncounter declines rather than throwing when it cannot build a
      // battle. Without this check the scene would transition into an empty one.
      if (!this.bridge.getSnapshot().battle) {
        this.showToast("The party is in no condition to fight.");
        this.locked = false;
        return;
      }
      this.cameras.main.flash(motionDuration(220), 238, 221, 179);
      this.time.delayedCall(motionDuration(240), () => this.scene.start("battle"));
    } catch (error) {
      console.error("Encounter failed to start", error);
      this.locked = false;
      this.showToast("That encounter could not be started.");
    } finally {
      this.transitioning = false;
    }
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
