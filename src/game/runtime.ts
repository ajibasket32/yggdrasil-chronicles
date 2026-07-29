import type Phaser from "phaser";
import { gameSettingsStore } from "../settings";
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

/** Announces concise player-facing state from the canvas game to screen readers. */
export function announceGameStatus(message: string, documentRef: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  const status = documentRef?.querySelector<HTMLElement>("#game-status");
  if (status) status.textContent = message;
}

export function motionDuration(milliseconds: number): number {
  return gameSettingsStore.get().reducedMotion ? 0 : milliseconds;
}

export function playSound(scene: Phaser.Scene, key: string): void {
  if (scene.cache.audio.exists(key)) scene.sound.play(key);
}

export const COLORS = {
  ink: 0x101622,
  panel: 0x182333,
  panelLight: 0x24364a,
  cream: "#f5e7c6",
  muted: "#9fb0b5",
  gold: "#f2c66d",
  green: 0x477a63,
  rain: 0x6da0a8,
  danger: 0xb84a56
} as const;

export const TEXT = {
  title: { fontFamily: "Georgia, serif", fontSize: "38px", color: COLORS.cream },
  heading: { fontFamily: "Georgia, serif", fontSize: "20px", color: COLORS.cream },
  body: { fontFamily: "system-ui, sans-serif", fontSize: "14px", color: COLORS.cream },
  small: { fontFamily: "system-ui, sans-serif", fontSize: "11px", color: COLORS.muted }
} as const;
