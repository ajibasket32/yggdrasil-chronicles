import type Phaser from "phaser";
import { gameSettingsStore } from "../settings";
import { assetBase } from "./runtime";

/**
 * Background music, at last.
 *
 * The game has been silent apart from foley — a 20-hour JRPG with no score.
 * This was blocked on licensing, not code: ASSETS.md forbids any asset without
 * verified provenance, and no compliant track existed until the five CC0
 * pieces now catalogued there (cynicmusic, pauliuw, RandomMind, all from
 * OpenGameArt with the dedication stated on each source page).
 *
 * One track plays at a time, owned by the Phaser game rather than any scene,
 * so a track survives scene changes and battle → world returns resume the
 * road's theme without a restart. `playMusic` cross-fades; calling it with the
 * track already playing is a no-op, which is what lets every scene simply
 * declare the music it wants on every redraw.
 */

/** Keys double as the asset manifest; BootScene loads exactly these. */
export const MUSIC_TRACKS = {
  "music.title": "/assets/vendor/music/the_field_of_dreams.mp3",
  "music.town": "/assets/vendor/music/TownTheme.mp3",
  "music.road": "/assets/vendor/music/The_Old_Tower_Inn.mp3",
  "music.dungeon": "/assets/vendor/music/song18_0.mp3",
  "music.battle": "/assets/vendor/music/battleThemeA.mp3"
} as const;

export type MusicKey = keyof typeof MUSIC_TRACKS;

/** The score for a place. Pure, so the mapping is testable without Phaser. */
export function musicForLocation(kind: "town" | "wilderness" | "dungeon"): MusicKey {
  if (kind === "town") return "music.town";
  if (kind === "dungeon") return "music.dungeon";
  return "music.road";
}

const CURRENT_KEY = "yggdrasil.music.current";
const FADE_MS = 650;

interface CurrentMusic {
  key: MusicKey;
  sound: Phaser.Sound.BaseSound;
}

function effectiveVolume(): number {
  const settings = gameSettingsStore.get();
  return settings.musicEnabled ? settings.musicVolume : 0;
}

/**
 * Fades a sound to `volume` in a way a scene change cannot orphan.
 *
 * The track is deliberately owned by the game so it outlives any scene — but a
 * tween is owned by the scene that created it. Leaving mid-cross-fade (walking
 * into a battle, say) killed the tween before its `onComplete`, so the outgoing
 * track was never stopped and never destroyed. Only the incoming one is in the
 * registry, so nothing could reach the survivor afterwards: two tracks playing
 * at once, one of them unstoppable. The incoming one, meanwhile, was left at
 * the volume 0 it started from — silent music. The shutdown hook simply
 * finishes whatever the tween was going to do.
 *
 * The event name is the literal "shutdown" because this module imports Phaser
 * as a type only, which is what keeps `musicForLocation` testable without it.
 */
function fadeSound(
  scene: Phaser.Scene,
  sound: Phaser.Sound.BaseSound,
  volume: number,
  onDone?: () => void
): void {
  let settled = false;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    scene.events.off("shutdown", finish);
    (sound as Phaser.Sound.WebAudioSound).setVolume(volume);
    onDone?.();
  };
  scene.events.once("shutdown", finish);
  scene.tweens.add({ targets: sound, volume, duration: FADE_MS, onComplete: finish });
}

/**
 * Cross-fades to `key`, or keeps playing if it is already current. Missing
 * audio (a stripped dev build, a failed decode) degrades to silence rather
 * than an error — music must never be the reason the game stops.
 */
/** Tracks already requested, so a failed or in-flight load is not asked for again. */
const requested = new Set<MusicKey>();

export function playMusic(scene: Phaser.Scene, key: MusicKey): void {
  const game = scene.game;
  const current = game.registry.get(CURRENT_KEY) as CurrentMusic | undefined;
  if (current?.key === key && current.sound.isPlaying) {
    return;
  }
  if (!scene.cache.audio.exists(key)) {
    // Nothing is preloaded: every track, including the title theme, arrives
    // when the scene that wants it asks. Requested once — a track that fails to
    // load leaves the game silent rather than retrying on every redraw, and
    // every scene declares its music on every redraw.
    if (requested.has(key)) return;
    requested.add(key);
    // This loader belongs to whichever scene is playing, not to BootScene, so
    // it has its own base to set for a build hosted under a subdirectory.
    scene.load.setBaseURL(assetBase());
    scene.load.audio(key, MUSIC_TRACKS[key]);
    scene.load.once("complete", () => {
      if (scene.cache.audio.exists(key)) playMusic(scene, key);
    });
    scene.load.start();
    return;
  }

  if (current?.sound.isPlaying) {
    const fading = current.sound;
    fadeSound(scene, fading, 0, () => {
      fading.stop();
      fading.destroy();
    });
  } else {
    current?.sound.destroy();
  }

  const next = game.sound.add(key, { loop: true, volume: 0 });
  next.play();
  fadeSound(scene, next, effectiveVolume());
  game.registry.set(CURRENT_KEY, { key, sound: next } satisfies CurrentMusic);
}

/** Fades the current track out entirely (endings, defeat). */
export function stopMusic(scene: Phaser.Scene): void {
  const game = scene.game;
  const current = game.registry.get(CURRENT_KEY) as CurrentMusic | undefined;
  if (!current) return;
  game.registry.remove(CURRENT_KEY);
  const fading = current.sound;
  if (!fading.isPlaying) {
    fading.destroy();
    return;
  }
  fadeSound(scene, fading, 0, () => {
    fading.stop();
    fading.destroy();
  });
}

/**
 * Applies the music preference to whatever is playing. Called from the
 * settings subscription in `main.ts`, so a toggle mid-track is heard
 * immediately rather than on the next scene change.
 */
export function applyMusicSettings(game: Phaser.Game): void {
  const current = game.registry.get(CURRENT_KEY) as CurrentMusic | undefined;
  if (!current) return;
  (current.sound as Phaser.Sound.WebAudioSound).setVolume(effectiveVolume());
}
