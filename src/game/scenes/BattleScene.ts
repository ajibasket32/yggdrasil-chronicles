import Phaser from "phaser";
import { gameSettingsStore } from "../../settings";
import type { BattleAction, BattleView, GameBridge, GameSnapshot } from "../bridge";
import { gamepadButtonAction } from "../gamepadControls";
import { keyboardActionForCode, keyboardCodeLabel } from "../keyboardControls";
import { announceScene, COLORS, getBridge, playSound, TEXT } from "../runtime";

const ACTIONS: Array<{ id: BattleAction; label: string; hint: string }> = [
  { id: "attack", label: "ATTACK", hint: "A reliable physical strike." },
  { id: "skill", label: "FORM", hint: "Spend focus on a practiced form." },
  { id: "item", label: "ITEM", hint: "Use an item from the shared pack." },
  { id: "guard", label: "GUARD", hint: "Reduce incoming harm this round." },
  { id: "escape", label: "ESCAPE", hint: "Look for a safe route out." }
];

export class BattleScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private snapshot!: Readonly<GameSnapshot>;
  private actionIndex = 0;
  private skillMenuOpen = false;
  private skillIndex = 0;
  private unsubscribe?: () => void;
  private resolving = false;

  constructor() {
    super("battle");
  }

  create(): void {
    this.bridge = getBridge(this);
    this.snapshot = this.bridge.getSnapshot();
    if (!this.snapshot.battle) {
      this.scene.start("world");
      return;
    }
    this.cameras.main.setBackgroundColor(0x151923);
    this.render();
    this.bindKeys();
    this.unsubscribe = this.bridge.subscribe((snapshot) => {
      this.snapshot = snapshot;
      this.resolving = false;
      this.skillMenuOpen = false;
      this.skillIndex = 0;
      this.render();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    announceScene("battle");
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
    if (action === "up" || action === "left") this.move(-1);
    else if (action === "down" || action === "right") this.move(1);
    else if (action === "confirm" || action === "interact") void this.confirm();
    else if (action === "cancel") this.cancel();
  }

  private onGamepadButton(_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button): void {
    const action = gamepadButtonAction(button.index);
    if (action === "up" || action === "left") this.move(-1);
    else if (action === "down" || action === "right") this.move(1);
    else if (action === "confirm") void this.confirm();
    else if (action === "cancel") this.cancel();
  }

  private cancel(): void {
    if (this.skillMenuOpen) {
      this.skillMenuOpen = false;
      this.render();
      return;
    }
    this.actionIndex = ACTIONS.length - 1;
    this.render();
  }

  private render(): void {
    const battle = this.snapshot.battle;
    if (!battle) return;
    this.children.removeAll();
    this.paintArena(battle);
    this.paintActors(battle);
    if (this.skillMenuOpen) this.paintSkillMenu(battle);
    else this.paintCommandPanel(battle);
  }

  private paintArena(battle: BattleView): void {
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x1e3235, 0x1e3235, 0x121a24, 0x121a24).fillRect(0, 0, 960, 340);
    graphics.fillStyle(0x2b413e).fillEllipse(480, 305, 760, 120);
    graphics.lineStyle(2, 0x698377, 0.25);
    for (let ring = 0; ring < 6; ring += 1) graphics.strokeEllipse(480, 305, 240 + ring * 94, 42 + ring * 15);
    this.add.text(28, 22, battle.title.toUpperCase(), { ...TEXT.heading, color: COLORS.gold });
    this.add.text(28, 50, `ROUND ${battle.round}`, TEXT.small);
    if (battle.bossPhase) {
      this.add.text(930, 24, battle.bossPhase.toUpperCase(), {
        ...TEXT.small,
        color: COLORS.gold
      }).setOrigin(1, 0);
    }
  }

  private paintActors(battle: BattleView): void {
    const party = battle.actors.filter(({ isParty }) => isParty);
    const enemies = battle.actors.filter(({ isParty }) => !isParty);
    party.forEach((actor, index) => {
      const x = 160 + index * 96;
      const y = 245 - (index % 2) * 45;
      const key = actor.spriteKey && this.textures.exists(actor.spriteKey) ? actor.spriteKey : "sprite.player";
      const sprite = this.add.image(x, y, key).setScale(1.8).setFlipX(true);
      if (actor.tint !== undefined) sprite.setTint(actor.tint);
      if (actor.hp <= 0) sprite.setTint(0x4d545d);
      this.drawActiveActorMarker(x, y, actor.id === battle.activeActorId, actor.name);
      this.drawHealth(x - 48, y + 38, 96, actor.hp, actor.maxHp, actor.name, true);
    });
    enemies.forEach((actor, index) => {
      const x = 690 + (index % 2) * 105;
      const y = 200 + Math.floor(index / 2) * 90;
      const key = actor.spriteKey && this.textures.exists(actor.spriteKey) ? actor.spriteKey : "sprite.enemy";
      const sprite = this.add.image(x, y, key).setScale(actor.maxHp > 80 ? 2 : 1.45);
      if (actor.tint !== undefined) sprite.setTint(actor.tint);
      if (actor.hp <= 0) sprite.setAlpha(0.25);
      this.drawActiveActorMarker(x, y, actor.id === battle.activeActorId, this.titleCase(actor.name));
      this.drawHealth(x - 48, y + 42, 96, actor.hp, actor.maxHp, this.titleCase(actor.name), false);
    });
  }

  private drawActiveActorMarker(x: number, y: number, active: boolean, name: string): void {
    if (!active) return;
    this.add.circle(x, y, 42, 0xf2c66d, 0.1).setStrokeStyle(3, 0xf2c66d);
    this.add.text(x, y - 62, "ACTIVE", {
      ...TEXT.small,
      color: COLORS.gold,
      backgroundColor: "#101622dd",
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5);
    this.add.text(28, 74, `ACTING: ${name.toUpperCase()}`, { ...TEXT.small, color: COLORS.gold });
  }

  private drawHealth(x: number, y: number, width: number, hp: number, maxHp: number, name: string, party: boolean): void {
    const ratio = maxHp > 0 ? Phaser.Math.Clamp(hp / maxHp, 0, 1) : 0;
    this.add.rectangle(x, y, width, 7, 0x11151c).setOrigin(0);
    this.add.rectangle(x, y, width * ratio, 7, party ? 0x64ba83 : 0xc95d63).setOrigin(0);
    this.add.text(x, y + 9, `${name}  ${hp}/${maxHp}`, { ...TEXT.small, fontSize: "9px" }).setOrigin(0);
  }

  private paintCommandPanel(battle: BattleView): void {
    this.add.rectangle(0, 340, 960, 200, COLORS.panel).setOrigin(0);
    this.add.rectangle(0, 340, 960, 2, 0x6f8f82).setOrigin(0);
    if (battle.phase === "victory" || battle.phase === "defeat" || battle.phase === "escaped") {
      const label = battle.phase === "victory" ? "VICTORY" : battle.phase === "escaped" ? "SAFE WITHDRAWAL" : "THE PARTY FALLS";
      this.add.text(38, 370, label, { ...TEXT.title, color: battle.phase === "defeat" ? "#e46e76" : COLORS.gold });
      this.add.text(40, 431, battle.log.at(-1) ?? "", TEXT.body);
      this.add.text(40, 493, "Enter  Return to the road", TEXT.small);
      return;
    }

    this.add.text(28, 360, "CHOOSE ACTION", { ...TEXT.small, color: COLORS.gold });
    ACTIONS.forEach((action, index) => {
      this.add.text(28 + index * 121, 393, action.label, {
        ...TEXT.heading,
        fontSize: "16px",
        color: index === this.actionIndex ? COLORS.gold : COLORS.cream,
        backgroundColor: index === this.actionIndex ? "#30453f" : "#00000000",
        padding: { x: 8, y: 7 }
      });
    });
    const isSkillRow = this.actionIndex === 1;
    const skillSummary = isSkillRow && battle.activeSkills.length > 0
      ? battle.activeSkills.map((skill) => skill.name).join(" / ")
      : undefined;
    const hint = skillSummary
      ? `${skillSummary}: ${ACTIONS[this.actionIndex]?.hint ?? ""}`
      : ACTIONS[this.actionIndex]?.hint ?? "";
    this.add.text(36, 446, hint, { ...TEXT.body, color: COLORS.muted });
    const recentLog = battle.log.slice(-3).join("\n");
    this.add.text(670, 365, recentLog, {
      ...TEXT.small,
      wordWrap: { width: 255 },
      lineSpacing: 4,
      color: COLORS.cream
    });
    const bindings = gameSettingsStore.get().keyBindings;
    this.add.text(
      36,
      488,
      `${keyboardCodeLabel(bindings.up)}/${keyboardCodeLabel(bindings.down)} moves actions · `
      + `${keyboardCodeLabel(bindings.confirm)} / A confirms · ${keyboardCodeLabel(bindings.cancel)} / B selects escape`,
      TEXT.small
    );
    this.add.text(36, 507, this.resolving ? "Resolving…" : "Choose an action, then confirm.", TEXT.small);
  }

  private paintSkillMenu(battle: BattleView): void {
    this.add.text(28, 360, "CHOOSE A FORM", { ...TEXT.small, color: COLORS.gold });
    battle.activeSkills.forEach((skill, index) => {
      const selected = index === this.skillIndex;
      this.add.text(36, 393 + index * 24, `${selected ? "›" : " "} ${skill.name.padEnd(20)} ${skill.mpCost} MP`, {
        ...TEXT.heading,
        fontSize: "14px",
        color: selected ? COLORS.gold : COLORS.cream
      });
    });
    const bindings = gameSettingsStore.get().keyBindings;
    this.add.text(
      36,
      488,
      `${keyboardCodeLabel(bindings.up)}/${keyboardCodeLabel(bindings.down)} selects a form · `
      + `${keyboardCodeLabel(bindings.confirm)} / A confirms · ${keyboardCodeLabel(bindings.cancel)} / B back`,
      TEXT.small
    );
  }

  private move(delta: number): void {
    const battle = this.snapshot.battle;
    if (!battle || battle.phase !== "choosing" || this.resolving) return;
    if (this.skillMenuOpen) {
      if (battle.activeSkills.length === 0) return;
      this.skillIndex = Phaser.Math.Wrap(this.skillIndex + delta, 0, battle.activeSkills.length);
      this.render();
      return;
    }
    this.actionIndex = Phaser.Math.Wrap(this.actionIndex + delta, 0, ACTIONS.length);
    this.render();
  }

  private async confirm(): Promise<void> {
    const battle = this.snapshot.battle;
    if (!battle || this.resolving) return;
    if (battle.phase === "victory" || battle.phase === "defeat" || battle.phase === "escaped") {
      this.resolving = true;
      await this.bridge.leaveBattle();
      this.scene.start("world");
      return;
    }
    if (this.skillMenuOpen) {
      const skill = battle.activeSkills[this.skillIndex];
      playSound(this, "sfx.heal");
      this.resolving = true;
      this.skillMenuOpen = false;
      this.render();
      await this.bridge.chooseBattleAction("skill", skill?.id);
      return;
    }
    const action = ACTIONS[this.actionIndex];
    if (!action) return;
    if (action.id === "skill" && battle.activeSkills.length > 1) {
      this.skillMenuOpen = true;
      this.skillIndex = 0;
      this.render();
      return;
    }
    playSound(this, action.id === "skill" || action.id === "item" ? "sfx.heal" : action.id === "attack" ? "sfx.attack" : "sfx.confirm");
    this.resolving = true;
    this.render();
    await this.bridge.chooseBattleAction(action.id);
  }

  private titleCase(value: string): string {
    return value.split(" ").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
  }
}
