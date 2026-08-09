import Phaser from "phaser";
import { ancestries, jobs } from "../../content";
import {
  DEFAULT_KEYBOARD_BINDINGS,
  gameSettingsStore,
  nextTextSize,
  REBINDABLE_ACTIONS
} from "../../settings";
import type { CharacterCreationDraft, Difficulty, GameBridge, GameCommandResult } from "../bridge";
import { gamepadButtonAction, pollStickDirection, type StickRepeatState } from "../gamepadControls";
import { playMusic } from "../music";
import { windowAround } from "../overlayWindow";
import {
  keyboardActionForCode,
  keyboardActionLabel,
  keyboardBindingLabel,
  keyboardCodeLabel,
  rebindKeyboardAction
} from "../keyboardControls";
import { announceGameStatus, announceScene, COLORS, fadeSceneIn, fadeSceneOutThen, fontPx, getBridge, mixColour, motionDuration, playSound, TEXT } from "../runtime";

const NAME_CHOICES = ["Rowan", "Aster", "Marlowe", "Sage", "Kestrel", "Vale"] as const;
/** Slots the load menu offers, in display order. `quick` is listed so a quick save is recoverable from the title. */
const MANUAL_SLOTS = ["quick", "manual-1", "manual-2", "manual-3"] as const;
const SLOT_TITLES: Readonly<Record<(typeof MANUAL_SLOTS)[number], string>> = {
  quick: "QUICK SAVE",
  "manual-1": "SLOT 1",
  "manual-2": "SLOT 2",
  "manual-3": "SLOT 3"
};
const DIFFICULTY_CHOICES: readonly { readonly id: Difficulty; readonly label: string; readonly description: string }[] = [
  { id: "easy", label: "Easy", description: "Enemies hit softer and battles pay out slightly less." },
  { id: "normal", label: "Normal", description: "The authored balance: no combat adjustment." },
  { id: "hard", label: "Hard", description: "Enemies hit harder and battles pay out more." }
];
/** Rows in the character creation flow: name, ancestry, calling, difficulty, begin. */
const CREATION_ROW_COUNT = 5;

/** How many times the title tree forks. Six gives a canopy dense enough to read as mass. */
const BRANCH_DEPTH = 6;

/**
 * A small deterministic sequence, so the tree and its motes are the same shape
 * on every launch. `Math.random` here would redraw the title art on each visit
 * and make every title screenshot a false negative.
 */
/** Splits "LOAD CHRONICLE  —  0/4 SAVED" into its heading and its annotation. */
function splitMenuLabel(label: string): [string, string | undefined] {
  const parts = label.split("  —  ");
  return [parts[0] ?? label, parts.length > 1 ? parts.slice(1).join("  —  ") : undefined];
}

