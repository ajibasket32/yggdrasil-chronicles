import type Phaser from "phaser";
import type { GameBridge } from "./bridge";

export const BRIDGE_KEY = "yggdrasil.bridge";

export function getBridge(scene: Phaser.Scene): GameBridge {
  const bridge = scene.registry.get(BRIDGE_KEY) as GameBridge | undefined;
  if (!bridge) throw new Error("GameBridge was not registered before scene creation");
  return bridge;
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

