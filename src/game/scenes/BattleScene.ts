import Phaser from "phaser";
import { gameSettingsStore } from "../../settings";
import type { BattleAction, BattleView, GameBridge, GameSnapshot } from "../bridge";
import { gamepadButtonAction, pollStickDirection, type StickRepeatState } from "../gamepadControls";
import { keyboardActionForCode, keyboardCodeLabel } from "../keyboardControls";
import { announceGameStatus, announceScene, COLORS, fontPx, getBridge, motionDuration, playSound, TEXT } from "../runtime";

const ACTIONS: Array<{ id: BattleAction; label: string; hint: string }> = [
  { id: "attack", label: "ATTACK", hint: "A reliable physical strike." },
  { id: "skill", label: "FORM", hint: "Spend focus on a practiced form." },
  { id: "item", label: "ITEM", hint: "Use an item from the shared pack." },
  { id: "guard", label: "GUARD", hint: "Reduce incoming harm this round." },
  { id: "escape", label: "ESCAPE", hint: "Look for a safe route out." }
];

/**
 * Boss encounters refuse escape, so offering it invited a wasted turn the UI
 * had actively advertised. Omitting the row means the choice never exists.
 */
function actionsFor(battle: BattleView | undefined): typeof ACTIONS {
  return battle?.escapable === false ? ACTIONS.filter((action) => action.id !== "escape") : ACTIONS;
}

type SubMenu = "none" | "skill" | "item";

