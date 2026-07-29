import type Phaser from "phaser";
import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type GameSettings,
  type GameSettingsPatch
} from "./types";

/** The small Storage surface needed by this module, which keeps it testable. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type GameSettingsListener = (settings: Readonly<GameSettings>) => void;

export interface GameSettingsStore {
  get(): GameSettings;
  reload(): GameSettings;
  update(patch: GameSettingsPatch): GameSettings;
  subscribe(listener: GameSettingsListener): () => void;
}

type PhaserSettingsTarget = Pick<Phaser.Game, "canvas" | "sound">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function copySettings(settings: GameSettings): GameSettings {
  return { ...settings };
}

function settingsEqual(left: GameSettings, right: GameSettings): boolean {
  return left.highContrast === right.highContrast
    && left.reducedMotion === right.reducedMotion
    && left.soundEnabled === right.soundEnabled
    && left.soundVolume === right.soundVolume;
}

/**
 * Converts untrusted persisted data into the only settings shape the game uses.
 * Unknown versions deliberately reset to defaults instead of pretending they are
 * compatible with the current preference contract.
 */
export function sanitizeGameSettings(value: unknown): GameSettings {
  if (!isRecord(value) || value.version !== DEFAULT_GAME_SETTINGS.version) {
    return copySettings(DEFAULT_GAME_SETTINGS);
  }

  return {
    version: 1,
    highContrast: readBoolean(value.highContrast, DEFAULT_GAME_SETTINGS.highContrast),
    reducedMotion: readBoolean(value.reducedMotion, DEFAULT_GAME_SETTINGS.reducedMotion),
    soundEnabled: readBoolean(value.soundEnabled, DEFAULT_GAME_SETTINGS.soundEnabled),
    soundVolume: readVolume(value.soundVolume, DEFAULT_GAME_SETTINGS.soundVolume)
  };
}

/** Returns browser localStorage when it can be safely accessed, otherwise null. */
export function getBrowserSettingsStorage(): SettingsStorage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Loads valid preferences or returns defaults when browser storage is unavailable or corrupt. */
export function loadGameSettings(storage: SettingsStorage | null = getBrowserSettingsStorage()): GameSettings {
  if (!storage) {
    return copySettings(DEFAULT_GAME_SETTINGS);
  }

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    return raw === null ? copySettings(DEFAULT_GAME_SETTINGS) : sanitizeGameSettings(JSON.parse(raw) as unknown);
  } catch {
    return copySettings(DEFAULT_GAME_SETTINGS);
  }
}

/**
 * Merges a preference patch, persists the sanitized full document when possible,
 * and always returns the usable in-memory value. Storage failures never block play.
 */
export function saveGameSettings(
  patch: GameSettingsPatch,
  storage: SettingsStorage | null = getBrowserSettingsStorage()
): GameSettings {
  const current = loadGameSettings(storage);
  const safePatch = isRecord(patch) ? patch : {};
  const next = sanitizeGameSettings({ ...current, ...safePatch, version: 1 });

  if (storage) {
    try {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Privacy modes and full browser quotas must not make the game unusable.
    }
  }
  return next;
}

/** Creates a small stateful facade for UI code without introducing a framework store. */
export function createGameSettingsStore(storage: SettingsStorage | null = getBrowserSettingsStorage()): GameSettingsStore {
  let current = loadGameSettings(storage);
  const listeners = new Set<GameSettingsListener>();

  const notify = (): void => {
    const snapshot = copySettings(current);
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const replace = (next: GameSettings): GameSettings => {
    if (!settingsEqual(current, next)) {
      current = next;
      notify();
    }
    return copySettings(current);
  };

  return {
    get: () => copySettings(current),
    reload: () => replace(loadGameSettings(storage)),
    update: (patch) => replace(saveGameSettings(patch, storage)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/** Applies visual preference hooks to a document root and, optionally, a canvas. */
export function applyVisualGameSettings(
  settings: GameSettings,
  documentRef: Document | undefined = typeof document === "undefined" ? undefined : document,
  canvas?: HTMLCanvasElement
): void {
  const root = documentRef?.documentElement;
  root?.classList.toggle("game-high-contrast", settings.highContrast);
  root?.classList.toggle("game-reduced-motion", settings.reducedMotion);
  root?.style.setProperty("--game-motion-scale", settings.reducedMotion ? "0" : "1");
  root?.setAttribute("data-game-high-contrast", String(settings.highContrast));
  root?.setAttribute("data-game-reduced-motion", String(settings.reducedMotion));

  canvas?.classList.toggle("game-high-contrast", settings.highContrast);
  canvas?.classList.toggle("game-reduced-motion", settings.reducedMotion);
  canvas?.setAttribute("data-game-high-contrast", String(settings.highContrast));
  canvas?.setAttribute("data-game-reduced-motion", String(settings.reducedMotion));
}

/** Applies visual and audio preferences to a running Phaser game. */
export function applySettingsToPhaserGame(
  settings: GameSettings,
  game: PhaserSettingsTarget,
  documentRef: Document | undefined = typeof document === "undefined" ? undefined : document
): void {
  applyVisualGameSettings(settings, documentRef, game.canvas);
  game.sound.mute = !settings.soundEnabled;
  game.sound.volume = settings.soundVolume;
}
