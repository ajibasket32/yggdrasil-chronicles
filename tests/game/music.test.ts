import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MUSIC_TRACKS, musicForLocation } from "../../src/game/music";
import { DEFAULT_GAME_SETTINGS, sanitizeGameSettings } from "../../src/settings";

describe("background music", () => {
  it("ships every track it promises, locally", () => {
    for (const [key, path] of Object.entries(MUSIC_TRACKS)) {
      expect(path.startsWith("/assets/vendor/music/"), key).toBe(true);
      const onDisk = resolve(__dirname, "../../public", path.replace(/^\//, ""));
      expect(existsSync(onDisk), `${key} -> ${onDisk}`).toBe(true);
    }
  });

  it("scores each kind of place differently, and battle differently again", () => {
    const town = musicForLocation("town");
    const road = musicForLocation("wilderness");
    const dungeon = musicForLocation("dungeon");
    expect(new Set([town, road, dungeon]).size).toBe(3);
    for (const key of [town, road, dungeon]) {
      expect(key).not.toBe("music.battle");
      expect(MUSIC_TRACKS[key]).toBeDefined();
    }
  });

  it("persists and heals the music preference like every other setting", () => {
    expect(DEFAULT_GAME_SETTINGS.musicEnabled).toBe(true);
    const restored = sanitizeGameSettings({
      ...DEFAULT_GAME_SETTINGS,
      musicEnabled: false,
      musicVolume: 0.2
    });
    expect(restored.musicEnabled).toBe(false);
    expect(restored.musicVolume).toBe(0.2);
    // Garbage heals to defaults rather than crashing playback maths.
    const healed = sanitizeGameSettings({ ...DEFAULT_GAME_SETTINGS, musicVolume: Number.NaN, musicEnabled: "yes" });
    expect(healed.musicVolume).toBe(DEFAULT_GAME_SETTINGS.musicVolume);
    expect(healed.musicEnabled).toBe(DEFAULT_GAME_SETTINGS.musicEnabled);
  });
});
