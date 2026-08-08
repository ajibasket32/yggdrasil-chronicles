import Phaser from "phaser";
import { gameSettingsStore } from "../../settings";
import type { BattleAction, BattleView, GameBridge, GameSnapshot } from "../bridge";
import { gamepadButtonAction, pollStickDirection, type StickRepeatState } from "../gamepadControls";
import { playMusic } from "../music";
import { keyboardActionForCode, keyboardCodeLabel } from "../keyboardControls";
import { announceGameStatus, announceScene, COLORS, fadeSceneIn, fadeSceneOutThen, fontPx, getBridge, mixColour, motionDuration, playSound, TEXT } from "../runtime";

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
  /**
   * The pools each actor was last drawn with.
   *
   * The scene repaints from scratch on every snapshot, so a bar has no memory
   * of its own: damage simply replaced one rectangle with a shorter one and the
   * single clearest piece of feedback in a JRPG — watching health drain — never
   * happened. Keeping the previous value is what lets the new bar animate from
   * where the old one was.
   */
  private readonly lastPools = new Map<string, { hp: number; mp: number; alive: boolean }>();
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
    // Phaser reuses the scene instance, so these survive the last battle. A
    // cursor left on a long action list pointed past a shorter one — and every
    // fight should open on ATTACK regardless.
    this.actionIndex = 0;
    this.subMenu = "none";
    this.subMenuIndex = 0;
    // Cleared with the cursor: a fresh fight must not drain its bars from the
    // numbers the last one ended on.
    this.lastPools.clear();
    this.cameras.main.setBackgroundColor(0x151923);
    // The world fades to black before starting this scene; without a matching
    // fade in, the fight snapped into full brightness out of that black.
    fadeSceneIn(this, 160);
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
    playMusic(this, "music.battle");
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
    // A lit patch of ground, built from filled ellipses that shrink and warm
    // toward the centre. Six concentric *outlines* read as a shooting target,
    // not as a clearing the fight is happening in.
    // A treeline on the horizon. The upper third of the arena was empty dark,
    // so every fight read as happening in a void with a rug in it.
    for (let index = 0; index < 26; index += 1) {
      // Positions from index arithmetic rather than a random source: the
      // backdrop must be identical between runs for screenshot comparison.
      const x = -20 + index * 39 + ((index * 37) % 23);
      const height = 54 + ((index * 53) % 46);
      const width = 26 + ((index * 29) % 18);
      graphics.fillStyle(mixColour(0x16262e, 0x1d3a38, ((index * 17) % 11) / 10), 1);
      graphics.fillEllipse(x, 196 - height * 0.35, width, height);
      graphics.fillRect(x - 2, 196 - height * 0.2, 4, height * 0.4);
    }
    // Mist between the treeline and the clearing, to seat one behind the other.
    for (let index = 0; index < 10; index += 1) {
      graphics.fillStyle(0x27424a, 0.06);
      graphics.fillRect(0, 190 + index * 5, 960, 6);
    }

    // A feathered outer edge first, so the clearing fades into the dark rather
    // than ending on the hard rim of a single filled blob.
    for (let halo = 0; halo < 10; halo += 1) {
      graphics.fillStyle(0x1d3130, 0.07);
      graphics.fillEllipse(480, 300, 880 - halo * 14, 176 - halo * 6);
    }
    for (let ring = 0; ring < 14; ring += 1) {
      const ratio = ring / 13;
      graphics.fillStyle(mixColour(0x223a39, 0x38594c, ratio), 1);
      graphics.fillEllipse(480, 300, 760 - ratio * 300, 128 - ratio * 54);
    }
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
    // One row a side, staggered slightly. Two rows put the back rank's readouts
    // through the command panel at y 340, and the old spacing left both sides
    // floating well above the ground they are meant to be standing on.
    party.forEach((actor, index) => {
      const x = 152 + index * 92;
      const y = 262 - (index % 2) * 24;
      const previous = this.lastPools.get(actor.id);
      const key = actor.spriteKey && this.textures.exists(actor.spriteKey) ? actor.spriteKey : "sprite.player";
      const sprite = this.add.image(x, y, key).setScale(1.8).setFlipX(true);
      if (actor.tint !== undefined) sprite.setTint(actor.tint);
      if (!actor.alive) sprite.setTint(0x4d545d);
      this.actorPositions.set(actor.id, { x, y, sprite });
      this.drawActiveActorMarker(x, y, actor.id === battle.activeActorId, actor.name);
      this.drawHealth(x - 48, y + 38, 96, actor.hp, actor.maxHp, true, previous?.hp ?? actor.hp);
      this.drawResource(x - 48, y + 47, 96, actor.mp, actor.maxMp, previous?.mp ?? actor.mp);
      this.drawActorLabel(x - 48, y + 54, `${actor.name}  ${actor.hp}/${actor.maxHp}`);
      this.drawStatuses(x - 48, y + 68, actor.statuses);
    });
    enemies.forEach((actor, index) => {
      const x = 596 + index * 90;
      const y = 250 - (index % 2) * 24;
      const key = actor.spriteKey && this.textures.exists(actor.spriteKey) ? actor.spriteKey : "sprite.enemy.small";
      // Enemy art is a smaller source texture than the party's, so matching
      // scale factors did not give matching sizes: the foes rendered as specks
      // beside a party member three times their height.
      const sprite = this.add.image(x, y, key).setScale(actor.maxHp > 80 ? 4.6 : 3.6);
      if (actor.tint !== undefined) sprite.setTint(actor.tint);
      const previous = this.lastPools.get(actor.id);
      if (!actor.alive) this.fadeDefeated(sprite, previous?.alive !== false);
      this.actorPositions.set(actor.id, { x, y, sprite });
      this.drawActiveActorMarker(x, y, actor.id === battle.activeActorId, this.titleCase(actor.name));
      this.drawHealth(x - 48, y + 46, 96, actor.hp, actor.maxHp, false, previous?.hp ?? actor.hp);
      this.drawActorLabel(x - 48, y + 55, `${this.titleCase(actor.name)}  ${actor.hp}/${actor.maxHp}`);
      this.drawStatuses(x - 48, y + 69, actor.statuses);
    });

    // Recorded after painting, so the next repaint animates from what the
    // player is looking at right now rather than from the newest numbers.
    for (const actor of battle.actors) {
      this.lastPools.set(actor.id, { hp: actor.hp, mp: actor.mp, alive: actor.alive });
    }
  }

  /**
   * A defeated foe dims out instead of being drawn faint from the first frame.
   * `justFell` is false on every repaint after the one that killed it, so the
   * fade plays once and the body then simply stays dim.
   */
  private fadeDefeated(sprite: Phaser.GameObjects.Image, justFell: boolean): void {
    const duration = motionDuration(justFell ? 420 : 0);
    if (duration <= 0) {
      sprite.setAlpha(0.25);
      return;
    }
    sprite.setAlpha(1);
    this.tweens.add({ targets: sprite, alpha: 0.25, duration, ease: "Quad.easeIn" });
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

    // Reduced Motion shows the number, it does not delete it. The label starts
    // invisible and both tweens collapse to zero duration, so it faded in and
    // straight back out and destroyed itself inside one frame: a Reduced Motion
    // player saw no damage, healing, miss or status numbers at all. Show it
    // plainly and hold it instead.
    if (motionDuration(1) === 0) {
      label.setAlpha(1);
      this.time.delayedCall(900, () => label.destroy());
      return;
    }

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

  private drawResource(x: number, y: number, width: number, mp: number, maxMp: number, previousMp: number): void {
    if (maxMp <= 0) return;
    this.add.rectangle(x, y, width, 4, 0x11151c).setOrigin(0);
    const fill = this.add.rectangle(x, y, width, 4, 0x5f8fd0).setOrigin(0);
    this.drainBar(fill, mp, previousMp, maxMp, 240);
  }

  /** Status tokens, so the one screen where conditions decide play finally shows them. */
  private drawStatuses(x: number, y: number, statuses: BattleView["actors"][number]["statuses"]): void {
    if (statuses.length === 0) return;
    const text = statuses.map(({ id, remainingTurns }) => `${id.slice(0, 3).toUpperCase()}${remainingTurns}`).join(" ");
    this.add.text(x, y, text, { ...TEXT.small, fontSize: fontPx(9), color: COLORS.gold }).setOrigin(0);
  }

  private drawActiveActorMarker(x: number, y: number, active: boolean, name: string): void {
    if (!active) return;
    const ring = this.add.circle(x, y, 42, 0xf2c66d, 0.1).setStrokeStyle(3, 0xf2c66d);
    // A slow breath on the ring. Whose turn it is was drawn as a perfectly
    // still circle, which on a screen where nothing else moves between actions
    // reads as a frozen game rather than as one waiting for you.
    const pulse = motionDuration(900);
    if (pulse > 0) {
      this.tweens.add({
        targets: ring,
        scale: 1.07,
        duration: pulse,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }
    this.add.text(x, y - 62, "ACTIVE", {
      ...TEXT.small,
      color: COLORS.gold,
      backgroundColor: "#101622dd",
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5);
    this.add.text(28, 74, `ACTING: ${name.toUpperCase()}`, { ...TEXT.small, color: COLORS.gold });
  }

  private drawHealth(
    x: number,
    y: number,
    width: number,
    hp: number,
    maxHp: number,
    party: boolean,
    previousHp: number
  ): void {
    this.add.rectangle(x, y, width, 7, 0x11151c).setOrigin(0);
    const fill = this.add.rectangle(x, y, width, 7, party ? 0x64ba83 : 0xc95d63).setOrigin(0);
    this.drainBar(fill, hp, previousHp, maxHp, 300);
  }

  /**
   * Scales a bar from what it last read to what it reads now.
   *
   * Under Reduced Motion the end state is applied directly rather than tweened
   * over zero milliseconds: a zero-length tween that never reports completion
   * would leave the bar frozen at the *old* value, which is worse than not
   * animating at all — it would be actively lying about the actor's health.
   */
  private drainBar(
    fill: Phaser.GameObjects.Rectangle,
    value: number,
    previous: number,
    maximum: number,
    milliseconds: number
  ): void {
    const ratio = maximum > 0 ? Phaser.Math.Clamp(value / maximum, 0, 1) : 0;
    const from = maximum > 0 ? Phaser.Math.Clamp(previous / maximum, 0, 1) : 0;
    const duration = motionDuration(milliseconds);
    if (duration <= 0 || from === ratio) {
      fill.setScale(ratio, 1);
      return;
    }
    fill.setScale(from, 1);
    this.tweens.add({
      targets: fill,
      scaleX: ratio,
      duration,
      ease: "Quad.easeOut"
    });
  }

  /**
   * The name and pool readout, below both bars rather than between them. It
   * used to be drawn at a fixed nine pixels under the health bar, which is
   * where the magic bar is, so every party member's name was painted across
   * their own MP.
   */
  private drawActorLabel(x: number, y: number, label: string): void {
    this.add.text(x, y, label, { ...TEXT.small, fontSize: fontPx(9) }).setOrigin(0);
  }

  private paintCommandPanel(battle: BattleView): void {
    this.add.rectangle(0, 340, 960, 200, COLORS.panel).setOrigin(0);
    this.add.rectangle(0, 340, 960, 2, 0x6f8f82).setOrigin(0);
    if (battle.phase === "victory" || battle.phase === "defeat" || battle.phase === "escaped") {
      const label = battle.phase === "victory" ? "VICTORY" : battle.phase === "escaped" ? "SAFE WITHDRAWAL" : "THE PARTY FALLS";
      const banner = this.add.text(38, 370, label, {
        ...TEXT.title,
        color: battle.phase === "defeat" ? "#e46e76" : COLORS.gold
      });
      // The banner lands rather than appearing. A fight's outcome is the one
      // moment in a battle that deserves a beat of its own, and it was drawn
      // in the same flat repaint as the hint text under it.
      const land = motionDuration(260);
      if (land > 0) {
        banner.setScale(battle.phase === "defeat" ? 0.96 : 1.16).setAlpha(0);
        this.tweens.add({
          targets: banner,
          scale: 1,
          alpha: 1,
          duration: land,
          ease: battle.phase === "defeat" ? "Sine.easeOut" : "Back.easeOut"
        });
      }
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
      `${keyboardCodeLabel(bindings.up[0] ?? "")}/${keyboardCodeLabel(bindings.down[0] ?? "")} moves actions · `
      + `${keyboardCodeLabel(bindings.confirm[0] ?? "")} / A confirms · ${keyboardCodeLabel(bindings.cancel[0] ?? "")} / B selects escape`,
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
      `${keyboardCodeLabel(bindings.up[0] ?? "")}/${keyboardCodeLabel(bindings.down[0] ?? "")} ${verb} · `
      + `${keyboardCodeLabel(bindings.confirm[0] ?? "")} / A confirms · ${keyboardCodeLabel(bindings.cancel[0] ?? "")} / B back`,
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
        // Every other transition in the game fades; leaving a battle was the
        // one hard cut, so every fight ended on a jolt.
        fadeSceneOutThen(this, () => this.scene.start("world"));
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
