import type Phaser from "phaser";
import { gameSettingsStore, type GameSettings, type TextSize } from "../settings";
import type { GameBridge } from "./bridge";

export const BRIDGE_KEY = "yggdrasil.bridge";

export function getBridge(scene: Phaser.Scene): GameBridge {
  const bridge = scene.registry.get(BRIDGE_KEY) as GameBridge | undefined;
  if (!bridge) throw new Error("GameBridge was not registered before scene creation");
  return bridge;
}

export function announceScene(
  sceneName: "title" | "world" | "battle",
  documentRef: Document | undefined = typeof document === "undefined" ? undefined : document
): void {
  const app = documentRef?.querySelector<HTMLElement>("#app");
  if (app) app.dataset.scene = sceneName;
  const sceneMessages = {
    title: "Title screen. Use your assigned navigation keys to choose an option, then confirm.",
    world: "Exploration screen. Use your assigned movement keys to travel and the menu key for system options.",
    battle: "Battle screen. Use your assigned navigation keys to choose an action and confirm it."
  } as const;
  announceGameStatus(sceneMessages[sceneName], documentRef);
}

/**
 * Publishes a scene-local UI state onto the `#app` element, alongside the
 * snapshot fields `main.ts` already mirrors there. Browser tests otherwise
 * have to infer "is a panel open" from keypress counts, which turns every
 * authored line-length change into a broken test.
 */
export function setSceneFlag(
  name: string,
  value: string,
  documentRef: Document | undefined = typeof document === "undefined" ? undefined : document
): void {
  const app = documentRef?.querySelector<HTMLElement>("#app");
  if (app) app.dataset[name] = value;
}

/** Announces concise player-facing state from the canvas game to screen readers. */
export function announceGameStatus(message: string, documentRef: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  const status = documentRef?.querySelector<HTMLElement>("#game-status");
  if (status) status.textContent = message;
}

export function motionDuration(milliseconds: number): number {
  return gameSettingsStore.get().reducedMotion ? 0 : milliseconds;
}

/**
 * Fades a freshly built object in, for panels that used to appear whole on the
 * frame they were created.
 *
 * Under Reduced Motion the object is left exactly as built — fully visible.
 * Setting alpha to 0 first and relying on a zero-length tween to raise it again
 * is the shape that once made every toast in this game invisible.
 */
export function revealObject(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject & { setAlpha: (value: number) => unknown },
  milliseconds = 130
): void {
  const duration = motionDuration(milliseconds);
  if (duration <= 0) return;
  target.setAlpha(0);
  scene.tweens.add({ targets: target, alpha: 1, duration, ease: "Quad.easeOut" });
}

/** The colour every scene fades through, so no transition looks like a different game. */
const FADE_INK = [10, 18, 24] as const;

/**
 * Fades a scene in from the transition colour.
 *
 * Safe to call unconditionally: under Reduced Motion it does nothing at all
 * rather than running a zero-length fade, because the camera is already fully
 * visible and the only thing a zero-length fade can do is flicker.
 */
export function fadeSceneIn(scene: Phaser.Scene, milliseconds = 220): void {
  const duration = motionDuration(milliseconds);
  if (duration <= 0) return;
  scene.cameras.main.fadeIn(duration, ...FADE_INK);
}

/**
 * Fades out, then runs `action` — starting the next scene, usually.
 *
 * Two deliberate choices. `action` runs off a timer rather than the camera's
 * completion event, so a camera that never reports completion cannot stand
 * between the player and the next screen. And under Reduced Motion the fade is
 * skipped entirely and `action` runs immediately, rather than fading to black
 * over zero milliseconds and hoping something clears it — this project has
 * already shipped one bug where Reduced Motion made an element vanish instead
 * of appear, and a black screen you cannot leave is the worse version of it.
 */
export function fadeSceneOutThen(scene: Phaser.Scene, action: () => void, milliseconds = 200): void {
  const duration = motionDuration(milliseconds);
  if (duration <= 0) {
    action();
    return;
  }
  scene.cameras.main.fadeOut(duration, ...FADE_INK);
  scene.time.delayedCall(duration + 10, action);
}

export function playSound(scene: Phaser.Scene, key: string): void {
  // Effects carry their own preference. They used to ride the global sound
  // manager's mute and volume, which the music shares — so silencing effects
  // silenced the score too.
  const settings = gameSettingsStore.get();
  if (!settings.soundEnabled) return;
  if (scene.cache.audio.exists(key)) scene.sound.play(key, { volume: settings.soundVolume });
}

