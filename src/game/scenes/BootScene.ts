import Phaser from "phaser";
import { COLORS } from "../runtime";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    const base = "/assets/vendor/puny-characters/Puny-Characters";
    this.load.spritesheet("sprite.player", `${base}/Warrior-Blue.png`, {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.spritesheet("sprite.npc", `${base}/Soldier-Red.png`, {
      frameWidth: 32,
      frameHeight: 32
    });
    // Battle party portraits: one sheet per starting job family so each
    // slot in the party is visually distinct, not a repeated sprite.player.
    this.load.spritesheet("sprite.job.vanguard", `${base}/Warrior-Blue.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.job.ranger", `${base}/Archer-Green.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.job.mender", `${base}/Mage-Cyan.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.job.shaper", `${base}/Mage-Red.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.job.trickster", `${base}/Archer-Purple.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.job.warden", `${base}/Warrior-Red.png`, { frameWidth: 32, frameHeight: 32 });
    // Battle enemy portraits: a small/humanoid/soldier/boss split so
    // creatures, wraiths, sentinels, and named bosses read as different foes.
    this.load.spritesheet("sprite.enemy.small", `${base}/Slime.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.enemy.humanoid", `${base}/Soldier-Yellow.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("sprite.enemy.boss", `${base}/Character-Base.png`, { frameWidth: 32, frameHeight: 32 });
    const audio = "/assets/vendor/kenney-rpg-audio/Audio";
    this.load.audio("sfx.confirm", `${audio}/bookFlip1.ogg`);
    this.load.audio("sfx.step", `${audio}/footstep04.ogg`);
    this.load.audio("sfx.attack", `${audio}/knifeSlice.ogg`);
    this.load.audio("sfx.heal", `${audio}/handleSmallLeather.ogg`);
    this.load.audio("sfx.door", `${audio}/doorOpen_1.ogg`);
  }

  create(): void {
    this.makeTextures();
    this.scene.start("title");
  }

  private makeTextures(): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x79a76f).fillRect(0, 0, 16, 16);
    graphics.fillStyle(0x6a9465).fillRect(0, 12, 16, 4);
    graphics.fillStyle(0x8db87b).fillRect(2, 2, 3, 2).fillRect(11, 7, 2, 2);
    graphics.generateTexture("tile.grass", 16, 16);
    graphics.clear();

    graphics.fillStyle(0x55747a).fillRect(0, 0, 16, 16);
    graphics.fillStyle(0x6c9297).fillRect(0, 3, 16, 2).fillRect(0, 10, 16, 1);
    graphics.generateTexture("tile.water", 16, 16);
    graphics.clear();

    graphics.fillStyle(0x75685b).fillRect(0, 0, 16, 16);
    graphics.fillStyle(0x91806a).fillRect(1, 2, 6, 2).fillRect(9, 10, 5, 2);
    graphics.generateTexture("tile.stone", 16, 16);
    graphics.clear();

    graphics.fillStyle(0x302c39).fillRect(0, 0, 16, 16);
    graphics.fillStyle(0x55465c).fillRect(1, 1, 14, 2).fillRect(4, 8, 8, 2);
    graphics.generateTexture("tile.dungeon", 16, 16);
    graphics.clear();

    if (!this.textures.exists("sprite.player")) {
      graphics.fillStyle(0xd9e3dc).fillRect(10, 4, 12, 10);
      graphics.fillStyle(COLORS.green).fillRect(8, 14, 16, 14);
      graphics.fillStyle(0x232d36).fillRect(10, 28, 4, 4).fillRect(18, 28, 4, 4);
      graphics.fillStyle(0x202531).fillRect(12, 8, 2, 2).fillRect(18, 8, 2, 2);
      graphics.generateTexture("sprite.player", 32, 32);
      graphics.clear();
    }

    if (!this.textures.exists("sprite.npc")) {
      graphics.fillStyle(0xefc58e).fillRect(10, 4, 12, 10);
      graphics.fillStyle(0xb86b58).fillRect(8, 14, 16, 14);
      graphics.fillStyle(0x28303a).fillRect(10, 28, 4, 4).fillRect(18, 28, 4, 4);
      graphics.fillStyle(0x1d222b).fillRect(12, 8, 2, 2).fillRect(18, 8, 2, 2);
      graphics.generateTexture("sprite.npc", 32, 32);
      graphics.clear();
    }

    graphics.fillStyle(0x452f39).fillCircle(16, 16, 13);
    graphics.fillStyle(0xb84a56).fillTriangle(5, 25, 16, 3, 27, 25);
    graphics.fillStyle(0xf2c66d).fillCircle(16, 14, 3);
    graphics.generateTexture("sprite.enemy", 32, 32);
    graphics.destroy();
  }
}
