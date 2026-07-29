import { describe, expect, it } from "vitest";
import {
  applySettingsToPhaserGame,
  applyVisualGameSettings,
  createGameSettingsStore,
  loadGameSettings,
  sanitizeGameSettings,
  saveGameSettings,
  type SettingsStorage
} from "../../src/settings";
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from "../../src/settings/types";

class MemorySettingsStorage implements SettingsStorage {
  readonly values = new Map<string, string>();
  throwOnRead = false;
  throwOnWrite = false;

  getItem(key: string): string | null {
    if (this.throwOnRead) {
      throw new Error("storage unavailable");
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnWrite) {
      throw new Error("quota exceeded");
    }
    this.values.set(key, value);
  }
}

function makeClassList() {
  const values = new Set<string>();
  return {
    toggle: (name: string, enabled?: boolean) => {
      if (enabled) {
        values.add(name);
      } else {
        values.delete(name);
      }
      return Boolean(enabled);
    },
    has: (name: string) => values.has(name)
  };
}

function makeElement() {
  const attributes = new Map<string, string>();
  const properties = new Map<string, string>();
  return {
    classList: makeClassList(),
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    attribute: (name: string) => attributes.get(name),
    property: (name: string) => properties.get(name)
  };
}

describe("persistent game settings", () => {
  it("returns defaults for unavailable, malformed, and incompatible storage", () => {
    const storage = new MemorySettingsStorage();
    storage.values.set(SETTINGS_STORAGE_KEY, "not json");
    expect(loadGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);

    storage.values.set(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 2, highContrast: true }));
    expect(loadGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);

    storage.throwOnRead = true;
    expect(loadGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);
    expect(loadGameSettings(null)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it("sanitizes each persisted field and clamps finite volume values", () => {
    expect(sanitizeGameSettings({
      version: 1,
      highContrast: true,
      reducedMotion: "yes",
      soundEnabled: false,
      soundVolume: 4
    })).toEqual({ ...DEFAULT_GAME_SETTINGS, highContrast: true, soundEnabled: false, soundVolume: 1 });
    expect(sanitizeGameSettings({ version: 1, soundVolume: Number.NaN }).soundVolume)
      .toBe(DEFAULT_GAME_SETTINGS.soundVolume);
  });

  it("merges settings without accepting malformed runtime patches", () => {
    const storage = new MemorySettingsStorage();
    const saved = saveGameSettings({ highContrast: true, soundVolume: 0.2 }, storage);
    expect(saved).toEqual({ ...DEFAULT_GAME_SETTINGS, highContrast: true, soundVolume: 0.2 });
    expect(JSON.parse(storage.values.get(SETTINGS_STORAGE_KEY) ?? "{}")).toEqual(saved);

    const invalid = saveGameSettings({ soundEnabled: "loud" } as unknown as { soundEnabled: boolean }, storage);
    expect(invalid.soundEnabled).toBe(true);
    expect(invalid.highContrast).toBe(true);
  });

  it("keeps a usable memory value when writes fail", () => {
    const storage = new MemorySettingsStorage();
    storage.throwOnWrite = true;
    expect(saveGameSettings({ reducedMotion: true }, storage)).toMatchObject({ reducedMotion: true });
    expect(storage.values.size).toBe(0);
  });

  it("notifies subscribers only when a store setting actually changes", () => {
    const store = createGameSettingsStore(new MemorySettingsStorage());
    const seen: boolean[] = [];
    const unsubscribe = store.subscribe((settings) => seen.push(settings.highContrast));

    store.update({ highContrast: true });
    store.update({ highContrast: true });
    unsubscribe();
    store.update({ highContrast: false });

    expect(seen).toEqual([true]);
    expect(store.get().highContrast).toBe(false);
  });

  it("applies visual hooks and Phaser sound state without a live browser", () => {
    const root = makeElement();
    const canvas = makeElement();
    const fakeDocument = { documentElement: root } as unknown as Document;
    const fakeCanvas = canvas as unknown as HTMLCanvasElement;
    const game = {
      canvas: fakeCanvas,
      sound: { mute: false, volume: 1 }
    };

    applySettingsToPhaserGame(
      { version: 1, highContrast: true, reducedMotion: true, soundEnabled: false, soundVolume: 0.3 },
      game as never,
      fakeDocument
    );

    expect(root.classList.has("game-high-contrast")).toBe(true);
    expect(root.classList.has("game-reduced-motion")).toBe(true);
    expect(root.property("--game-motion-scale")).toBe("0");
    expect(canvas.attribute("data-game-high-contrast")).toBe("true");
    expect(game.sound).toEqual({ mute: true, volume: 0.3 });

    applyVisualGameSettings(DEFAULT_GAME_SETTINGS, fakeDocument, fakeCanvas);
    expect(root.classList.has("game-high-contrast")).toBe(false);
    expect(root.property("--game-motion-scale")).toBe("1");
  });
});
