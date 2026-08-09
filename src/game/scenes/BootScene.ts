import Phaser from "phaser";
import { COLORS } from "../runtime";
import { MUSIC_TRACKS } from "../music";
import { PORTRAIT_SHEET, PORTRAIT_SOURCE_SIZE } from "../../content";
import { DUNGEON_SHEET, OVERWORLD_SHEET, SOURCE_TILE } from "../tileset";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    // Terrain. Both sheets have been committed with verified CC0 provenance
    // since the asset catalog was written and were referenced by nothing.
    this.load.spritesheet(OVERWORLD_SHEET, "/assets/vendor/punyworld-overworld.png", {
      frameWidth: SOURCE_TILE,
      frameHeight: SOURCE_TILE
    });
    this.load.spritesheet(DUNGEON_SHEET, "/assets/vendor/everrogue-tileset.png", {
      frameWidth: SOURCE_TILE,
      frameHeight: SOURCE_TILE
    });
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
    this.load.spritesheet("sprite.enemy.boss", `${base}/Warrior-Red.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.image("sprite.monster.custodian", "/assets/vendor/monster-pack-2d/custodian.png");
    this.load.image("sprite.monster.gnawer", "/assets/vendor/monster-pack-2d/gnawer.png");
    this.load.image("sprite.monster.horned-beast", "/assets/vendor/monster-pack-2d/horned-beast.png");
    this.load.image("sprite.monster.kiln-core", "/assets/vendor/monster-pack-2d/kiln-core.png");
    this.load.image("sprite.monster.mote", "/assets/vendor/monster-pack-2d/mote.png");
    this.load.image("sprite.monster.moth", "/assets/vendor/monster-pack-2d/moth.png");
    this.load.image("sprite.monster.sentinel", "/assets/vendor/monster-pack-2d/sentinel.png");
    this.load.image("sprite.monster.slime", "/assets/vendor/monster-pack-2d/slime.png");
    this.load.image("sprite.monster.star-echo", "/assets/vendor/monster-pack-2d/star-echo.png");
    this.load.image("sprite.monster.wolf", "/assets/vendor/monster-pack-2d/wolf.png");
    this.load.image("sprite.monster.wraith", "/assets/vendor/monster-pack-2d/wraith.png");
    // Speaker portraits: EverFace (Efilheim, CC0), one row of eighteen faces.
    this.load.spritesheet(PORTRAIT_SHEET, "/assets/vendor/everface.png", {
      frameWidth: PORTRAIT_SOURCE_SIZE,
      frameHeight: PORTRAIT_SOURCE_SIZE
    });
    const audio = "/assets/vendor/kenney-rpg-audio/Audio";
    this.load.audio("sfx.confirm", `${audio}/bookFlip1.ogg`);
    this.load.audio("sfx.step", `${audio}/footstep04.ogg`);
    this.load.audio("sfx.attack", `${audio}/knifeSlice.ogg`);
    this.load.audio("sfx.heal", `${audio}/handleSmallLeather.ogg`);
    this.load.audio("sfx.door", `${audio}/doorOpen_1.ogg`);
    // The events below were previously silent: victory, defeat, a level
    // gained, coins changing hands, a menu cursor, and a missed strike.
    this.load.audio("sfx.victory", `${audio}/handleCoins.ogg`);
    this.load.audio("sfx.defeat", `${audio}/metalLatch.ogg`);
    this.load.audio("sfx.levelup", `${audio}/bookPlace1.ogg`);
    this.load.audio("sfx.coin", `${audio}/handleCoins2.ogg`);
    this.load.audio("sfx.cursor", `${audio}/cloth1.ogg`);
    this.load.audio("sfx.miss", `${audio}/cloth3.ogg`);
    // The score: five CC0 tracks catalogued in ASSETS.md. Only the title theme
    // is fetched here — the other four are loaded the first time a place asks
    // for them (see `playMusic`). Decoding all five up front held tens of
    // megabytes of PCM apiece before the title screen had drawn a pixel, most
    // of it for places the player had not reached and might never reach, on the
    // phones the touch build exists for. The full table still lives in music.ts,
    // so the release audit sees every path.
    this.load.audio("music.title", MUSIC_TRACKS["music.title"]);
  }

  create(): void {
    this.makeTextures();
    this.scene.start("title");
  }

  private makeTextures(): void {
    const graphics = this.add.graphics();

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

    graphics.destroy();
  }
}