function seededSequence(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

type TitleMode = "title" | "creation" | "load" | "settings" | "bindings";

export class TitleScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private mode: TitleMode = "title";
  private titleIndex = 0;
  private loadIndex = 0;
  private creationRow = 0;
  private nameIndex = 0;
  private ancestryIndex = 0;
  private jobIndex = 0;
  private difficultyIndex = 1;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  /** Non-text menu furniture (selection bar, rules) cleared alongside the rows. */
  private menuDecor: Phaser.GameObjects.GameObject[] = [];
  /** Dims the artwork on the screens that put text over it. */
  private modeScrim?: Phaser.GameObjects.Rectangle;
  /** Rule and subtitle: decorative, and hidden on the screens that need the room. */
  private lockupExtras: Phaser.GameObjects.GameObject[] = [];
  /** Bottom of the wordmark block, so dense screens can start right under it. */
  private lockupBottom = 0;
  /** The row the selection bar was last drawn on, so it can slide to the next one. */
  private previousRowY?: number;
  private detailText?: Phaser.GameObjects.Text;
  private controlsText?: Phaser.GameObjects.Text;
  private creationTexts: Phaser.GameObjects.Text[] = [];
  private loading = false;
  private readonly stickState: StickRepeatState = { nextAt: 0 };
  /** Armed by the first NEW CHRONICLE press so overwriting an existing run takes two. */
  private confirmingNewGame = false;
  private settingsIndex = 0;
  private bindingIndex = 0;
  private capturingBinding = false;
  private driftingMotes: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super("title");
  }

  create(): void {
    this.bridge = getBridge(this);
    this.mode = "title";
    this.titleIndex = 0;
    this.loadIndex = 0;
    // Phaser reuses the scene instance, so the confirm latch outlives a run.
    // Leaving it set — as the BEGIN path deliberately does, since the scene is
    // on its way out — would refuse every confirm on the next visit here.
    this.loading = false;
    this.confirmingNewGame = false;
    this.previousRowY = undefined;
    this.driftingMotes = [];
    this.cameras.main.setBackgroundColor(COLORS.ink);
    // Boot hands straight over to the title, so without this the wordmark and
    // the tree simply appeared, mid-thought, on the first frame of the game.
    fadeSceneIn(this, 420);
    this.paintBackdrop();
    // The title screen shows the tree; every other screen this scene draws puts
    // text where the tree is — character creation's detail column sits directly
    // over the canopy — so those dim it first.
    this.modeScrim = this.add.rectangle(0, 0, 960, 540, COLORS.ink, 0.62).setOrigin(0).setAlpha(0);
    // Stacked from measured heights. "CHRONICLES" sat at a literal 126 while
    // the wordmark above it ran to 134, so the two overlapped and the lockup
    // read as cramped at every text size.
    const wordmark = this.add.text(64, 56, "YGGDRASIL", { ...TEXT.title, fontSize: fontPx(56), letterSpacing: 8 });
    const chronicles = this.add.text(68, wordmark.y + wordmark.height + 2, "C H R O N I C L E S", {
      ...TEXT.body,
      color: COLORS.gold,
      letterSpacing: 5
    });
    this.lockupBottom = chronicles.y + chronicles.height;
    const ruleY = chronicles.y + chronicles.height + 14;
    this.lockupExtras = [
      this.add.rectangle(68, ruleY, 268, 1, COLORS.panelLight).setOrigin(0).setAlpha(0.9),
      this.add.text(68, ruleY + 13, "The Severed Concord", {
        ...TEXT.heading,
        fontStyle: "italic",
        color: COLORS.muted
      })
    ];
    this.controlsText = this.add.text(68, 470, "", TEXT.small);
    this.refreshControlsText();
    this.drawTitleMenu();
    this.bindKeys();
    announceScene("title");
    playMusic(this, "music.title");
  }

  /**
   * The title backdrop: the world tree the game is named after.
   *
   * What stood here was three thick quads meeting at a point, a flat disc, and
   * fourteen full-height diagonals — a slingshot in front of a circle, with
   * lines that read as a rendering fault rather than as branches. The tree is
   * now grown recursively from a fixed seed: identical on every launch, so
   * screenshot comparisons stay meaningful, but with the uneven forking that
   * makes a tree look like one.
   *
   * High Contrast gets a flat field instead. The setting exists so text is
   * legible, and the most legible thing to put behind text is nothing.
   */
  private paintBackdrop(): void {
    const settings = gameSettingsStore.get();
    const graphics = this.add.graphics();

    if (settings.highContrast) {
      graphics.fillStyle(COLORS.ink, 1).fillRect(0, 0, 960, 540);
      return;
    }

    // Sky in bands rather than one fill, so the horizon carries some warmth and
    // the type at the top sits against the darkest part of the frame.
    // Bands tile exactly. A fractional height with a +1 fudge overlaps its
    // neighbour by a pixel, and sixty overlaps at differing alpha is visible as
    // horizontal striping across the whole frame.
    const bands = 60;
    const bandHeight = 540 / bands;
    for (let index = 0; index < bands; index += 1) {
      graphics.fillStyle(mixColour(0x0a1220, 0x17333b, index / (bands - 1)), 1);
      graphics.fillRect(0, index * bandHeight, 960, bandHeight);
    }

    // The glow behind the canopy: many faint discs, which reads as light. One
    // opaque disc reads as a circle someone forgot to finish.
    for (let index = 0; index < 24; index += 1) {
      const ratio = index / 23;
      graphics.fillStyle(0x2f6f68, 0.014 + ratio * 0.042);
      graphics.fillCircle(688, 214, 252 - ratio * 196);
    }

    this.paintTree(graphics);

    // Light falling through the canopy. Wide, nearly transparent, and stopping
    // short of the ground so they read as shafts rather than as scan lines.
    for (let index = 0; index < 4; index += 1) {
      const top = 470 + index * 118;
      graphics.fillStyle(0x9fe0c6, 0.022);
      graphics.fillPoints([
        new Phaser.Geom.Point(top, 0),
        new Phaser.Geom.Point(top + 54, 0),
        new Phaser.Geom.Point(top - 128, 540),
        new Phaser.Geom.Point(top - 208, 540)
      ], true);
    }

    // A scrim under the text column so every screen this scene draws — title,
    // settings, load, character creation — has a readable field to sit on
    // whatever the art behind it is doing.
    for (let index = 0; index < 96; index += 1) {
      graphics.fillStyle(COLORS.ink, 0.66 * (1 - index / 95) ** 1.6);
      graphics.fillRect(index * 10, 0, 10, 540);
    }
    // And a low vignette, so the footer legend is never floating on open sky.
    for (let index = 0; index < 45; index += 1) {
      graphics.fillStyle(0x060c16, 0.46 * (1 - index / 44) ** 2.2);
      graphics.fillRect(0, 540 - (index + 1) * 4, 960, 4);
    }

    if (!settings.reducedMotion) this.paintDrifting();
  }

  /** Roots, trunk and canopy, grown from one fixed seed. */
  private paintTree(graphics: Phaser.GameObjects.Graphics): void {
    const random = seededSequence(0x59_47_44_52);
    const baseY = 486;
    const forkY = 402;

    // A bank of earth in three layers, so the tree stands on something. One
    // flat polygon gave a hard black wedge with a corner in the middle of the
    // frame; layering it puts a horizon behind the near ground.
    for (const [offset, colour, alpha] of [
      [26, 0x102630, 1], [12, 0x0d1f28, 1], [0, 0x0a1820, 1]
    ] as const) {
      graphics.fillStyle(colour, alpha);
      graphics.fillPoints([
        new Phaser.Geom.Point(0, 540),
        new Phaser.Geom.Point(0, 528 + offset),
        new Phaser.Geom.Point(180, 516 + offset),
        new Phaser.Geom.Point(400, 502 + offset),
        new Phaser.Geom.Point(560, 492 + offset),
        new Phaser.Geom.Point(688, 488 + offset),
        new Phaser.Geom.Point(830, 494 + offset),
        new Phaser.Geom.Point(960, 508 + offset),
        new Phaser.Geom.Point(960, 540)
      ], true);
    }

    // Roots flaring out of that bank, drawn before the trunk so the trunk
    // covers where they meet.
    // Roots as tapered wedges. Stroked polylines gave square caps and a
    // constant width, so they read as six flat sticks pushed under the trunk
    // rather than as the trunk spreading into the ground.
    for (const [spread, drop, width] of [
      [-74, 26, 15], [-44, 17, 12], [-106, 34, 10], [56, 21, 14], [84, 29, 11], [112, 38, 9]
    ] as const) {
      graphics.fillStyle(mixColour(0x1b3833, 0x22463c, Math.abs(spread) / 112), 1);
      graphics.fillPoints([
        new Phaser.Geom.Point(688, baseY - 18),
        new Phaser.Geom.Point(688 + spread * 0.3, baseY + drop * 0.35 + width * 0.5),
        new Phaser.Geom.Point(688 + spread, baseY + drop),
        new Phaser.Geom.Point(688 + spread * 0.94, baseY + drop - width * 0.35),
        new Phaser.Geom.Point(688 + spread * 0.26, baseY + drop * 0.2 - width * 0.5)
      ], true);
    }

    // The trunk in thin horizontal slices. A tapered polygon has straight edges
    // and the highlight laid over it left a hard diagonal seam — the whole
    // thing read as cut paper. Slicing lets the width, the lean and the colour
    // all vary smoothly, and no two shapes meet along a visible line.
    for (let y = baseY + 8; y > forkY; y -= 2) {
      const ratio = (baseY + 8 - y) / (baseY + 8 - forkY);
      const halfWidth = 40 - 25 * ratio ** 0.7;
      const centre = 688 + Math.sin(ratio * 1.35) * 7;
      graphics.fillStyle(mixColour(0x1b3833, 0x336052, ratio), 1);
      graphics.fillRect(centre - halfWidth, y, halfWidth * 2, 2);
      // Light from the canopy side, feathered by riding the same taper.
      graphics.fillStyle(0x437a63, 0.5);
      graphics.fillRect(centre + halfWidth * 0.42, y, halfWidth * 0.5, 2);
    }

    // A faint mass behind the branches, so the canopy holds together instead of
    // reading as a scatter of separate discs.
    for (const [x, y, radius] of [[688, 250, 150], [600, 286, 104], [782, 282, 110], [688, 200, 118]] as const) {
      graphics.fillStyle(0x2c6350, 0.05);
      graphics.fillCircle(x, y, radius);
    }

    this.paintBranch(graphics, random, 688 + Math.sin(1.35) * 7, forkY + 4, -Math.PI / 2, 92, 21, 0);
  }

  /**
   * One branch, then the branches it forks into. Depth is bounded, so this
   * terminates; every length, angle and canopy radius comes from the seeded
   * sequence, so the shape never changes between runs.
   */
  private paintBranch(
    graphics: Phaser.GameObjects.Graphics,
    random: () => number,
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    depth: number
  ): void {
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    const ratio = depth / BRANCH_DEPTH;
    graphics.lineStyle(Math.max(1.6, width), mixColour(0x24463f, 0x4f8466, ratio), 0.95);
    graphics.beginPath();
    graphics.moveTo(x, y);
    graphics.lineTo(endX, endY);
    graphics.strokePath();

    if (depth >= BRANCH_DEPTH) {
      // Foliage as many small, faint, unevenly sized discs. Few large discs at
      // high alpha read as bubbles — which is what the first attempt looked
      // like; the mass has to come from overlap, not from any one circle.
      for (let index = 0; index < 6; index += 1) {
        graphics.fillStyle(mixColour(0x1f4a3c, 0x6aa870, random() ** 1.6), 0.13);
        graphics.fillCircle(
          endX + (random() - 0.5) * 26,
          endY + (random() - 0.5) * 22,
          4 + random() * 8
        );
      }
      return;
    }

    const spread = 0.40 + random() * 0.28;
    const lean = (random() - 0.5) * 0.18;
    this.paintBranch(graphics, random, endX, endY, angle - spread + lean, length * (0.74 + random() * 0.1), width * 0.66, depth + 1);
    this.paintBranch(graphics, random, endX, endY, angle + spread + lean, length * (0.72 + random() * 0.1), width * 0.64, depth + 1);
    // A third shoot now and then, so the silhouette is not a clean binary fan.
    if (depth === 1 || (depth === 2 && random() < 0.55)) {
      this.paintBranch(graphics, random, endX, endY, angle + lean * 2, length * 0.64, width * 0.48, depth + 1);
    }
  }

  /** Slow motes rising through the canopy. Skipped entirely under Reduced Motion. */
  private paintDrifting(): void {
    const random = seededSequence(0x4c_45_41_46);
    for (let index = 0; index < 16; index += 1) {
      const x = 470 + random() * 440;
      const y = 90 + random() * 380;
      const mote = this.add.circle(x, y, 1 + random() * 1.8, 0xd8e9b8, 0.5);
      this.driftingMotes.push(mote);
      this.tweens.add({
        targets: mote,
        y: y - 40 - random() * 50,
        alpha: 0.05,
        duration: 5200 + random() * 4200,
        delay: random() * 3600,
        repeat: -1,
        yoyo: true,
        ease: "Sine.easeInOut"
      });
    }
  }

  private syncDriftingMotes(): void {
    const shouldDrift = !gameSettingsStore.get().reducedMotion && !gameSettingsStore.get().highContrast;
    if (shouldDrift && this.driftingMotes.length === 0) {
      this.paintDrifting();
      return;
    }
    if (shouldDrift) return;
    this.tweens.killTweensOf(this.driftingMotes);
    this.driftingMotes.forEach((mote) => mote.destroy());
    this.driftingMotes = [];
  }

  override update(time: number): void {
    const direction = pollStickDirection(this.input.gamepad?.getPad(0), this.stickState, time);
    if (direction === "up") this.move(-1);
    else if (direction === "down") this.move(1);
    else if (direction === "left") this.adjust(-1);
    else if (direction === "right") this.adjust(1);
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
    if (this.capturingBinding) {
      event.preventDefault();
      // Escape backs out instead of becoming the binding. Capture accepted any
      // key at all, so the one key every player reaches for to cancel was the
      // one that committed — and a player who opened capture by accident had no
      // way out that did not rebind something.
      if (event.code === "Escape") {
        this.capturingBinding = false;
        playSound(this, "sfx.cursor");
        this.drawBindings();
        return;
      }
      const action = REBINDABLE_ACTIONS[this.bindingIndex];
      if (!action) return;
      const bindings = rebindKeyboardAction(gameSettingsStore.get().keyBindings, action, event.code);
      gameSettingsStore.update({ keyBindings: bindings });
      this.capturingBinding = false;
      playSound(this, "sfx.confirm");
      this.drawBindings();
      return;
    }
    const action = keyboardActionForCode(event.code, gameSettingsStore.get().keyBindings);
    if (!action) return;
    event.preventDefault();
    if (action === "up") this.move(-1);
    else if (action === "down") this.move(1);
    else if (action === "left") this.adjust(-1);
    else if (action === "right") this.adjust(1);
    else if (action === "confirm" || action === "interact") void this.confirm();
    else if (action === "cancel") this.back();
  }

  private refreshControlsText(): void {
    const bindings = gameSettingsStore.get().keyBindings;
    this.controlsText?.setText(
      `${keyboardCodeLabel(bindings.up[0] ?? "")}/${keyboardCodeLabel(bindings.down[0] ?? "")} / D-pad  Navigate     `
      + `${keyboardCodeLabel(bindings.confirm[0] ?? "")} / A  Confirm     `
      + `${keyboardCodeLabel(bindings.cancel[0] ?? "")} / B  Back`
    );
  }

  private onGamepadButton(_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button): void {
    const action = gamepadButtonAction(button.index);
    if (action === "up") this.move(-1);
    else if (action === "down") this.move(1);
    else if (action === "left") this.adjust(-1);
    else if (action === "right") this.adjust(1);
    else if (action === "confirm") void this.confirm();
    else if (action === "cancel") this.back();
  }

  /**
   * Raises or lowers the dimming scrim over the artwork.
   *
   * It was flipped with `setVisible`, so moving between the title and any other
   * screen dropped a 62% black sheet over the tree in a single frame — the
   * hardest cut on a screen that is otherwise all soft edges.
   */
  private setScrim(dim: boolean): void {
    const scrim = this.modeScrim;
    if (!scrim) return;
    const target = dim ? 1 : 0;
    this.tweens.killTweensOf(scrim);
    const duration = motionDuration(150);
    if (duration <= 0) {
      scrim.setAlpha(target);
      return;
    }
    this.tweens.add({ targets: scrim, alpha: target, duration, ease: "Sine.easeOut" });
  }

  /** The rule and subtitle, hidden only where a screen needs their room. */
  private setLockupVisible(visible: boolean): void {
    for (const extra of this.lockupExtras) (extra as Phaser.GameObjects.Text).setVisible(visible);
  }

  /**
   * The gold highlight behind the selected row, on every screen this scene
   * draws.
   *
   * The title menu had it and the four screens behind it — settings, key
   * bindings, load and character creation — marked selection with a bare "›"
   * and a colour change. That is the one signal a player with a colour vision
   * deficiency cannot read, and it meant the first screen felt built while the
   * rest felt like a list.
   *
   * The bar travels rather than being redrawn in place: rebuilt at the new row
   * it teleports, and nothing connects the row you left to the row you reached,
   * which is the whole job of a highlight.
   */
  private drawSelectionBar(y: number, height: number, x = 52, width = 484): void {
    // `COLORS.gold` is a CSS string for text styles; shapes want a number.
    const gold = Phaser.Display.Color.HexStringToColor(COLORS.gold).color;
    // The bar fades out rather than ending on a hard edge, which over the
    // artwork read as a stray rectangle rather than as a highlight.
    const pieces: Phaser.GameObjects.GameObject[] = [];
    const steps = 22;
    const slice = width / steps;
    for (let step = 0; step < steps; step += 1) {
      pieces.push(
        this.add.rectangle(x + step * slice, y - 9, slice, height, gold, 0.1 * (1 - step / (steps - 1)) ** 1.4).setOrigin(0)
      );
    }
    pieces.push(this.add.rectangle(x, y - 9, 3, height, gold, 0.85).setOrigin(0));
    const bar = this.add.container(0, 0, pieces);
    this.menuDecor.push(bar);
    const slide = motionDuration(140);
    if (slide > 0 && this.previousRowY !== undefined && this.previousRowY !== y) {
      bar.setY(this.previousRowY - y);
      this.tweens.add({ targets: bar, y: 0, duration: slide, ease: "Quad.easeOut" });
    }
    this.previousRowY = y;
  }

  private drawTitleMenu(message?: string): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.menuDecor.forEach((item) => item.destroy());
    this.menuDecor = [];
    this.detailText = undefined;
    this.creationTexts = [];
    this.refreshControlsText();
    this.setScrim(false);
    this.setLockupVisible(true);
    const snapshot = this.bridge.getSnapshot();
    const hasSave = snapshot.hasSave;
    const savedCount = MANUAL_SLOTS.filter((slot) => this.hasSlot(slot)).length;
    const choices = [
      this.confirmingNewGame ? "NEW CHRONICLE  —  CONFIRM OVERWRITE" : "NEW CHRONICLE",
      hasSave ? "CONTINUE  —  AUTOSAVE" : "CONTINUE  —  NO AUTOSAVE",
      `LOAD CHRONICLE  —  ${savedCount}/${MANUAL_SLOTS.length} SAVED`,
      "SETTINGS  —  ACCESSIBILITY & AUDIO"
    ];
    // Rows carry a cursor and a lit bar, not just a colour change. Colour alone
    // is the one signal a player with a colour vision deficiency cannot read,
    // and it was the only signal this screen had. The annotation after the
    // em dash drops to small muted type so the row reads as a choice rather
    // than as a line of configuration.
    this.menuTexts = choices.map((label, index) => {
      const y = 245 + index * 48;
      const selected = index === this.titleIndex;
      const unavailable = index === 1 && !hasSave;
      const [heading, annotation] = splitMenuLabel(label);

      if (selected) this.drawSelectionBar(y, 40);
      const row = this.add.text(74, y, heading, {
        ...TEXT.heading,
        color: selected ? COLORS.gold : unavailable ? "#64727a" : COLORS.cream
      });
      if (annotation) {
        this.menuDecor.push(this.add.text(74 + row.width + 16, y + row.height - 17, annotation, {
          ...TEXT.small,
          color: unavailable ? "#5c6a72" : COLORS.muted
        }));
      }
      return row;
    });
    const notice = message ?? (snapshot.storageAvailable
      ? undefined
      : "Saving is unavailable in this browser session. The game is fully playable, but progress will not persist.");
    if (notice) {
      this.detailText = this.add.text(72, 450, notice, {
        ...TEXT.small,
        color: COLORS.gold,
        wordWrap: { width: 620 },
        lineSpacing: 5
      });
    }
    // Place the legend from the notice's measured height rather than a literal.
    // At the largest text size the overwrite warning wraps to two lines and ran
    // straight through the legend at y 470 — so a player arming a destructive
    // overwrite read two paragraphs drawn on top of each other. At medium both
    // fit on one line, which is why it was never seen.
    this.controlsText?.setStyle(TEXT.small);
    this.controlsText?.setY(this.detailText
      ? Math.max(470, this.detailText.y + this.detailText.height + 8)
      : 470);
    // Which entry is selected was signalled by colour alone, and the settings
    // and bindings screens both announce themselves while the first screen the
    // player meets said nothing at all.
    announceGameStatus(
      `Title menu. ${choices[this.titleIndex] ?? choices[0] ?? ""}.`
      + ` ${this.titleIndex + 1} of ${choices.length}.`
      + (notice ? ` ${notice}` : "")
    );
    this.mode = "title";
  }

  private drawSettings(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.menuDecor.forEach((item) => item.destroy());
    this.menuDecor = [];
    this.creationTexts = [];
    this.refreshControlsText();
    this.mode = "settings";
    this.setLockupVisible(true);
    const settings = gameSettingsStore.get();
    const choices = [
      `HIGH CONTRAST       ${settings.highContrast ? "ON" : "OFF"}`,
      `TEXT SIZE           ${settings.textSize.toUpperCase()}`,
      `REDUCED MOTION      ${settings.reducedMotion ? "ON" : "OFF"}`,
      `SOUND               ${settings.soundEnabled ? "ON" : "OFF"}`,
      `SOUND VOLUME        ${Math.round(settings.soundVolume * 100)}%`,
      `MUSIC               ${settings.musicEnabled ? "ON" : "OFF"}`,
      `MUSIC VOLUME        ${Math.round(settings.musicVolume * 100)}%`,
      "KEYBOARD BINDINGS"
    ];
    this.setScrim(true);
    const heading = this.add.text(72, 210, "SETTINGS", { ...TEXT.heading, color: COLORS.gold });

    // The list windows to what actually fits. Flowing eight rows from measured
    // heights was still eight rows: at the largest text size the last two —
    // Music Volume and Keyboard Bindings — ran off the bottom of a canvas that
    // does not grow, and at every size the fixed controls legend at y 470 was
    // drawn straight through the final row.
    const pitchProbe = this.add.text(-500, -500, "M", TEXT.heading);
    const pitch = pitchProbe.height + 9;
    pitchProbe.destroy();
    const firstRowY = 248;
    const listBottom = 448;
    const capacity = Math.max(3, Math.floor((listBottom - firstRowY) / pitch));
    const view = windowAround(choices.map((label, index) => ({ label, index })), this.settingsIndex, capacity);

    let rowY = firstRowY;
    const rows: Phaser.GameObjects.Text[] = [];
    const addRow = (label: string, selected: boolean, small = false): void => {
      // Measured before the bar is drawn, so the highlight matches the row it
      // sits behind at every text size rather than a guessed height.
      const row = this.add.text(72, rowY, label, small
        ? { ...TEXT.small, color: COLORS.muted }
        : { ...TEXT.heading, color: selected ? COLORS.gold : COLORS.cream });
      if (selected) {
        this.drawSelectionBar(rowY, row.height + 12);
        // The bar is created after the row, so it would cover it. Bringing the
        // row back to the top is cheaper than reordering the whole draw.
        this.children.bringToTop(row);
      }
      rowY += row.height + (small ? 4 : 9);
      rows.push(row);
    };
    if (view.hasBefore) addRow("  ▲ more above", false, true);
    for (const { label, index } of view.items) {
      addRow(`${index === this.settingsIndex ? "›" : " "} ${label}`, index === this.settingsIndex);
    }
    if (view.hasAfter) addRow("  ▼ more below", false, true);

    this.menuTexts = [heading, ...rows];
    this.detailText = this.add.text(
      72,
      rowY + 10,
      "Enter / A toggles options. Left / Right changes volume. Esc / B returns.",
      TEXT.small
    );
    // And the legend follows the list rather than sitting at a fixed height.
    this.controlsText?.setY(this.detailText.y + this.detailText.height + 8);
    const selectedSetting = choices[this.settingsIndex] ?? choices[0];
    announceGameStatus(`Settings. ${selectedSetting}. Use up and down to choose an option.`);
  }

  private drawBindings(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.menuDecor.forEach((item) => item.destroy());
    this.menuDecor = [];
    this.creationTexts = [];
    this.refreshControlsText();
    this.mode = "bindings";
    this.setScrim(true);
    const bindings = gameSettingsStore.get().keyBindings;
    // This screen is the densest one here, so it reclaims the decorative rule
    // and subtitle. The heading was drawn at y 172, straight through them.
    this.setLockupVisible(false);
    const heading = this.add.text(72, Math.max(156, this.lockupBottom + 10), "KEYBOARD BINDINGS", { ...TEXT.heading, color: COLORS.gold });

    // Two columns, with the pitch measured rather than divided out of the
    // remaining height. Sixteen rows in one column forced a 16px pitch, which
    // is less than a row is tall at the largest text size — so the rows drew
    // through each other on the screen a player visits precisely when their
    // controls have stopped working.
    const pitchProbe = this.add.text(-500, -500, "M", { ...TEXT.body, fontSize: fontPx(12) });
    const pitch = pitchProbe.height + 7;
    pitchProbe.destroy();
    const firstRowY = heading.y + heading.height + 14;
    const perColumn = Math.ceil(REBINDABLE_ACTIONS.length / 2);

    const rows = REBINDABLE_ACTIONS.map((action, index) => {
      const selected = index === this.bindingIndex;
      const value = selected && this.capturingBinding ? "PRESS A KEY…" : keyboardBindingLabel(bindings[action]);
      const columnX = 72 + Math.floor(index / perColumn) * 430;
      const rowY = firstRowY + (index % perColumn) * pitch;
      // Narrower than the other screens and offset to the row's own column, so
      // the highlight cannot bleed across into the second one.
      if (selected) this.drawSelectionBar(rowY + 7, pitch, columnX - 20, 400);
      return this.add.text(
        columnX,
        rowY,
        `${selected ? "›" : " "} ${keyboardActionLabel(action).padEnd(22)} ${value}`,
        {
          ...TEXT.body,
          fontSize: fontPx(12),
          color: selected ? COLORS.gold : COLORS.cream
        }
      );
    });
    const resetSelected = this.bindingIndex === REBINDABLE_ACTIONS.length;
    const resetY = firstRowY + perColumn * pitch + 10;
    if (resetSelected) this.drawSelectionBar(resetY + 7, pitch, 52, 400);
    rows.push(this.add.text(
      72,
      resetY,
      `${resetSelected ? "›" : " "} Reset all bindings to defaults`,
      { ...TEXT.body, fontSize: fontPx(12), color: resetSelected ? COLORS.gold : COLORS.cream }
    ));
    this.menuTexts = [heading, ...rows];
    this.detailText = this.add.text(
      72,
      resetY + pitch + 8,
      this.capturingBinding
        ? "Press the new key, or press Escape to keep the current one."
        : "Select an action and confirm, then press its new key. Conflicts swap automatically.",
      { ...TEXT.small, wordWrap: { width: 800 } }
    );
    this.controlsText?.setY(this.detailText.y + this.detailText.height + 8);
    const selectedAction = REBINDABLE_ACTIONS[this.bindingIndex];
    // The reset row is announced too. Skipping it left the one recovery route
    // both drawn off-canvas and silent to a screen reader.
    announceGameStatus(
      this.capturingBinding && selectedAction
        ? `Press a new key for ${keyboardActionLabel(selectedAction)}, or Escape to cancel.`
        : selectedAction
          ? `Keyboard bindings. ${keyboardActionLabel(selectedAction)} is assigned to ${keyboardBindingLabel(bindings[selectedAction])}.`
          : "Keyboard bindings. Reset all bindings to defaults."
    );
  }

  private drawLoadMenu(message?: string): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.menuDecor.forEach((item) => item.destroy());
    this.menuDecor = [];
    this.creationTexts = [];
    this.mode = "load";
    this.setLockupVisible(true);
    this.setScrim(true);
    const heading = this.add.text(72, 210, "LOAD A CHRONICLE", { ...TEXT.heading, color: COLORS.gold });
    const slotTexts = MANUAL_SLOTS.map((slot, index) => {
      const available = this.hasSlot(slot);
      const selected = index === this.loadIndex;
      const rowY = 250 + index * 42;
      if (selected) this.drawSelectionBar(rowY, 36);
      return this.add.text(72, rowY, `${selected ? "›" : " "} ${SLOT_TITLES[slot]}  —  ${this.slotSummary(slot)}`, {
        ...TEXT.heading,
        fontSize: fontPx(17),
        color: selected ? (available ? COLORS.gold : COLORS.muted) : available ? COLORS.cream : "#64727a"
      });
    });
    this.menuTexts = [heading, ...slotTexts];
    this.controlsText?.setY(470);
    const selectedSlot = MANUAL_SLOTS[this.loadIndex];
    const selectedAvailable = selectedSlot ? this.hasSlot(selectedSlot) : false;
    this.detailText = this.add.text(
      72,
      430,
      message ?? (selectedAvailable
        ? "Confirm to load this chronicle. The current session will be replaced."
        : "This slot is empty. Choose an available chronicle, or return with Esc / B."),
      { ...TEXT.small, color: selectedAvailable ? COLORS.cream : COLORS.muted, wordWrap: { width: 620 }, lineSpacing: 5 }
    );
  }

  /** Surfaces the metadata the repository already computes instead of a bare AVAILABLE/EMPTY. */
  private slotSummary(slot: (typeof MANUAL_SLOTS)[number]): string {
    const summary = this.bridge.getSnapshot().saveSummaries?.find((entry) => entry.slot === slot);
    if (!summary) return "EMPTY";
    const saved = new Date(summary.updatedAt);
    const stamp = Number.isNaN(saved.getTime())
      ? ""
      : `  ${saved.toLocaleDateString()} ${saved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    // An occupied-but-unreadable slot says so. Reporting it as empty would
    // invite the player to overwrite the one copy of a chronicle.
    if (summary.damaged) return `DAMAGED — cannot be read${stamp}`;
    // Play time is real time at the controls, not the in-fiction clock: a
    // night of camping advances the world by eight hours and the player by none.
    const hours = Math.floor(summary.playTimeMinutes / 60);
    const played = hours > 0 ? `${hours}h ${summary.playTimeMinutes % 60}m` : `${summary.playTimeMinutes}m`;
    return `Lv ${summary.partyLevel}  ${summary.locationName}  ·  ${played} played${stamp}`;
  }

  private hasSlot(slot: (typeof MANUAL_SLOTS)[number]): boolean {
    return this.bridge.getSnapshot().saveSlots?.includes(slot) ?? false;
  }

  private drawCreation(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.menuDecor.forEach((item) => item.destroy());
    this.menuDecor = [];
    this.menuTexts = [];
    this.mode = "creation";
    this.setLockupVisible(true);
    this.setScrim(true);
    const difficulty = DIFFICULTY_CHOICES[this.difficultyIndex];
    const values = [
      ["NAME", NAME_CHOICES[this.nameIndex]],
      ["ANCESTRY", ancestries[this.ancestryIndex]?.name ?? ""],
      ["CALLING", jobs[this.jobIndex]?.name ?? ""],
      ["DIFFICULTY", difficulty?.label ?? ""],
      ["BEGIN", "Start in Hearthcross"]
    ] as const;
    this.creationTexts = values.map(([label, value], index) => {
      const rowY = 226 + index * 44;
      if (index === this.creationRow) this.drawSelectionBar(rowY, 38, 52, 420);
      // A cursor glyph as well as the colour change and the bar, so selection
      // never rides on colour alone.
      return this.add.text(72, rowY, `${index === this.creationRow ? "›" : " "} ${label.padEnd(12)}  ${value}`, {
        ...TEXT.heading,
        color: index === this.creationRow ? COLORS.gold : COLORS.cream
      });
    });
    const ancestry = ancestries[this.ancestryIndex];
    const job = jobs[this.jobIndex];
    // The draft's actual numbers and its authored strengths — written for
    // every loadout and previously displayed nowhere, so creation was blind.
    const preview = this.bridge.previewBuild(ancestry?.id ?? "", job?.id ?? "");
    if (preview && this.textures.exists(preview.spriteKey)) {
      this.menuDecor.push(this.add.image(480, 184, preview.spriteKey, 0)
        .setDisplaySize(80, 80)
        .setTint(preview.tint));
    }
    const previewText = preview
      ? [
        `HP ${preview.maxHp}  MP ${preview.maxMp}`,
        `STR ${preview.stats.strength}  DEX ${preview.stats.dexterity}  AGI ${preview.stats.agility}  VIT ${preview.stats.vitality}`,
        `INT ${preview.stats.intellect}  WIS ${preview.stats.wisdom}  CHA ${preview.stats.charisma}`,
        `Forms: ${preview.startingSkillNames.join(", ")}`,
        preview.trait ? `Trait: ${preview.trait}` : "",
        preview.resists.length ? `Resists: ${preview.resists.join(", ")}` : "",
        preview.vulnerableTo.length ? `Weak to: ${preview.vulnerableTo.join(", ")}` : "",
        "",
        `Strong: ${preview.strengths.join("; ")}`,
        `Watch for: ${preview.counters.join("; ")}`
      ].join("\n")
      : "";
    const detail = this.creationRow === 3
      ? (difficulty?.description ?? "")
      : `${ancestry?.trait ?? ""}\n${job?.role ?? ""}  ·  Branches: ${job?.branches.join(" / ") ?? ""}\n\n${previewText}`;
    // Starts under the wordmark rather than level with the first choice: the
    // whole upper right was empty while this column ran off the bottom.
    this.detailText = this.add.text(516, 158, detail, {
      ...TEXT.body,
      fontSize: fontPx(12),
      wordWrap: { width: 368 },
      lineSpacing: 6,
      color: COLORS.muted
    });
    // Then fitted to the frame. At the largest text size this column reached
    // 588 on a 540 canvas, so the "Watch for" line — the one written to guide
    // exactly this choice — was cut off on the screen where it is chosen.
    this.controlsText?.setY(470);
    const bottomLimit = 528;
    if (this.detailText.y + this.detailText.height > bottomLimit) {
      this.detailText.setLineSpacing(2);
    }
    if (this.detailText.y + this.detailText.height > bottomLimit) {
      this.detailText.setText(detail.replace("\n\n", "\n"));
    }
  }

  private move(delta: number): void {
    if (this.mode === "title") {
      // Moving off the row disarms the overwrite confirmation, so it can never
      // fire from a stale arm the player has forgotten about.
      this.confirmingNewGame = false;
      this.titleIndex = Phaser.Math.Wrap(this.titleIndex + delta, 0, 4);
      this.drawTitleMenu();
    } else if (this.mode === "load") {
      this.loadIndex = Phaser.Math.Wrap(this.loadIndex + delta, 0, MANUAL_SLOTS.length);
      this.drawLoadMenu();
    } else if (this.mode === "settings") {
      this.settingsIndex = Phaser.Math.Wrap(this.settingsIndex + delta, 0, 8);
      this.drawSettings();
    } else if (this.mode === "bindings") {
      if (this.capturingBinding) return;
      // One extra row: Reset to defaults.
      this.bindingIndex = Phaser.Math.Wrap(this.bindingIndex + delta, 0, REBINDABLE_ACTIONS.length + 1);
      this.drawBindings();
    } else {
      this.creationRow = Phaser.Math.Wrap(this.creationRow + delta, 0, CREATION_ROW_COUNT);
      this.drawCreation();
    }
  }

  private adjust(delta: number): void {
    if (this.mode === "settings") {
      if (this.settingsIndex === 4 || this.settingsIndex === 6) {
        const settings = gameSettingsStore.get();
        const current = this.settingsIndex === 4 ? settings.soundVolume : settings.musicVolume;
        const next = Phaser.Math.Clamp(Math.round((current + delta * 0.1) * 10) / 10, 0, 1);
        gameSettingsStore.update(this.settingsIndex === 4 ? { soundVolume: next } : { musicVolume: next });
        playSound(this, "sfx.confirm");
        this.drawSettings();
      }
      return;
    }
    if (this.mode === "bindings") return;
    if (this.mode !== "creation") return;
    if (this.creationRow === 0) this.nameIndex = Phaser.Math.Wrap(this.nameIndex + delta, 0, NAME_CHOICES.length);
    if (this.creationRow === 1) this.ancestryIndex = Phaser.Math.Wrap(this.ancestryIndex + delta, 0, ancestries.length);
    if (this.creationRow === 2) this.jobIndex = Phaser.Math.Wrap(this.jobIndex + delta, 0, jobs.length);
    if (this.creationRow === 3) this.difficultyIndex = Phaser.Math.Wrap(this.difficultyIndex + delta, 0, DIFFICULTY_CHOICES.length);
    this.drawCreation();
  }

  private async confirm(): Promise<void> {
    if (this.loading) return;
    if (this.mode === "title") {
      if (this.titleIndex === 0) {
        // A completed run lives in the autosave, and that autosave is what NG+
        // carry-over reads. Starting a new chronicle over it must be deliberate.
        if (this.bridge.getSnapshot().hasSave && !this.confirmingNewGame) {
          this.confirmingNewGame = true;
          this.drawTitleMenu("An existing chronicle will be overwritten. Confirm again to begin a new one, or press Esc / B to keep it.");
          return;
        }
        this.confirmingNewGame = false;
        this.drawCreation();
      } else if (this.titleIndex === 1 && this.bridge.getSnapshot().hasSave) {
        await this.loadInto(() => this.bridge.continueGame());
      } else if (this.titleIndex === 2) {
        this.drawLoadMenu();
      } else if (this.titleIndex === 3) {
        this.drawSettings();
      }
      return;
    }
    if (this.mode === "settings") {
      const settings = gameSettingsStore.get();
      if (this.settingsIndex === 0) gameSettingsStore.update({ highContrast: !settings.highContrast });
      else if (this.settingsIndex === 1) gameSettingsStore.update({ textSize: nextTextSize(settings.textSize) });
      else if (this.settingsIndex === 2) gameSettingsStore.update({ reducedMotion: !settings.reducedMotion });
      else if (this.settingsIndex === 3) gameSettingsStore.update({ soundEnabled: !settings.soundEnabled });
      else if (this.settingsIndex === 4) gameSettingsStore.update({ soundVolume: settings.soundVolume >= 1 ? 0 : Math.min(1, settings.soundVolume + 0.1) });
      else if (this.settingsIndex === 5) gameSettingsStore.update({ musicEnabled: !settings.musicEnabled });
      else if (this.settingsIndex === 6) gameSettingsStore.update({ musicVolume: settings.musicVolume >= 1 ? 0 : Math.min(1, settings.musicVolume + 0.1) });
      else {
        this.capturingBinding = false;
        this.drawBindings();
        return;
      }
      if (this.settingsIndex === 0 || this.settingsIndex === 2) this.syncDriftingMotes();
      playSound(this, "sfx.confirm");
      this.drawSettings();
      return;
    }
    if (this.mode === "bindings") {
      // The last row restores the defaults rather than capturing a key —
      // there was previously no way back from a bad set of bindings.
      if (this.bindingIndex === REBINDABLE_ACTIONS.length) {
        gameSettingsStore.update({ keyBindings: { ...DEFAULT_KEYBOARD_BINDINGS } });
        playSound(this, "sfx.confirm");
        this.drawBindings();
        return;
      }
      this.capturingBinding = true;
      this.drawBindings();
      return;
    }
    if (this.mode === "load") {
      const slot = MANUAL_SLOTS[this.loadIndex];
      if (!slot) return;
      if (!this.hasSlot(slot)) {
        this.drawLoadMenu("This slot is empty. It cannot be loaded.");
        return;
      }
      await this.loadInto(() => this.bridge.load(slot));
      return;
    }
    if (this.creationRow < CREATION_ROW_COUNT - 1) {
      this.creationRow += 1;
      this.drawCreation();
      return;
    }
    const draft: CharacterCreationDraft = {
      name: NAME_CHOICES[this.nameIndex] ?? "Rowan",
      ancestryId: ancestries[this.ancestryIndex]?.id ?? "hearthborn",
      jobId: jobs[this.jobIndex]?.id ?? "vanguard",
      difficulty: DIFFICULTY_CHOICES[this.difficultyIndex]?.id ?? "normal"
    };
    // Latch before the await, the way the load path already does. Without it a
    // second confirm landing inside newGame began a second chronicle, and the
    // two raced to write the same autosave record. The scene leaves on success,
    // so the latch only has to reopen when the call fails.
    this.loading = true;
    try {
      await this.bridge.newGame(draft);
    } catch (error) {
      this.loading = false;
      throw error;
    }
    fadeSceneOutThen(this, () => this.scene.start("world"), 260);
  }

  /**
   * The `loading` latch must always reopen. Without the finally, one unreadable
   * slot froze every title action — including NEW CHRONICLE — so a single bad
   * record cost the player access to all their other saves and left no escape
   * but a browser reload.
   */
  private async loadInto(run: () => GameCommandResult | Promise<GameCommandResult>): Promise<void> {
    this.loading = true;
    let result: GameCommandResult;
    try {
      result = await run();
    } catch (error) {
      console.error("Load failed", error);
      result = {
        success: false,
        message: error instanceof Error ? `Load failed: ${error.message}` : "Load failed."
      };
    } finally {
      this.loading = false;
    }
    if (!result.success) {
      playSound(this, "sfx.cursor");
      if (this.mode === "load") this.drawLoadMenu(`${result.message} Choose another chronicle, or return with Esc / B.`);
      else this.drawTitleMenu(result.message);
      return;
    }
    fadeSceneOutThen(this, () => this.scene.start("world"), 260);
  }

  private back(): void {
    if (this.capturingBinding) {
      this.capturingBinding = false;
      this.drawBindings();
    } else if (this.mode === "bindings") {
      this.drawSettings();
    } else if (this.mode === "creation" || this.mode === "load" || this.mode === "settings") {
      this.confirmingNewGame = false;
      this.drawTitleMenu();
    } else if (this.confirmingNewGame) {
      this.confirmingNewGame = false;
      this.drawTitleMenu();
    }
  }
}
