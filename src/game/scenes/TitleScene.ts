import Phaser from "phaser";
import { ancestries, jobs } from "../../content";
import {
  DEFAULT_KEYBOARD_BINDINGS,
  gameSettingsStore,
  REBINDABLE_ACTIONS
} from "../../settings";
import type { CharacterCreationDraft, Difficulty, GameBridge, GameCommandResult } from "../bridge";
import { gamepadButtonAction, pollStickDirection, type StickRepeatState } from "../gamepadControls";
import {
  keyboardActionForCode,
  keyboardActionLabel,
  keyboardCodeLabel,
  rebindKeyboardAction
} from "../keyboardControls";
import { announceGameStatus, announceScene, COLORS, getBridge, motionDuration, playSound, TEXT } from "../runtime";

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

  constructor() {
    super("title");
  }

  create(): void {
    this.bridge = getBridge(this);
    this.mode = "title";
    this.titleIndex = 0;
    this.loadIndex = 0;
    this.cameras.main.setBackgroundColor(COLORS.ink);
    this.paintBackdrop();
    this.add.text(64, 66, "YGGDRASIL", { ...TEXT.title, fontSize: "54px", letterSpacing: 7 });
    this.add.text(68, 126, "C H R O N I C L E S", { ...TEXT.body, color: COLORS.gold, letterSpacing: 4 });
    this.add.text(68, 164, "The Severed Concord", { ...TEXT.heading, fontStyle: "italic", color: COLORS.muted });
    this.controlsText = this.add.text(68, 470, "", TEXT.small);
    this.refreshControlsText();
    this.drawTitleMenu();
    this.bindKeys();
    announceScene("title");
  }

  private paintBackdrop(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x12202c).fillRect(0, 0, 960, 540);
    graphics.fillStyle(0x172d34).fillCircle(790, 160, 250);
    graphics.lineStyle(18, 0x335b4c, 0.45);
    graphics.beginPath();
    graphics.moveTo(790, 540);
    graphics.lineTo(774, 300);
    graphics.lineTo(710, 220);
    graphics.moveTo(780, 326);
    graphics.lineTo(870, 230);
    graphics.moveTo(760, 275);
    graphics.lineTo(675, 185);
    graphics.strokePath();
    graphics.lineStyle(3, 0x78a777, 0.3);
    for (let index = 0; index < 14; index += 1) {
      graphics.beginPath();
      graphics.moveTo(610 + index * 26, 0);
      graphics.lineTo(520 + index * 31, 540);
      graphics.strokePath();
    }
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
      `${keyboardCodeLabel(bindings.up)}/${keyboardCodeLabel(bindings.down)} / D-pad  Navigate     `
      + `${keyboardCodeLabel(bindings.confirm)} / A  Confirm     `
      + `${keyboardCodeLabel(bindings.cancel)} / B  Back`
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

  private drawTitleMenu(message?: string): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.detailText = undefined;
    this.creationTexts = [];
    this.refreshControlsText();
    const snapshot = this.bridge.getSnapshot();
    const hasSave = snapshot.hasSave;
    const savedCount = MANUAL_SLOTS.filter((slot) => this.hasSlot(slot)).length;
    const choices = [
      this.confirmingNewGame ? "NEW CHRONICLE  —  CONFIRM OVERWRITE" : "NEW CHRONICLE",
      hasSave ? "CONTINUE  —  AUTOSAVE" : "CONTINUE  —  NO AUTOSAVE",
      `LOAD CHRONICLE  —  ${savedCount}/${MANUAL_SLOTS.length} SAVED`,
      "SETTINGS  —  ACCESSIBILITY & AUDIO"
    ];
    this.menuTexts = choices.map((label, index) =>
      this.add.text(72, 245 + index * 48, label, {
        ...TEXT.heading,
        color: index === this.titleIndex
          ? COLORS.gold
          : index === 1 && !hasSave ? "#64727a" : COLORS.cream
      })
    );
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
    this.mode = "title";
  }

  private drawSettings(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.creationTexts = [];
    this.refreshControlsText();
    this.mode = "settings";
    const settings = gameSettingsStore.get();
    const choices = [
      `HIGH CONTRAST       ${settings.highContrast ? "ON" : "OFF"}`,
      `REDUCED MOTION      ${settings.reducedMotion ? "ON" : "OFF"}`,
      `SOUND               ${settings.soundEnabled ? "ON" : "OFF"}`,
      `SOUND VOLUME        ${Math.round(settings.soundVolume * 100)}%`,
      "KEYBOARD BINDINGS"
    ];
    const heading = this.add.text(72, 210, "SETTINGS", { ...TEXT.heading, color: COLORS.gold });
    const rows = choices.map((label, index) =>
      this.add.text(72, 250 + index * 40, `${index === this.settingsIndex ? "›" : " "} ${label}`, {
        ...TEXT.heading,
        color: index === this.settingsIndex ? COLORS.gold : COLORS.cream
      })
    );
    this.menuTexts = [heading, ...rows];
    this.detailText = this.add.text(
      72,
      442,
      "Enter / A toggles options. Left / Right changes volume. Esc / B returns.",
      TEXT.small
    );
    const selectedSetting = choices[this.settingsIndex] ?? choices[0];
    announceGameStatus(`Settings. ${selectedSetting}. Use up and down to choose an option.`);
  }

  private drawBindings(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.creationTexts = [];
    this.refreshControlsText();
    this.mode = "bindings";
    const bindings = gameSettingsStore.get().keyBindings;
    const heading = this.add.text(72, 190, "KEYBOARD BINDINGS", { ...TEXT.heading, color: COLORS.gold });
    const rows = REBINDABLE_ACTIONS.map((action, index) => {
      const selected = index === this.bindingIndex;
      const value = selected && this.capturingBinding ? "PRESS A KEY…" : keyboardCodeLabel(bindings[action]);
      return this.add.text(
        72,
        226 + index * 20,
        `${selected ? "›" : " "} ${keyboardActionLabel(action).padEnd(24)} ${value}`,
        {
          ...TEXT.body,
          fontSize: "12px",
          color: selected ? COLORS.gold : COLORS.cream
        }
      );
    });
    const resetSelected = this.bindingIndex === REBINDABLE_ACTIONS.length;
    rows.push(this.add.text(
      72,
      226 + REBINDABLE_ACTIONS.length * 20 + 8,
      `${resetSelected ? "›" : " "} Reset all bindings to defaults`,
      { ...TEXT.body, fontSize: "12px", color: resetSelected ? COLORS.gold : COLORS.cream }
    ));
    this.menuTexts = [heading, ...rows];
    this.detailText = this.add.text(
      72,
      500,
      "Select an action and confirm, then press its new key. Conflicts swap automatically.",
      TEXT.small
    );
    const selectedAction = REBINDABLE_ACTIONS[this.bindingIndex];
    if (selectedAction) {
      announceGameStatus(this.capturingBinding
        ? `Press a new key for ${keyboardActionLabel(selectedAction)}.`
        : `Keyboard bindings. ${keyboardActionLabel(selectedAction)} is assigned to ${keyboardCodeLabel(bindings[selectedAction])}.`);
    }
  }

  private drawLoadMenu(message?: string): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.creationTexts = [];
    this.mode = "load";
    const heading = this.add.text(72, 210, "LOAD A CHRONICLE", { ...TEXT.heading, color: COLORS.gold });
    const slotTexts = MANUAL_SLOTS.map((slot, index) => {
      const available = this.hasSlot(slot);
      const selected = index === this.loadIndex;
      return this.add.text(72, 250 + index * 42, `${selected ? "›" : " "} ${SLOT_TITLES[slot]}  —  ${this.slotSummary(slot)}`, {
        ...TEXT.heading,
        fontSize: "17px",
        color: selected ? (available ? COLORS.gold : COLORS.muted) : available ? COLORS.cream : "#64727a"
      });
    });
    this.menuTexts = [heading, ...slotTexts];
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
    return `Lv ${summary.partyLevel}  ${summary.locationName}${stamp}`;
  }

  private hasSlot(slot: (typeof MANUAL_SLOTS)[number]): boolean {
    return this.bridge.getSnapshot().saveSlots?.includes(slot) ?? false;
  }

  private drawCreation(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.menuTexts = [];
    this.mode = "creation";
    const difficulty = DIFFICULTY_CHOICES[this.difficultyIndex];
    const values = [
      ["NAME", NAME_CHOICES[this.nameIndex]],
      ["ANCESTRY", ancestries[this.ancestryIndex]?.name ?? ""],
      ["CALLING", jobs[this.jobIndex]?.name ?? ""],
      ["DIFFICULTY", difficulty?.label ?? ""],
      ["BEGIN", "Start in Hearthcross"]
    ] as const;
    this.creationTexts = values.map(([label, value], index) =>
      // A cursor glyph as well as the colour change, so selection never rides
      // on colour alone.
      this.add.text(72, 226 + index * 44, `${index === this.creationRow ? "›" : " "} ${label.padEnd(12)}  ${value}`, {
        ...TEXT.heading,
        color: index === this.creationRow ? COLORS.gold : COLORS.cream
      })
    );
    const ancestry = ancestries[this.ancestryIndex];
    const job = jobs[this.jobIndex];
    // The draft's actual numbers and its authored strengths — written for
    // every loadout and previously displayed nowhere, so creation was blind.
    const preview = this.bridge.previewBuild(ancestry?.id ?? "", job?.id ?? "");
    const previewText = preview
      ? [
        `HP ${preview.maxHp}  MP ${preview.maxMp}`,
        `STR ${preview.stats.strength}  DEX ${preview.stats.dexterity}  AGI ${preview.stats.agility}  VIT ${preview.stats.vitality}`,
        `INT ${preview.stats.intellect}  WIS ${preview.stats.wisdom}  CHA ${preview.stats.charisma}`,
        `Forms: ${preview.startingSkillNames.join(", ")}`,
        "",
        `Strong: ${preview.strengths.join("; ")}`,
        `Watch for: ${preview.counters.join("; ")}`
      ].join("\n")
      : "";
    this.detailText = this.add.text(
      516,
      226,
      this.creationRow === 3
        ? (difficulty?.description ?? "")
        : `${ancestry?.trait ?? ""}\n${job?.role ?? ""}  ·  Branches: ${job?.branches.join(" / ") ?? ""}\n\n${previewText}`,
      { ...TEXT.body, fontSize: "12px", wordWrap: { width: 360 }, lineSpacing: 6, color: COLORS.muted }
    );
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
      this.settingsIndex = Phaser.Math.Wrap(this.settingsIndex + delta, 0, 5);
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
      if (this.settingsIndex === 3) {
        const current = gameSettingsStore.get().soundVolume;
        gameSettingsStore.update({
          soundVolume: Phaser.Math.Clamp(Math.round((current + delta * 0.1) * 10) / 10, 0, 1)
        });
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
      else if (this.settingsIndex === 1) gameSettingsStore.update({ reducedMotion: !settings.reducedMotion });
      else if (this.settingsIndex === 2) gameSettingsStore.update({ soundEnabled: !settings.soundEnabled });
      else if (this.settingsIndex === 3) gameSettingsStore.update({ soundVolume: settings.soundVolume >= 1 ? 0 : Math.min(1, settings.soundVolume + 0.1) });
      else {
        this.capturingBinding = false;
        this.drawBindings();
        return;
      }
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
    await this.bridge.newGame(draft);
    this.cameras.main.fadeOut(motionDuration(260), 10, 18, 24);
    this.time.delayedCall(motionDuration(270), () => this.scene.start("world"));
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
      playSound(this, "sfx.cancel");
      if (this.mode === "load") this.drawLoadMenu(`${result.message} Choose another chronicle, or return with Esc / B.`);
      else this.drawTitleMenu(result.message);
      return;
    }
    this.cameras.main.fadeOut(motionDuration(260), 10, 18, 24);
    this.time.delayedCall(motionDuration(270), () => this.scene.start("world"));
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
