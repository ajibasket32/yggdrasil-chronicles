import Phaser from "phaser";
import { ancestries, jobs } from "../../content";
import type { CharacterCreationDraft, GameBridge } from "../bridge";
import { gamepadButtonAction } from "../gamepadControls";
import { announceScene, COLORS, getBridge, TEXT } from "../runtime";

const NAME_CHOICES = ["Rowan", "Aster", "Marlowe", "Sage", "Kestrel", "Vale"] as const;
const MANUAL_SLOTS = ["manual-1", "manual-2", "manual-3"] as const;

type TitleMode = "title" | "creation" | "load";

export class TitleScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private mode: TitleMode = "title";
  private titleIndex = 0;
  private loadIndex = 0;
  private creationRow = 0;
  private nameIndex = 0;
  private ancestryIndex = 0;
  private jobIndex = 0;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private detailText?: Phaser.GameObjects.Text;
  private creationTexts: Phaser.GameObjects.Text[] = [];
  private loading = false;
  private highContrast = false;

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
    this.add.text(68, 470, "Arrows / D-pad  Navigate     Enter / A  Confirm     Esc / B  Back", TEXT.small);
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

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.on("keydown-UP", () => this.move(-1));
    keyboard.on("keydown-W", () => this.move(-1));
    keyboard.on("keydown-DOWN", () => this.move(1));
    keyboard.on("keydown-S", () => this.move(1));
    keyboard.on("keydown-LEFT", () => this.adjust(-1));
    keyboard.on("keydown-A", () => this.adjust(-1));
    keyboard.on("keydown-RIGHT", () => this.adjust(1));
    keyboard.on("keydown-D", () => this.adjust(1));
    keyboard.on("keydown-ENTER", () => void this.confirm());
    keyboard.on("keydown-SPACE", () => void this.confirm());
    keyboard.on("keydown-ESC", () => this.back());
    this.input.gamepad?.on("down", this.onGamepadButton, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.gamepad?.off("down", this.onGamepadButton, this));
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

  private drawTitleMenu(): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.creationTexts = [];
    const hasSave = this.bridge.getSnapshot().hasSave;
    const manualSaveCount = MANUAL_SLOTS.filter((slot) => this.hasSlot(slot)).length;
    const choices = [
      "NEW CHRONICLE",
      hasSave ? "CONTINUE  —  AUTOSAVE" : "CONTINUE  —  NO AUTOSAVE",
      `LOAD CHRONICLE  —  ${manualSaveCount}/3 MANUAL`,
      `ACCESSIBILITY  —  HIGH CONTRAST ${this.highContrast ? "ON" : "OFF"}`
    ];
    this.menuTexts = choices.map((label, index) =>
      this.add.text(72, 245 + index * 48, label, {
        ...TEXT.heading,
        color: index === this.titleIndex ? COLORS.gold : index === 1 && !hasSave ? "#64727a" : this.highContrast ? "#ffffff" : COLORS.cream
      })
    );
    this.mode = "title";
  }

  private drawLoadMenu(message?: string): void {
    this.menuTexts.forEach((text) => text.destroy());
    this.creationTexts.forEach((text) => text.destroy());
    this.detailText?.destroy();
    this.creationTexts = [];
    this.mode = "load";
    const heading = this.add.text(72, 220, "LOAD A CHRONICLE", { ...TEXT.heading, color: COLORS.gold });
    const slotTexts = MANUAL_SLOTS.map((slot, index) => {
      const available = this.hasSlot(slot);
      const selected = index === this.loadIndex;
      return this.add.text(72, 264 + index * 48, `${selected ? "›" : " "} SLOT ${index + 1}  —  ${available ? "AVAILABLE" : "EMPTY"}`, {
        ...TEXT.heading,
        color: selected ? (available ? COLORS.gold : COLORS.muted) : available ? COLORS.cream : "#64727a"
      });
    });
    this.menuTexts = [heading, ...slotTexts];
    const selectedSlot = MANUAL_SLOTS[this.loadIndex];
    const selectedAvailable = selectedSlot ? this.hasSlot(selectedSlot) : false;
    this.detailText = this.add.text(
      72,
      424,
      message ?? (selectedAvailable
        ? "Confirm to load this manual chronicle. The current session will be replaced."
        : "This manual slot is empty. Choose an available chronicle, or return with Esc / B."),
      { ...TEXT.small, color: selectedAvailable ? COLORS.cream : COLORS.muted, wordWrap: { width: 500 }, lineSpacing: 5 }
    );
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
    const values = [
      ["NAME", NAME_CHOICES[this.nameIndex]],
      ["ANCESTRY", ancestries[this.ancestryIndex]?.name ?? ""],
      ["CALLING", jobs[this.jobIndex]?.name ?? ""],
      ["BEGIN", "Start in Hearthcross"]
    ] as const;
    this.creationTexts = values.map(([label, value], index) =>
      this.add.text(72, 226 + index * 51, `${label.padEnd(12)}  ${value}`, {
        ...TEXT.heading,
        color: index === this.creationRow ? COLORS.gold : COLORS.cream
      })
    );
    const ancestry = ancestries[this.ancestryIndex];
    const job = jobs[this.jobIndex];
    this.detailText = this.add.text(
      516,
      268,
      `${ancestry?.trait ?? ""}\n${ancestry?.description ?? ""}\n\n${job?.role ?? ""}\nBranches: ${job?.branches.join(" / ") ?? ""}`,
      { ...TEXT.body, wordWrap: { width: 340 }, lineSpacing: 7, color: COLORS.muted }
    );
  }

  private move(delta: number): void {
    if (this.mode === "title") {
      this.titleIndex = Phaser.Math.Wrap(this.titleIndex + delta, 0, 4);
      this.drawTitleMenu();
    } else if (this.mode === "load") {
      this.loadIndex = Phaser.Math.Wrap(this.loadIndex + delta, 0, MANUAL_SLOTS.length);
      this.drawLoadMenu();
    } else {
      this.creationRow = Phaser.Math.Wrap(this.creationRow + delta, 0, 4);
      this.drawCreation();
    }
  }

  private adjust(delta: number): void {
    if (this.mode !== "creation") return;
    if (this.creationRow === 0) this.nameIndex = Phaser.Math.Wrap(this.nameIndex + delta, 0, NAME_CHOICES.length);
    if (this.creationRow === 1) this.ancestryIndex = Phaser.Math.Wrap(this.ancestryIndex + delta, 0, ancestries.length);
    if (this.creationRow === 2) this.jobIndex = Phaser.Math.Wrap(this.jobIndex + delta, 0, jobs.length);
    this.drawCreation();
  }

  private async confirm(): Promise<void> {
    if (this.loading) return;
    if (this.mode === "title") {
      if (this.titleIndex === 0) {
        this.drawCreation();
      } else if (this.titleIndex === 1 && this.bridge.getSnapshot().hasSave) {
        await this.bridge.continueGame();
        this.scene.start("world");
      } else if (this.titleIndex === 2) {
        this.drawLoadMenu();
      } else if (this.titleIndex === 3) {
        this.toggleHighContrast();
      }
      return;
    }
    if (this.mode === "load") {
      const slot = MANUAL_SLOTS[this.loadIndex];
      if (!slot) return;
      if (!this.hasSlot(slot)) {
        this.drawLoadMenu("This manual slot is empty. It cannot be loaded.");
        return;
      }
      this.loading = true;
      await this.bridge.load(slot);
      this.loading = false;
      this.cameras.main.fadeOut(260, 10, 18, 24);
      this.time.delayedCall(270, () => this.scene.start("world"));
      return;
    }
    if (this.creationRow < 3) {
      this.creationRow += 1;
      this.drawCreation();
      return;
    }
    const draft: CharacterCreationDraft = {
      name: NAME_CHOICES[this.nameIndex] ?? "Rowan",
      ancestryId: ancestries[this.ancestryIndex]?.id ?? "hearthborn",
      jobId: jobs[this.jobIndex]?.id ?? "vanguard"
    };
    await this.bridge.newGame(draft);
    this.cameras.main.fadeOut(260, 10, 18, 24);
    this.time.delayedCall(270, () => this.scene.start("world"));
  }

  private back(): void {
    if (this.mode === "creation" || this.mode === "load") this.drawTitleMenu();
  }

  private toggleHighContrast(): void {
    this.highContrast = !this.highContrast;
    this.game.canvas.style.filter = this.highContrast ? "contrast(1.45) brightness(1.12)" : "";
    this.drawTitleMenu();
  }
}