export class BattleScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private snapshot!: Readonly<GameSnapshot>;
  private actionIndex = 0;
  private subMenu: SubMenu = "none";
  private subMenuIndex = 0;
  /** Where each actor was last drawn, so event feedback can be placed on them. */
  private readonly actorPositions = new Map<string, { x: number; y: number; sprite: Phaser.GameObjects.Image }>();
  private unsubscribe?: () => void;
  private resolving = false;
  private readonly stickState: StickRepeatState = { nextAt: 0 };

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
      const previousPhase = this.snapshot.battle?.phase;
      this.snapshot = snapshot;
      this.resolving = false;
      this.subMenu = "none";
      this.subMenuIndex = 0;
      this.render();
      this.reactToPhase(previousPhase);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    announceScene("battle");
  }

  override update(time: number): void {
    const direction = pollStickDirection(this.input.gamepad?.getPad(0), this.stickState, time);
    if (direction === "up" || direction === "left") this.move(-1);
    else if (direction === "down" || direction === "right") this.move(1);
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
    event.preventDefault();
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
    // Manual unstick. Cancel is the one key guaranteed to be reachable, so it
    // clears a stuck gate rather than being swallowed by it.
    if (this.resolving) {
      this.resolving = false;
      this.render();
      return;
    }
    if (this.subMenu !== "none") {
      this.subMenu = "none";
      this.render();
      return;
    }
    this.actionIndex = actionsFor(this.snapshot.battle).length - 1;
    this.render();
  }

  /**
   * `children.removeAll()` only detaches from the display list — every Text
   * keeps its backing canvas and its game-scoped texture entry, so a repaint
   * per keypress grows memory without bound over a long campaign. Destroying
   * releases both.
   */
  private clearDisplayList(): void {
    this.children.removeAll(true);
  }

  /**
   * Sounds and announcements for the battle's turning points, and a running
   * commentary for screen readers. The scene previously spoke once on entry
   * and then went silent; victory, defeat and every exchange were unvoiced.
   */
  private reactToPhase(previousPhase?: string): void {
    const battle = this.snapshot.battle;
    if (!battle) return;
    const latest = battle.log.at(-1);
    if (latest) announceGameStatus(latest);
    if (battle.phase === previousPhase) {
      if (battle.events.some((event) => event.type === "miss")) playSound(this, "sfx.miss");
      return;
    }
    if (battle.phase === "victory") {
      playSound(this, "sfx.victory");
      if (battle.log.some((line) => line.includes("reaches level"))) playSound(this, "sfx.levelup");
      announceGameStatus("Victory.");
    } else if (battle.phase === "defeat") {
      playSound(this, "sfx.defeat");
      announceGameStatus("The party falls.");
    }
  }

  private render(): void {
    const battle = this.snapshot.battle;
    // Clear first, unconditionally. Bailing before the clear left the stale
    // panel painted on screen during the battle-to-world handover.
    this.clearDisplayList();
    if (!battle) return;
    this.paintArena(battle);
    this.paintActors(battle);
    this.playEventFeedback(battle);
    if (this.subMenu === "skill") this.paintSkillMenu(battle);
    else if (this.subMenu === "item") this.paintItemMenu(battle);
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
    // Recorded so the event pass can find who to animate and where.
    this.actorPositions.clear();
    party.forEach((actor, index) => {
      const x = 160 + index * 96;
      const y = 245 - (index % 2) * 45;
      const key = actor.spriteKey && this.textures.exists(actor.spriteKey) ? actor.spriteKey : "sprite.player";
      const sprite = this.add.image(x, y, key).setScale(1.8).setFlipX(true);
      if (actor.tint !== undefined) sprite.setTint(actor.tint);
      if (!actor.alive) sprite.setTint(0x4d545d);
      this.actorPositions.set(actor.id, { x, y, sprite });
      this.drawActiveActorMarker(x, y, actor.id === battle.activeActorId, actor.name);
      this.drawHealth(x - 48, y + 38, 96, actor.hp, actor.maxHp, actor.name, true);
      this.drawResource(x - 48, y + 56, 96, actor.mp, actor.maxMp);
      this.drawStatuses(x - 48, y + 68, actor.statuses);
    });
    enemies.forEach((actor, index) => {
      const x = 690 + (index % 2) * 105;
      const y = 200 + Math.floor(index / 2) * 90;
      const key = actor.spriteKey && this.textures.exists(actor.spriteKey) ? actor.spriteKey : "sprite.enemy";
      const sprite = this.add.image(x, y, key).setScale(actor.maxHp > 80 ? 2 : 1.45);
      if (actor.tint !== undefined) sprite.setTint(actor.tint);
      if (!actor.alive) sprite.setAlpha(0.25);
      this.actorPositions.set(actor.id, { x, y, sprite });
      this.drawActiveActorMarker(x, y, actor.id === battle.activeActorId, this.titleCase(actor.name));
      this.drawHealth(x - 48, y + 42, 96, actor.hp, actor.maxHp, this.titleCase(actor.name), false);
      this.drawStatuses(x - 48, y + 60, actor.statuses);
    });
  }

  /**
   * Plays the typed events from the most recent action: a floating number per
   * damage or heal, and a recoil on whoever was struck. The bridge already
   * carries amount, element and critical, so none of this needs to re-derive
   * anything from the log text.
   */
  private playEventFeedback(battle: BattleView): void {
    if (battle.events.length === 0) return;
    let delay = 0;
    for (const event of battle.events) {
      if (event.type === "damage") {
        this.floatNumber(event.targetId, `${event.amount}`, event.critical ? 0xf2c66d : 0xe46e76, delay, event.critical);
        this.recoil(event.targetId, delay);
        delay += 90;
      } else if (event.type === "healing") {
        this.floatNumber(event.targetId, `+${event.amount}`, 0x64ba83, delay, false);
        delay += 90;
      } else if (event.type === "miss") {
        this.floatNumber(event.targetId, "MISS", 0x9fb0bd, delay, false);
        delay += 70;
      } else if (event.type === "status_damage") {
        this.floatNumber(event.targetId, `${event.amount}`, 0xb98cd6, delay, false);
        delay += 70;
      }
    }
  }

  private floatNumber(actorId: string, text: string, color: number, delay: number, emphatic: boolean): void {
    const position = this.actorPositions.get(actorId);
    if (!position) return;
    const label = this.add.text(position.x, position.y - 18, text, {
      ...TEXT.heading,
      fontSize: fontPx(emphatic ? 22 : 17),
      color: `#${color.toString(16).padStart(6, "0")}`
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({
      targets: label,
      alpha: 1,
      duration: motionDuration(70),
      delay: motionDuration(delay),
      onComplete: () => {
        this.tweens.add({
          targets: label,
          y: position.y - 62,
          alpha: 0,
          duration: motionDuration(520),
          ease: "Sine.easeOut",
          onComplete: () => label.destroy()
        });
      }
    });
  }

  private recoil(actorId: string, delay: number): void {
    const position = this.actorPositions.get(actorId);
    if (!position) return;
    const origin = position.x;
    this.tweens.add({
      targets: position.sprite,
      x: origin + 9,
      duration: motionDuration(60),
      delay: motionDuration(delay),
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => position.sprite.setX(origin)
    });
  }

  private drawResource(x: number, y: number, width: number, mp: number, maxMp: number): void {
    if (maxMp <= 0) return;
    const ratio = Phaser.Math.Clamp(mp / maxMp, 0, 1);
    this.add.rectangle(x, y, width, 4, 0x11151c).setOrigin(0);
    this.add.rectangle(x, y, width * ratio, 4, 0x5f8fd0).setOrigin(0);
  }

  /** Status tokens, so the one screen where conditions decide play finally shows them. */
  private drawStatuses(x: number, y: number, statuses: BattleView["actors"][number]["statuses"]): void {
    if (statuses.length === 0) return;
    const text = statuses.map(({ id, remainingTurns }) => `${id.slice(0, 3).toUpperCase()}${remainingTurns}`).join(" ");
    this.add.text(x, y, text, { ...TEXT.small, fontSize: fontPx(9), color: COLORS.gold }).setOrigin(0);
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
    this.add.text(x, y + 9, `${name}  ${hp}/${maxHp}`, { ...TEXT.small, fontSize: fontPx(9) }).setOrigin(0);
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
    const actions = actionsFor(battle);
    actions.forEach((action, index) => {
      this.add.text(28 + index * 121, 393, action.label, {
        ...TEXT.heading,
        fontSize: fontPx(16),
        color: index === this.actionIndex ? COLORS.gold : COLORS.cream,
        backgroundColor: index === this.actionIndex ? "#30453f" : "#00000000",
        padding: { x: 8, y: 7 }
      });
    });
    const selected = actions[this.actionIndex];
    const skillSummary = selected?.id === "skill" && battle.activeSkills.length > 0
      ? battle.activeSkills.map((skill) => skill.name).join(" / ")
      : undefined;
    const itemSummary = selected?.id === "item" && battle.activeItems.length > 0
      ? battle.activeItems.map((item) => `${item.name} x${item.quantity}`).join(" / ")
      : undefined;
    const hint = skillSummary
      ? `${skillSummary}: ${selected?.hint ?? ""}`
      : itemSummary
        ? `${itemSummary}: ${selected?.hint ?? ""}`
        : selected?.hint ?? "";
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
      const selected = index === this.subMenuIndex;
      this.add.text(36, 393 + index * 24, `${selected ? "›" : " "} ${skill.name.padEnd(20)} ${skill.mpCost} MP`, {
        ...TEXT.heading,
        fontSize: fontPx(14),
        color: selected ? COLORS.gold : COLORS.cream
      });
    });
    this.paintSubMenuHint("selects a form");
  }

  private paintItemMenu(battle: BattleView): void {
    this.add.text(28, 360, "CHOOSE AN ITEM", { ...TEXT.small, color: COLORS.gold });
    if (battle.activeItems.length === 0) {
      this.add.text(36, 393, "No usable item remains in the pack.", { ...TEXT.body, color: COLORS.muted });
    }
    battle.activeItems.forEach((item, index) => {
      const selected = index === this.subMenuIndex;
      this.add.text(36, 393 + index * 24, `${selected ? "›" : " "} ${item.name.padEnd(20)} x${item.quantity}`, {
        ...TEXT.heading,
        fontSize: fontPx(14),
        color: selected ? COLORS.gold : COLORS.cream
      });
      if (selected) {
        this.add.text(340, 393 + index * 24, item.description, { ...TEXT.small, color: COLORS.muted });
      }
    });
    this.paintSubMenuHint("selects an item");
  }

  private paintSubMenuHint(verb: string): void {
    const bindings = gameSettingsStore.get().keyBindings;
    this.add.text(
      36,
      488,
      `${keyboardCodeLabel(bindings.up)}/${keyboardCodeLabel(bindings.down)} ${verb} · `
      + `${keyboardCodeLabel(bindings.confirm)} / A confirms · ${keyboardCodeLabel(bindings.cancel)} / B back`,
      TEXT.small
    );
  }

  private move(delta: number): void {
    const battle = this.snapshot.battle;
    if (!battle || battle.phase !== "choosing" || this.resolving) return;
    if (this.subMenu === "skill") {
      if (battle.activeSkills.length === 0) return;
      this.subMenuIndex = Phaser.Math.Wrap(this.subMenuIndex + delta, 0, battle.activeSkills.length);
      this.render();
      return;
    }
    if (this.subMenu === "item") {
      if (battle.activeItems.length === 0) return;
      this.subMenuIndex = Phaser.Math.Wrap(this.subMenuIndex + delta, 0, battle.activeItems.length);
      this.render();
      return;
    }
    this.actionIndex = Phaser.Math.Wrap(this.actionIndex + delta, 0, actionsFor(this.snapshot.battle).length);
    this.render();
  }

  /**
   * Every awaited bridge call runs through `runResolving`. `resolving` is the
   * only input gate in this scene and, unlike WorldScene, there is no system
   * menu to escape to — so a call that rejects or fails to emit would freeze
   * combat with the pre-battle autosave as the newest state on disk.
   */
  private async runResolving(work: () => Promise<void>): Promise<void> {
    this.resolving = true;
    try {
      await work();
    } catch (error) {
      console.error("Battle action failed", error);
    } finally {
      this.resolving = false;
      this.render();
    }
  }

  private async confirm(): Promise<void> {
    const battle = this.snapshot.battle;
    if (!battle || this.resolving) return;
    if (battle.phase === "victory" || battle.phase === "defeat" || battle.phase === "escaped") {
      // Leave for the world scene in a finally: the transition sits behind an
      // awaited autosave, and a slow or failed write must not strand the player
      // on a victory panel where every key is a no-op.
      try {
        this.resolving = true;
        await this.bridge.leaveBattle();
      } catch (error) {
        console.error("Leaving battle failed", error);
      } finally {
        this.resolving = false;
        this.scene.start("world");
      }
      return;
    }
    if (this.subMenu === "skill") {
      const skill = battle.activeSkills[this.subMenuIndex];
      playSound(this, "sfx.heal");
      this.subMenu = "none";
      this.render();
      await this.runResolving(async () => {
        await this.bridge.chooseBattleAction("skill", skill?.id);
      });
      return;
    }
    if (this.subMenu === "item") {
      if (battle.activeItems.length === 0) return;
      const item = battle.activeItems[this.subMenuIndex];
      playSound(this, "sfx.heal");
      this.subMenu = "none";
      this.render();
      await this.runResolving(async () => {
        await this.bridge.chooseBattleAction("item", item?.id);
      });
      return;
    }
    const action = actionsFor(battle)[this.actionIndex];
    if (!action) return;
    if (action.id === "skill" && battle.activeSkills.length > 1) {
      this.subMenu = "skill";
      this.subMenuIndex = 0;
      this.render();
      return;
    }
    if (action.id === "item" && battle.activeItems.length > 1) {
      this.subMenu = "item";
      this.subMenuIndex = 0;
      this.render();
      return;
    }
    playSound(this, action.id === "skill" || action.id === "item" ? "sfx.heal" : action.id === "attack" ? "sfx.attack" : "sfx.confirm");
    await this.runResolving(async () => {
      // With exactly one usable item, skip the submenu but still name it
      // explicitly so a lone non-Root-Tonic item (e.g. only Ash Spice left)
      // resolves correctly instead of falling back to a Root Tonic check.
      await this.bridge.chooseBattleAction(action.id, action.id === "item" ? battle.activeItems[0]?.id : undefined);
    });
  }

  private titleCase(value: string): string {
    return value.split(" ").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
  }
}