export interface Palette {
  ink: number;
  panel: number;
  panelLight: number;
  cream: string;
  muted: string;
  gold: string;
  green: number;
  rain: number;
  danger: number;
}

const STANDARD_PALETTE: Readonly<Palette> = {
  ink: 0x101622,
  panel: 0x182333,
  panelLight: 0x24364a,
  cream: "#f5e7c6",
  muted: "#9fb0b5",
  gold: "#f2c66d",
  green: 0x477a63,
  rain: 0x6da0a8,
  danger: 0xb84a56
};

/**
 * High Contrast, inside the canvas.
 *
 * The setting used to be a single CSS `filter` on the canvas element, which
 * raises contrast uniformly — including on the parts that were already
 * legible — and does nothing for the actual problem: muted grey body text on a
 * mid-blue panel. This palette darkens every panel to near-black and lifts
 * every text colour to full strength, which is what the setting promises.
 */
const HIGH_CONTRAST_PALETTE: Readonly<Palette> = {
  ink: 0x000000,
  panel: 0x05070c,
  panelLight: 0x101826,
  cream: "#ffffff",
  muted: "#e2ecf0",
  gold: "#ffd84d",
  green: 0x2f6f52,
  rain: 0x8fd0da,
  danger: 0xff6b78
};

/**
 * Live palette. Mutated in place by `applyPresentationSettings` rather than
 * swapped, because a hundred call sites read `COLORS.cream` at draw time; this
 * way a preference change reaches all of them without threading a theme object
 * through every scene.
 */
export const COLORS: Palette = { ...STANDARD_PALETTE };

const TEXT_SCALES: Readonly<Record<TextSize, number>> = {
  small: 0.88,
  medium: 1,
  large: 1.28
};

let textScale = 1;

/**
 * A font size in px, scaled by the player's text-size preference. Call sites
 * that need a size other than the four in `TEXT` use this instead of a literal,
 * so the setting reaches the 9px HP readouts too.
 */
/** Blends two packed RGB colours, for gradients Phaser's Graphics cannot do itself. */
export function mixColour(from: number, to: number, ratio: number): number {
  const t = Math.max(0, Math.min(1, ratio));
  const blend = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t) & 0xff;
  };
  return (blend(16) << 16) | (blend(8) << 8) | blend(0);
}

export function fontPx(basePx: number): string {
  return `${Math.max(8, Math.round(basePx * textScale))}px`;
}

/**
 * How many rows fit where `baseRows` fitted at the default text size.
 *
 * Every list panel is masked to a fixed panel height while its row height
 * scales with the player's preference, so a row budget counted once at
 * `medium` overflows at `large`: the tail is clipped, and the clipped tail
 * includes the "▼ more below" line that was the only sign more existed.
 * Panels ask for their budget through this instead of a constant.
 */
export function rowsThatFit(baseRows: number): number {
  return Math.max(1, Math.floor(baseRows / textScale));
}

const BASE_TEXT_SIZES = { title: 38, heading: 20, body: 14, small: 11 } as const;

export const TEXT = {
  title: { fontFamily: "Georgia, serif", fontSize: "38px", color: COLORS.cream },
  heading: { fontFamily: "Georgia, serif", fontSize: "20px", color: COLORS.cream },
  body: { fontFamily: "system-ui, sans-serif", fontSize: "14px", color: COLORS.cream },
  small: { fontFamily: "system-ui, sans-serif", fontSize: "11px", color: COLORS.muted }
};

/**
 * Pushes accessibility preferences into the canvas palette and type scale.
 * Scenes redraw from `COLORS` and `TEXT`, so calling this before a redraw is
 * all that is needed to restyle the game.
 */
export function applyPresentationSettings(settings: GameSettings): void {
  Object.assign(COLORS, settings.highContrast ? HIGH_CONTRAST_PALETTE : STANDARD_PALETTE);
  textScale = TEXT_SCALES[settings.textSize] ?? 1;
  TEXT.title = { ...TEXT.title, fontSize: fontPx(BASE_TEXT_SIZES.title), color: COLORS.cream };
  TEXT.heading = { ...TEXT.heading, fontSize: fontPx(BASE_TEXT_SIZES.heading), color: COLORS.cream };
  TEXT.body = { ...TEXT.body, fontSize: fontPx(BASE_TEXT_SIZES.body), color: COLORS.cream };
  TEXT.small = { ...TEXT.small, fontSize: fontPx(BASE_TEXT_SIZES.small), color: COLORS.muted };
}
