import Phaser from "phaser";
import type { GameLaunchOptions } from "./bridge";
import { DemoGameBridge } from "./demoBridge";
import { BRIDGE_KEY } from "./runtime";
import { BattleScene } from "./scenes/BattleScene";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { WorldScene } from "./scenes/WorldScene";

export function createYggdrasilGame(options: GameLaunchOptions): Phaser.Game {
  const bridge = options.bridge ?? new DemoGameBridge();
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: options.parent,
    width: options.width ?? 960,
    height: options.height ?? 540,
    backgroundColor: "#101622",
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    input: {
      gamepad: true
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: options.width ?? 960,
      height: options.height ?? 540
    },
    scene: [BootScene, TitleScene, WorldScene, BattleScene],
    callbacks: {
      preBoot: (game) => game.registry.set(BRIDGE_KEY, bridge)
    }
  };

  return new Phaser.Game(config);
}
